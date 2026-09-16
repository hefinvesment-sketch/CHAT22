import { RealDataProviders } from './realDataProviders';

export interface TokenMetadata {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  liquidityUsd: number | null;
  securityFlags: {
    mintAuthorityRevoked: boolean;
    freezeAuthorityRevoked: boolean;
    lpBurned: boolean;
  };
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

  public static async resolveToken(address: string): Promise<TokenMetadata | 'INSUFFICIENT_DATA'> {
    const cached = this.cache.get(address);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    try {
      // 1. Helius DAS getAsset
      const asset = await RealDataProviders.getHeliusAsset(address) as HeliusAssetResult | null;
      if (asset) {
        const metadata: TokenMetadata = {
          address,
          symbol: asset.content?.metadata?.symbol || 'UNKNOWN',
          name: asset.content?.metadata?.name || 'Unknown Token',
          decimals: asset.token_info?.decimals ?? 9,
          liquidityUsd: null,
          securityFlags: {
            mintAuthorityRevoked: !asset.token_info?.mint_authority,
            freezeAuthorityRevoked: !asset.token_info?.freeze_authority,
            lpBurned: false, // Helius DAS doesn't easily show LP burn status directly without more queries
          }
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
        const metadata: TokenMetadata = {
          address,
          symbol: tokenInfo.symbol || 'UNKNOWN',
          name: tokenInfo.name || 'Unknown Token',
          decimals: tokenInfo.decimals ?? 9,
          liquidityUsd: tokenInfo.liquidity ?? null,
          securityFlags: {
            mintAuthorityRevoked: false, // Default to unsafe if unknown
            freezeAuthorityRevoked: false,
            lpBurned: false,
          }
        };
        this.cache.set(address, { data: metadata, expiresAt: Date.now() + this.CACHE_TTL_MS });
        return metadata;
      }
    } catch (err) {
      console.warn(`[TokenResolver] Birdeye resolution failed for ${address}:`, err);
    }

    return 'INSUFFICIENT_DATA';
  }
}
