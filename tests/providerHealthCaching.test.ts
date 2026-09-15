import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { Server } from 'http';
import { app, getCachedProviderHealth, resetProviderHealthCacheForTesting, HELIUS_POLL_INTERVAL_MS, PROVIDER_HEALTH_TTL_MS } from '../server';
import { RealDataProviders } from '../src/services/realDataProviders';
import { HeliusIngestionWorker, DEFAULT_HELIUS_POLL_INTERVAL_MS } from '../src/services/heliusIngestionWorker';
import { StorageAdapter } from '../src/services/persistence';

describe('Provider Health Caching, Configurable Intervals, and Secret Protection', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    // Set test secret values in environment for verification test
    process.env.HELIUS_API_KEY = 'secret_helius_test_key_xyz987';
    process.env.BIRDEYE_API_KEY = 'secret_birdeye_test_key_abc123';
    process.env.JUPITER_API_KEY = 'secret_jupiter_test_key_jup555';
    process.env.SOLANA_RPC_URL = 'https://secret-rpc.solana.test/?api-key=rpc_secret_key_888';
    process.env.DATABASE_URL = 'postgres://user:super_secret_db_pw@localhost:5432/mydb';
    process.env.REDIS_URL = 'rediss://:super_secret_redis_pw@localhost:6379';
    process.env.GEMINI_API_KEY = 'secret_gemini_test_key_gem777';

    // Start Express app on ephemeral port for real HTTP testing
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      if (typeof (server as any).closeAllConnections === 'function') {
        (server as any).closeAllConnections();
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  beforeEach(() => {
    resetProviderHealthCacheForTesting();
    vi.restoreAllMocks();
  });

  it('verifies HELIUS_POLL_INTERVAL_MS and PROVIDER_HEALTH_TTL_MS defaults to 600,000 ms (10 minutes)', () => {
    expect(HELIUS_POLL_INTERVAL_MS).toBe(600000);
    expect(PROVIDER_HEALTH_TTL_MS).toBe(600000);
    expect(DEFAULT_HELIUS_POLL_INTERVAL_MS).toBe(600000);

    const mockStorage: Partial<StorageAdapter> = {
      saveTransactionsBatch: vi.fn(),
      saveTransaction: vi.fn(),
      saveWallet: vi.fn(),
      saveToken: vi.fn()
    };
    const worker = new HeliusIngestionWorker(mockStorage as any, {} as any);
    expect(worker.pollIntervalMs).toBe(600000);
    expect(worker.getStatus().pollIntervalMs).toBe(600000);
  });

  it('confirms repeated calls to /api/state within 10-minute TTL do not repeatedly invoke getAllProviderHealth', async () => {
    const mockHealthRecords = [
      { providerName: 'PostgreSQL', status: 'CONNECTED' as const, lastChecked: new Date().toISOString() },
      { providerName: 'Redis', status: 'CONNECTED' as const, lastChecked: new Date().toISOString() },
      { providerName: 'Helius', status: 'CONNECTED' as const, lastChecked: new Date().toISOString() },
      { providerName: 'Birdeye', status: 'CONNECTED' as const, lastChecked: new Date().toISOString() },
      { providerName: 'Solana RPC', status: 'CONNECTED' as const, lastChecked: new Date().toISOString() },
      { providerName: 'Jupiter', status: 'CONNECTED' as const, lastChecked: new Date().toISOString() }
    ];

    const getAllHealthSpy = vi.spyOn(RealDataProviders, 'getAllProviderHealth').mockResolvedValue(mockHealthRecords);

    // Call /api/state multiple times in rapid succession
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${baseUrl}/api/state`, { headers: { connection: 'close' } });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.providers).toBeDefined();
      expect(data.providers.length).toBe(6);
      expect(data.heliusPollIntervalMs).toBe(600000);
      expect(data.providerHealthTtlMs).toBe(600000);
    }

    // Must only be called once because subsequent calls use the cache
    expect(getAllHealthSpy).toHaveBeenCalledTimes(1);
  });

  it('confirms that refresh=true on /api/providers/health forces a new provider-health check', async () => {
    const mockHealthRecords = [
      { providerName: 'Helius', status: 'CONNECTED' as const, lastChecked: new Date().toISOString() }
    ];

    const getAllHealthSpy = vi.spyOn(RealDataProviders, 'getAllProviderHealth').mockResolvedValue(mockHealthRecords);

    // Initial normal call: populates cache
    const res1 = await fetch(`${baseUrl}/api/providers/health`, { headers: { connection: 'close' } });
    expect(res1.status).toBe(200);
    expect(getAllHealthSpy).toHaveBeenCalledTimes(1);

    // Second normal call within TTL: returns cache without re-invoking
    const res2 = await fetch(`${baseUrl}/api/providers/health`, { headers: { connection: 'close' } });
    expect(res2.status).toBe(200);
    expect(getAllHealthSpy).toHaveBeenCalledTimes(1);

    // Third call with ?refresh=true: forces refresh
    const res3 = await fetch(`${baseUrl}/api/providers/health?refresh=true`, { headers: { connection: 'close' } });
    expect(res3.status).toBe(200);
    const data3 = await res3.json();
    expect(data3.providers).toBeDefined();
    expect(data3.healthCacheAgeSeconds).toBeDefined();
    expect(data3.heliusPollIntervalMs).toBe(600000);
    expect(data3.providerHealthTtlMs).toBe(600000);

    // Verifies that refresh=true forced a new call
    expect(getAllHealthSpy).toHaveBeenCalledTimes(2);
  });

  it('confirms concurrent requests share one in-flight provider-health refresh without duplicate external checks', async () => {
    let callCount = 0;
    vi.spyOn(RealDataProviders, 'getAllProviderHealth').mockImplementation(async () => {
      callCount++;
      // Simulate 50ms async latency
      await new Promise(resolve => setTimeout(resolve, 50));
      return [
        { providerName: 'Helius', status: 'CONNECTED', lastChecked: new Date().toISOString() }
      ];
    });

    // Fire 6 concurrent requests
    const promises = Array.from({ length: 6 }).map(() => fetch(`${baseUrl}/api/state`, { headers: { connection: 'close' } }).then(r => r.json()));
    const results = await Promise.all(promises);

    expect(results).toHaveLength(6);
    // All 6 requests must share the exact single in-flight promise
    expect(callCount).toBe(1);
  });

  it('confirms secret values are NEVER returned in /api/state, /api/system/status, or /api/providers/health', async () => {
    const secrets = [
      'secret_helius_test_key_xyz987',
      'secret_birdeye_test_key_abc123',
      'secret_jupiter_test_key_jup555',
      'rpc_secret_key_888',
      'super_secret_db_pw',
      'super_secret_redis_pw',
      'secret_gemini_test_key_gem777'
    ];

    vi.spyOn(RealDataProviders, 'getAllProviderHealth').mockResolvedValue([
      { providerName: 'Helius', status: 'CONNECTED', lastChecked: new Date().toISOString(), message: RealDataProviders.sanitizeMessage('Connected to https://mainnet.helius-rpc.com/?api-key=secret_helius_test_key_xyz987') },
      { providerName: 'PostgreSQL', status: 'CONNECTED', lastChecked: new Date().toISOString(), message: RealDataProviders.sanitizeMessage('Connected to postgres://user:super_secret_db_pw@localhost:5432/mydb') },
      { providerName: 'Redis', status: 'CONNECTED', lastChecked: new Date().toISOString(), message: RealDataProviders.sanitizeMessage('Connected to rediss://:super_secret_redis_pw@localhost:6379') },
      { providerName: 'Birdeye', status: 'CONNECTED', lastChecked: new Date().toISOString(), message: RealDataProviders.sanitizeMessage('Connected with secret_birdeye_test_key_abc123') },
      { providerName: 'Solana RPC', status: 'CONNECTED', lastChecked: new Date().toISOString(), message: RealDataProviders.sanitizeMessage('Connected to https://secret-rpc.solana.test/?api-key=rpc_secret_key_888') },
      { providerName: 'Jupiter', status: 'CONNECTED', lastChecked: new Date().toISOString(), message: RealDataProviders.sanitizeMessage('Connected with secret_jupiter_test_key_jup555') }
    ]);

    const endpoints = [
      '/api/state',
      '/api/system/status',
      '/api/providers/health'
    ];

    for (const endpoint of endpoints) {
      const res = await fetch(`${baseUrl}${endpoint}`, { headers: { connection: 'close' } });
      expect(res.status).toBe(200);
      const text = await res.text();
      const json = JSON.parse(text);

      // Verify no secret substring is leaked
      for (const secret of secrets) {
        expect(text).not.toContain(secret);
      }

      // Verify forbidden metadata fields are not returned
      expect(text).not.toContain('"apiKey"');
      expect(text).not.toContain('"keyPrefix"');
      expect(text).not.toContain('"secretLength"');

      // Verify safe status exposed
      if (json.providers) {
        for (const p of json.providers) {
          expect(['CONNECTED', 'ERROR', 'NOT_CONFIGURED', 'DEGRADED', 'UNREACHABLE', 'DEMO_ONLY']).toContain(p.status);
          expect(p.apiKey).toBeUndefined();
          expect(p.keyPrefix).toBeUndefined();
        }
      }
    }
  });

  it('confirms POST /api/reset-portfolio resets capital to exactly $5,000.00 and clears positions', async () => {
    const res = await fetch(`${baseUrl}/api/reset-portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', connection: 'close' }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.portfolio.startingCapitalUsd).toBe(5000.00);
    expect(data.portfolio.cashUsd).toBe(5000.00);
    expect(data.portfolio.totalEquityUsd).toBe(5000.00);
    expect(data.portfolio.openPositionsCount).toBe(0);
    expect(data.portfolio.totalTradesCount).toBe(0);
  });

  it('confirms POST /api/paper/mtm skips pricing requests when open positions are zero', async () => {
    const birdeyePriceSpy = vi.spyOn(RealDataProviders, 'fetchBirdeyePrice');

    const res = await fetch(`${baseUrl}/api/paper/mtm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', connection: 'close' }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.openPositionsCount).toBe(0);
    expect(data.closedTradesCount).toBe(0);
    // Zero open positions -> zero pricing requests
    expect(birdeyePriceSpy).not.toHaveBeenCalled();
  });
});
