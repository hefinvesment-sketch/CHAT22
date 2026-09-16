/**
 * Helius Transaction Parser
 * Accurately classifies Solana DEX swaps, transfers, airdrops, and LP activities.
 * Determines direction: BUY vs SELL vs SWAP vs STABLECOIN_ROTATION.
 */

export type TransactionType = 
  | 'BUY'
  | 'SELL'
  | 'SWAP'
  | 'STABLECOIN_ROTATION'
  | 'TRANSFER'
  | 'AIRDROP'
  | 'STAKING'
  | 'LP_ACTIVITY'
  | 'UNKNOWN';

export interface ParsedTransactionRecord {
  signature: string;
  slot: number;
  timestamp: string;
  walletAddress: string;
  dex: string;
  tradeDirection: TransactionType;
  tokenInAddress: string;
  tokenInSymbol: string;
  tokenInAmount: number;
  tokenOutAddress: string;
  tokenOutSymbol: string;
  tokenOutAmount: number;
  executionPriceUsd: number;
  usdValue: number;
  transactionFeeUsd: number;
  isStablecoinRotation: boolean;
  isAirdropOrTransfer: boolean;
}

const KNOWN_CORE_ASSETS: Record<string, { symbol: string; decimals: number; isStable: boolean }> = {
  'So11111111111111111111111111111111111111112': { symbol: 'SOL', decimals: 9, isStable: false },
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { symbol: 'USDC', decimals: 6, isStable: true },
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { symbol: 'USDT', decimals: 6, isStable: true },
  '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh': { symbol: 'WBTC', decimals: 8, isStable: false },
  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs': { symbol: 'WETH', decimals: 8, isStable: false },
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': { symbol: 'JUP', decimals: 6, isStable: false },
  'DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7': { symbol: 'DRIFT', decimals: 6, isStable: false }
};

export class HeliusTransactionParser {
  /**
   * Parse a raw Helius transaction (enhanced webhook or RPC response)
   */
  public static parseTransaction(tx: unknown, targetWallet?: string): ParsedTransactionRecord {
    const signature = tx.signature || `sig-${tx.slot || Date.now()}`;
    const slot = tx.slot || 0;
    const timestamp = tx.timestamp 
      ? new Date(tx.timestamp * 1000).toISOString() 
      : new Date().toISOString();
    const feeSol = (tx.fee || 5000) / 1e9;
    const feeUsd = feeSol * (tx.solPriceUsd || 145);

    // Identify primary wallet
    const walletAddress = targetWallet || tx.feePayer || tx.accountData?.[0]?.account || 'UNKNOWN_WALLET';
    const type = (tx.type || '').toUpperCase();
    const source = tx.source || 'UNKNOWN_DEX';

    // 1. Swaps
    if (type === 'SWAP' || (tx.events && tx.events.swap)) {
      const swapEvent = tx.events?.swap || {};
      const nativeInput = swapEvent.nativeInput;
      const nativeOutput = swapEvent.nativeOutput;
      const tokenInputs = swapEvent.tokenInputs || [];
      const tokenOutputs = swapEvent.tokenOutputs || [];

      let tokenInAddress = '';
      let tokenInAmount = 0;
      let tokenOutAddress = '';
      let tokenOutAmount = 0;

      if (nativeInput && Number(nativeInput.amount) > 0) {
        tokenInAddress = 'So11111111111111111111111111111111111111112';
        tokenInAmount = Number(nativeInput.amount) / 1e9;
      } else if (tokenInputs.length > 0) {
        tokenInAddress = tokenInputs[0].mint || tokenInputs[0].tokenAddress || '';
        const dec = tokenInputs[0].decimals || KNOWN_CORE_ASSETS[tokenInAddress]?.decimals || 6;
        tokenInAmount = Number(tokenInputs[0].rawTokenAmount?.tokenAmount || tokenInputs[0].tokenAmount || 0) / Math.pow(10, dec);
      }

      if (nativeOutput && Number(nativeOutput.amount) > 0) {
        tokenOutAddress = 'So11111111111111111111111111111111111111112';
        tokenOutAmount = Number(nativeOutput.amount) / 1e9;
      } else if (tokenOutputs.length > 0) {
        tokenOutAddress = tokenOutputs[0].mint || tokenOutputs[0].tokenAddress || '';
        const dec = tokenOutputs[0].decimals || KNOWN_CORE_ASSETS[tokenOutAddress]?.decimals || 6;
        tokenOutAmount = Number(tokenOutputs[0].rawTokenAmount?.tokenAmount || tokenOutputs[0].tokenAmount || 0) / Math.pow(10, dec);
      }

      // Fallback: check token transfers array if swap event missing details
      if ((!tokenInAddress || !tokenOutAddress) && Array.isArray(tx.tokenTransfers)) {
        for (const tt of tx.tokenTransfers) {
          if (tt.fromUserAccount?.toLowerCase() === walletAddress.toLowerCase()) {
            tokenInAddress = tt.mint;
            tokenInAmount = Number(tt.tokenAmount || 0);
          } else if (tt.toUserAccount?.toLowerCase() === walletAddress.toLowerCase()) {
            tokenOutAddress = tt.mint;
            tokenOutAmount = Number(tt.tokenAmount || 0);
          }
        }
      }

      const formatUnknownSymbol = (addr: string, fallback: string) => {
        if (!addr) return fallback;
        return `${addr.slice(0, 4)}..${addr.slice(-4)}`;
      };

      const tokenInMeta = KNOWN_CORE_ASSETS[tokenInAddress] || { 
        symbol: formatUnknownSymbol(tokenInAddress, 'TOKEN_IN'), 
        decimals: 6, 
        isStable: false 
      };
      const tokenOutMeta = KNOWN_CORE_ASSETS[tokenOutAddress] || { 
        symbol: formatUnknownSymbol(tokenOutAddress, 'TOKEN_OUT'), 
        decimals: 6, 
        isStable: false 
      };

      const isInputQuote = tokenInMeta.isStable || tokenInAddress === 'So11111111111111111111111111111111111111112';
      const isOutputQuote = tokenOutMeta.isStable || tokenOutAddress === 'So11111111111111111111111111111111111111112';

      let direction: TransactionType = 'SWAP';
      let isStableRotation = false;

      if (tokenInMeta.isStable && tokenOutMeta.isStable) {
        // e.g. USDT -> USDC
        direction = 'STABLECOIN_ROTATION';
        isStableRotation = true;
      } else if (isInputQuote && !isOutputQuote) {
        // e.g. USDC -> JUP or SOL -> DRIFT
        direction = 'BUY';
      } else if (!isInputQuote && isOutputQuote) {
        // e.g. JUP -> USDC or DRIFT -> SOL
        direction = 'SELL';
      } else {
        direction = 'SWAP';
      }

      // Calculate approximate USD value & price
      let usdVal = 0;
      let price = 0;
      if (tokenInMeta.isStable) {
        usdVal = tokenInAmount;
        price = tokenOutAmount > 0 ? usdVal / tokenOutAmount : 0;
      } else if (tokenOutMeta.isStable) {
        usdVal = tokenOutAmount;
        price = tokenInAmount > 0 ? usdVal / tokenInAmount : 0;
      } else {
        // If traded against SOL, use $145 SOL reference
        const solRef = 145.0;
        if (tokenInAddress === 'So11111111111111111111111111111111111111112') {
          usdVal = tokenInAmount * solRef;
          price = tokenOutAmount > 0 ? usdVal / tokenOutAmount : 0;
        } else if (tokenOutAddress === 'So11111111111111111111111111111111111111112') {
          usdVal = tokenOutAmount * solRef;
          price = tokenInAmount > 0 ? usdVal / tokenInAmount : 0;
        }
      }

      return {
        signature,
        slot,
        timestamp,
        walletAddress,
        dex: source,
        tradeDirection: direction,
        tokenInAddress,
        tokenInSymbol: tokenInMeta.symbol,
        tokenInAmount,
        tokenOutAddress,
        tokenOutSymbol: tokenOutMeta.symbol,
        tokenOutAmount,
        executionPriceUsd: price,
        usdValue: usdVal,
        transactionFeeUsd: feeUsd,
        isStablecoinRotation: isStableRotation,
        isAirdropOrTransfer: false
      };
    }

    // 2. Transfers & Airdrops
    if (type === 'TRANSFER' || (tx.tokenTransfers && tx.tokenTransfers.length > 0)) {
      const transfer = tx.tokenTransfers?.[0];
      const isAirdrop = (tx.description || '').toLowerCase().includes('airdrop') || 
                        (transfer && transfer.fromUserAccount === 'AirdropDistributor');

      return {
        signature,
        slot,
        timestamp,
        walletAddress,
        dex: 'DIRECT_TRANSFER',
        tradeDirection: isAirdrop ? 'AIRDROP' : 'TRANSFER',
        tokenInAddress: '',
        tokenInSymbol: '',
        tokenInAmount: 0,
        tokenOutAddress: transfer?.mint || '',
        tokenOutSymbol: KNOWN_CORE_ASSETS[transfer?.mint || '']?.symbol || 'UNKNOWN',
        tokenOutAmount: Number(transfer?.tokenAmount || 0),
        executionPriceUsd: 0,
        usdValue: 0,
        transactionFeeUsd: feeUsd,
        isStablecoinRotation: false,
        isAirdropOrTransfer: true
      };
    }

    // Default Unknown
    return {
      signature,
      slot,
      timestamp,
      walletAddress,
      dex: source,
      tradeDirection: 'UNKNOWN',
      tokenInAddress: '',
      tokenInSymbol: '',
      tokenInAmount: 0,
      tokenOutAddress: '',
      tokenOutSymbol: '',
      tokenOutAmount: 0,
      executionPriceUsd: 0,
      usdValue: 0,
      transactionFeeUsd: feeUsd,
      isStablecoinRotation: false,
      isAirdropOrTransfer: false
    };
  }

  /**
   * Map standard Solana JSON-parsed RPC getTransaction into Helius transaction format
   */
  public static mapSolanaRpcTransaction(rpcTx: unknown, signature: string): unknown {
    const message = rpcTx.transaction?.message;
    const meta = rpcTx.meta;
    const feePayer = message?.accountKeys?.find((k: unknown) => k.signer)?.pubkey || 'UNKNOWN_WALLET';
    
    // Calculate token balance diffs to detect swaps/transfers
    const preBalances = meta?.preTokenBalances || [];
    const postBalances = meta?.postTokenBalances || [];
    
    const tokenInputs: unknown[] = [];
    const tokenOutputs: unknown[] = [];
    
    for (const post of postBalances) {
      const pre = preBalances.find((p: unknown) => p.accountIndex === post.accountIndex && p.mint === post.mint);
      const preAmount = pre ? Number(pre.uiTokenAmount?.uiAmount || 0) : 0;
      const postAmount = Number(post.uiTokenAmount?.uiAmount || 0);
      const diff = postAmount - preAmount;
      if (diff > 0) {
        tokenOutputs.push({
          mint: post.mint,
          tokenAddress: post.mint,
          tokenAmount: diff,
          rawTokenAmount: { tokenAmount: diff },
          decimals: post.uiTokenAmount?.decimals || 6
        });
      } else if (diff < 0) {
        tokenInputs.push({
          mint: post.mint,
          tokenAddress: post.mint,
          tokenAmount: Math.abs(diff),
          rawTokenAmount: { tokenAmount: Math.abs(diff) },
          decimals: post.uiTokenAmount?.decimals || 6
        });
      }
    }
    
    return {
      signature,
      slot: rpcTx.slot,
      timestamp: rpcTx.blockTime,
      fee: meta?.fee || 5000,
      feePayer,
      type: tokenInputs.length > 0 && tokenOutputs.length > 0 ? 'SWAP' : (tokenOutputs.length > 0 || tokenInputs.length > 0 ? 'TRANSFER' : 'UNKNOWN'),
      source: 'Raydium',
      events: {
        swap: {
          tokenInputs,
          tokenOutputs
        }
      }
    };
  }
}
