import { StorageAdapter } from './persistence';
import { BirdeyeProvider } from './providers/birdeyeProvider';
import { TokenMarketData } from '../types';

export class TokenEnrichmentService {
  /**
   * Called primarily when a new token is observed by Helius.
   * It checks if we have enriched it recently, and if not, triggers a Birdeye request.
   */
  public static async enrichTokenIfNeeded(
    mintAddress: string,
    storage: StorageAdapter
  ): Promise<void> {
    try {
      // 1. Fetch current token data from DB (if any)
      const existingTokens = await storage.getTokens();
      const token = existingTokens.find(t => t.address === mintAddress);

      const now = Date.now();
      const enrichmentTtlMs = parseInt(process.env.BIRDEYE_TOKEN_OVERVIEW_TTL_MS || '1800000'); // 30 mins

      // 2. Check if we need to enrich
      let needsEnrichment = true;
      if (token && token.lastUpdated) {
        const lastUpdatedMs = new Date(token.lastUpdated).getTime();
        if (now - lastUpdatedMs < enrichmentTtlMs) {
          needsEnrichment = false;
        }
      }

      if (!needsEnrichment) {
        return;
      }

      // 3. Request Enrichment from Birdeye
      const overview = await BirdeyeProvider.getTokenOverview(mintAddress);
      
      if (overview) {
        // 4. Update the token in storage
        const updatedToken: TokenMarketData = token ? { ...token } : {
          address: mintAddress,
          symbol: overview.symbol || 'UNKNOWN',
          name: overview.name || 'Unknown Token',
          decimals: null,
          priceUsd: overview.price || null,
          priceChange1h: null,
          priceChange24h: overview.priceChange24h || null,
          volume24hUsd: overview.v24hUSD || null,
          liquidityUsd: overview.liquidity || null,
          marketCapUsd: overview.mc || null,
          fdvUsd: overview.mc || null,
          holderCount: null,
          tokenAgeDays: null,
          top10HoldersPercent: null,
          top20HoldersPercent: null,
          devHoldingsPercent: null,
          hasFreezeAuthority: null,
          hasMintAuthority: null,
          liquidityLockedPercent: null,
          isHoneypotSafe: null,
          riskScore: null,
          smartMoneyVwap: null,
          netFlow24hUsd: null,
          lastUpdated: new Date().toISOString()
        };

        // Update fields that might have changed
        updatedToken.symbol = overview.symbol || updatedToken.symbol;
        updatedToken.name = overview.name || updatedToken.name;
        if (overview.price) updatedToken.priceUsd = overview.price;
        if (overview.liquidity) updatedToken.liquidityUsd = overview.liquidity;
        if (overview.v24hUSD) updatedToken.volume24hUsd = overview.v24hUSD;
        if (overview.mc) {
           updatedToken.marketCapUsd = overview.mc;
           updatedToken.fdvUsd = overview.mc;
        }
        if (overview.priceChange24h) updatedToken.priceChange24h = overview.priceChange24h;
        updatedToken.lastUpdated = new Date().toISOString();

        await storage.saveToken(updatedToken);
      }
    } catch (err) {
      console.warn(`[TokenEnrichmentService] Failed to enrich token ${mintAddress}:`, err);
    }
  }
}
