import { RealDataProviders } from './realDataProviders';
import { BirdeyeProvider } from './providers/birdeyeProvider';

export interface ReferencePrice {
  tokenAddress: string;
  priceUsd: number | null;
  source: 'JUPITER_PRICE_V3' | 'DEXSCREENER' | 'BIRDEYE' | null;
  observedAt: string | null;
  fetchedAt: string;
  ageMs: number | null;
  status: 'FRESH' | 'STALE' | 'UNAVAILABLE';
}

interface PriceCacheEntry {
  price: ReferencePrice;
  expiresAt: number;
}

export class ReferencePriceService {
  private static cache = new Map<string, PriceCacheEntry>();

  public static async getPrice(tokenAddress: string, options?: { forceFresh?: boolean }): Promise<ReferencePrice> {
    const now = Date.now();
    const ttlMs = parseInt(process.env.REFERENCE_PRICE_CACHE_TTL_MS || '60000'); // Default 60s
    const cacheKey = `refprice:${tokenAddress}`;

    // 1. Check Cache
    if (!options?.forceFresh) {
      const cached = this.cache.get(cacheKey);
      if (cached && now < cached.expiresAt) {
        // Calculate dynamic age
        const age = cached.price.observedAt ? now - new Date(cached.price.observedAt).getTime() : null;
        return {
          ...cached.price,
          ageMs: age,
          status: age && age <= 60000 ? 'FRESH' : 'STALE'
        };
      }
    }

    // 2. Fetch from Primary Source: Jupiter Price V3
    try {
      const jupPrice = await RealDataProviders.fetchJupiterPrice(tokenAddress);
      if (jupPrice && jupPrice.priceUsd > 0) {
        const result: ReferencePrice = {
          tokenAddress,
          priceUsd: jupPrice.priceUsd,
          source: 'JUPITER_PRICE_V3',
          observedAt: new Date().toISOString(), // Jupiter returns immediate price
          fetchedAt: new Date().toISOString(),
          ageMs: 0,
          status: 'FRESH'
        };
        this.cache.set(cacheKey, { price: result, expiresAt: now + ttlMs });
        return result;
      }
    } catch (err) {
       console.warn(`[ReferencePriceService] Jupiter Price failed for ${tokenAddress}: ${err}`);
    }

    // 3. DEX Screener (Fallback) - Optional, assuming it exists or skip to Birdeye
    // (If DEX screener is not implemented yet, skip)

    // 4. Birdeye (Final Fallback)
    try {
      const bePrice = await BirdeyeProvider.getPrice(tokenAddress);
      if (bePrice && bePrice.value > 0) {
        const observedTime = bePrice.updateUnixTime * 1000;
        const age = now - observedTime;
        const result: ReferencePrice = {
          tokenAddress,
          priceUsd: bePrice.value,
          source: 'BIRDEYE',
          observedAt: new Date(observedTime).toISOString(),
          fetchedAt: new Date().toISOString(),
          ageMs: age,
          status: age <= 60000 ? 'FRESH' : 'STALE'
        };
        this.cache.set(cacheKey, { price: result, expiresAt: now + ttlMs });
        return result;
      }
    } catch (err) {
      console.warn(`[ReferencePriceService] Birdeye Price failed for ${tokenAddress}: ${err}`);
    }

    // 5. Unavailable
    const unavailable: ReferencePrice = {
       tokenAddress,
       priceUsd: null,
       source: null,
       observedAt: null,
       fetchedAt: new Date().toISOString(),
       ageMs: null,
       status: 'UNAVAILABLE'
    };
    
    // Cache unavailable state shortly to avoid spamming failed requests
    this.cache.set(cacheKey, { price: unavailable, expiresAt: now + 10000 });
    return unavailable;
  }
}
