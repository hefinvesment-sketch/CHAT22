import { RealDataProviders } from './realDataProviders';

export function revokedToAuthorityPresent(
  revoked: boolean | null | undefined
): boolean | null {
  if (revoked == null) return null;
  return !revoked;
}

export interface TokenMetadata {
  address: string;
  symbol: string;
  name: string | null;
  decimals: number | null;
  liquidityUsd: number | null;
  securityFlags: {
    mintAuthorityRevoked: boolean | null;
    freezeAuthorityRevoked: boolean | null;
    lpBurned: boolean | null;
  } | null;
  metadataStatus: 'COMPLETE' | 'PARTIAL' | 'INSUFFICIENT_DATA';
}

interface HeliusAssetResult {
  content?: {
    metadata?: {
      symbol?: string;
      name?: string;
    };
  };
  token_info?: {
    decimals?: number;
    mint_authority?: string | null;
    freeze_authority?: string | null;
  };
}

interface BirdeyeTokenOverviewResult {
  symbol?: string;
  name?: string;
  decimals?: number;
  liquidity?: number | null;
}

export class TokenResolver {
  private static cache = new Map<string, { data: TokenMetadata; expiresAt: number }>();
  private static CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

  public static async resolveToken(address: string): Promise<TokenMetadata> {
    const cached = this.cache.get(address);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    const shortMint = `${address.slice(0, 4)}...${address.slice(-4)}`;

    try {
      // 1. Helius DAS getAsset
      const asset = await RealDataProviders.getHeliusAsset(address) as HeliusAssetResult | null;

      if (asset) {
        const symbol = asset.content?.metadata?.symbol || shortMint;
        const name = asset.content?.metadata?.name || null;
        const decimals = asset.token_info?.decimals ?? null;
        
        const mintAuthorityRevoked = asset.token_info && 'mint_authority' in asset.token_info
          ? asset.token_info.mint_authority === null
          : null;
          
        const freezeAuthorityRevoked = asset.token_info && 'freeze_authority' in asset.token_info
          ? asset.token_info.freeze_authority === null
          : null;

        const metadataStatus = (symbol !== shortMint && decimals !== null) ? 'COMPLETE' : 'PARTIAL';

        const metadata: TokenMetadata = {
          address,
          symbol,
          name,
          decimals,
          liquidityUsd: null,
          securityFlags: {
            mintAuthorityRevoked,
            freezeAuthorityRevoked,
            lpBurned: null,
          },
          metadataStatus
        };

        this.cache.set(address, { data: metadata, expiresAt: Date.now() + this.CACHE_TTL_MS });
        return metadata;
      }
    } catch (err) {
      console.warn(`[TokenResolver] Helius resolution failed for ${address}:`, err);
    }

    try {
      // 2. Birdeye Fallback
      const tokenInfo = await RealDataProviders.getBirdeyeTokenInfo(address) as BirdeyeTokenOverviewResult | null;

      if (tokenInfo) {
        const symbol = tokenInfo.symbol || shortMint;
        const name = tokenInfo.name || null;
        const decimals = tokenInfo.decimals ?? null;
        
        const metadataStatus = (symbol !== shortMint && decimals !== null) ? 'COMPLETE' : 'PARTIAL';

        const metadata: TokenMetadata = {
          address,
          symbol,
          name,
          decimals,
          liquidityUsd: tokenInfo.liquidity ?? null,
          securityFlags: {
            mintAuthorityRevoked: null,
            freezeAuthorityRevoked: null,
            lpBurned: null,
          },
          metadataStatus
        };

        this.cache.set(address, { data: metadata, expiresAt: Date.now() + this.CACHE_TTL_MS });
        return metadata;
      }
    } catch (err) {
      console.warn(`[TokenResolver] Birdeye resolution failed for ${address}:`, err);
    }

    const fallback: TokenMetadata = {
      address,
      symbol: shortMint,
      name: null,
      decimals: null,
      liquidityUsd: null,
      securityFlags: null,
      metadataStatus: 'INSUFFICIENT_DATA'
    };
    
    return fallback;
  }
}
