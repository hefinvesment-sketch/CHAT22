import { PaperPortfolio, PaperPosition, PaperTradeRecord, AlphaSignal, SystemSettings } from '../types';
import { RealDataProviders } from './realDataProviders';
import { StorageAdapter } from './persistence';
import { RiskEngine } from './riskEngine';

export class MarkToMarketWorker {
  /**
   * Monitor open paper positions against live market pricing and evaluate SL/TP/Trailing Stop triggers.
   */
  public static async monitorAndEvaluatePositions(
    portfolio: PaperPortfolio,
    openPositions: PaperPosition[],
    storage: StorageAdapter
  ): Promise<{
    closedTrades: PaperTradeRecord[];
    remainingPositions: PaperPosition[];
    updatedPortfolio: PaperPortfolio;
  }> {
    const closedTrades: PaperTradeRecord[] = [];
    const remainingPositions: PaperPosition[] = [];
    let updatedCash = portfolio.cashUsd;
    let updatedRealizedPnl = portfolio.realizedPnlUsd;
    let totalPositionsValue = 0;
    let totalUnrealizedPnl = 0;

    for (const pos of openPositions) {
      // 1. Fetch current price from Birdeye / Jupiter
      let currentPrice = pos.currentPrice;
      try {
        const priceRec = await RealDataProviders.fetchBirdeyePrice(pos.tokenAddress);
        if (priceRec.priceUsd > 0) {
          currentPrice = priceRec.priceUsd;
        }
      } catch (err) {
        // Keep previous price if price fetch fails
      }

      const currentValue = pos.amount * currentPrice;
      const unrealizedPnl = currentValue - pos.costBasisUsd;
      const unrealizedReturnPct = pos.costBasisUsd > 0 ? (unrealizedPnl / pos.costBasisUsd) * 100 : 0;

      // Update trailing stop if price advanced
      let trailingStop = pos.trailingStopPrice;
      if (trailingStop && currentPrice > pos.openPrice * 1.05) {
        const candidateStop = currentPrice * 0.94; // 6% trailing stop
        if (candidateStop > trailingStop) {
          trailingStop = candidateStop;
        }
      }

      // Check exit triggers
      let exitReason: 'STOP_LOSS' | 'TAKE_PROFIT' | 'TRAILING_STOP' | null = null;
      if (currentPrice <= pos.stopLossPrice) {
        exitReason = 'STOP_LOSS';
      } else if (currentPrice >= pos.takeProfitPrice) {
        exitReason = 'TAKE_PROFIT';
      } else if (trailingStop && currentPrice <= trailingStop) {
        exitReason = 'TRAILING_STOP';
      }

      if (exitReason) {
        // Close position: simulate executable exit via Jupiter quote
        const proceedsUsd = currentValue * 0.9965; // realistic exit friction (0.35% slippage + fee)
        const realizedPnl = proceedsUsd - pos.costBasisUsd;
        const returnPct = pos.costBasisUsd > 0 ? (realizedPnl / pos.costBasisUsd) * 100 : 0;
        const feesPaid = 0.05; // Solana transaction fee

        const closedTrade: PaperTradeRecord = {
          id: `trade-close-${pos.id}-${Date.now()}`,
          portfolioId: pos.portfolioId,
          tokenSymbol: pos.tokenSymbol,
          tokenAddress: pos.tokenAddress,
          openedAt: pos.openedAt,
          closedAt: new Date().toISOString(),
          openPrice: pos.openPrice,
          closePrice: currentPrice,
          amount: pos.amount,
          costBasisUsd: pos.costBasisUsd,
          proceedsUsd,
          realizedPnlUsd: realizedPnl,
          returnPercent: returnPct,
          holdingPeriodMinutes: Math.max(1, Math.round((Date.now() - new Date(pos.openedAt).getTime()) / 60000)),
          exitReason,
          strategyName: pos.strategyName,
          feesPaidUsd: feesPaid,
          slippagePaidUsd: currentValue * 0.0035
        };

        closedTrades.push(closedTrade);
        updatedCash += proceedsUsd;
        updatedRealizedPnl += realizedPnl;

        // Persist closed trade & remove open position
        await storage.saveTrade(closedTrade);
        await storage.removePosition(pos.id);
      } else {
        // Position remains open, update MTM
        const updatedPos: PaperPosition = {
          ...pos,
          currentPrice,
          currentValueUsd: currentValue,
          unrealizedPnlUsd: unrealizedPnl,
          unrealizedReturnPercent: unrealizedReturnPct,
          trailingStopPrice: trailingStop
        };
        remainingPositions.push(updatedPos);
        totalPositionsValue += currentValue;
        totalUnrealizedPnl += unrealizedPnl;

        await storage.savePosition(updatedPos);
      }
    }

    const totalEquity = updatedCash + totalPositionsValue;
    const totalReturnPct = portfolio.startingCapitalUsd > 0 
      ? ((totalEquity - portfolio.startingCapitalUsd) / portfolio.startingCapitalUsd) * 100 
      : 0;

    const updatedPortfolio: PaperPortfolio = {
      ...portfolio,
      cashUsd: updatedCash,
      positionsValueUsd: totalPositionsValue,
      totalEquityUsd: totalEquity,
      totalReturnPercent: totalReturnPct,
      realizedPnlUsd: updatedRealizedPnl,
      unrealizedPnlUsd: totalUnrealizedPnl,
      openPositionsCount: remainingPositions.length
    };

    await storage.savePortfolio(updatedPortfolio);

    return {
      closedTrades,
      remainingPositions,
      updatedPortfolio
    };
  }

  /**
   * Execute paper trade from AlphaSignal with strict risk enforcement and real Jupiter quote pricing.
   */
  public static async executePaperTrade(
    signal: AlphaSignal,
    portfolio: PaperPortfolio,
    openPositions: PaperPosition[],
    settings: SystemSettings,
    storage: StorageAdapter
  ): Promise<{
    success: boolean;
    position?: PaperPosition;
    rejectionReason?: string;
    rejectionCode?: string;
  }> {
    // 1. Evaluate centralized institutional risk engine
    const riskCheck = RiskEngine.evaluateTrade(signal, portfolio, openPositions, settings);
    if (!riskCheck.passed) {
      await storage.saveRiskEvent({
        portfolioId: portfolio.id,
        signalId: signal.id,
        eventType: 'TRADE_REJECTED',
        rejectionCode: riskCheck.code,
        reason: riskCheck.reason || 'Risk check failed'
      });

      return {
        success: false,
        rejectionReason: riskCheck.reason,
        rejectionCode: riskCheck.code
      };
    }

    // 2. Determine trade position size
    const posPercent = signal.alphaScore >= 92 
      ? (settings.strongSignalPositionPercent || 2.0) 
      : (settings.normalPositionPercent || 1.0);
    const positionSizeUsd = (portfolio.totalEquityUsd * posPercent) / 100;

    if (portfolio.cashUsd < positionSizeUsd) {
      return {
        success: false,
        rejectionReason: `Insufficient cash ($${portfolio.cashUsd.toFixed(2)}) for $${positionSizeUsd.toFixed(2)} position.`,
        rejectionCode: 'INSUFFICIENT_CASH'
      };
    }

    // 3. Request real Jupiter Quote: USDC (or SOL) -> target token
    const usdcMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const amountRawUsdc = Math.round(positionSizeUsd * 1e6);

    let executionPrice = signal.priceAtSignal;
    let tokenAmount = positionSizeUsd / (signal.priceAtSignal || 1);
    let quoteLatencyMs = 650;
    let slippagePct = 0.0035;

    try {
      const quote = await RealDataProviders.fetchJupiterQuote(
        usdcMint,
        signal.tokenAddress,
        amountRawUsdc,
        50 // 50 bps
      );
      if (quote && quote.outAmountUi > 0) {
        // Price is directly inAmountUi / outAmountUi (no double slippage charge!)
        executionPrice = quote.executionPrice;
        tokenAmount = quote.outAmountUi;
        quoteLatencyMs = quote.latencyMs;
        slippagePct = (quote.slippageBps || 35) / 10000;
      }
    } catch (err) {
      // In live_paper mode, if quote fails, reject the trade rather than fabricating a fill!
      if (process.env.APP_MODE === 'live_paper') {
        return {
          success: false,
          rejectionReason: `Executable Jupiter quote unavailable in live paper mode: ${(err as any).message}`,
          rejectionCode: 'PROVIDER_UNAVAILABLE'
        };
      }
    }

    // 4. Create open paper position
    const stopLossPrice = executionPrice * 0.94; // -6% stop loss
    const takeProfitPrice = executionPrice * 1.15; // +15% take profit
    const trailingStopPrice = executionPrice * 0.95; // initial trailing anchor

    const newPosition: PaperPosition = {
      id: `pos-${Date.now()}-${signal.tokenSymbol.toLowerCase()}`,
      portfolioId: portfolio.id,
      tokenSymbol: signal.tokenSymbol,
      tokenAddress: signal.tokenAddress,
      openedAt: new Date().toISOString(),
      openPrice: executionPrice,
      currentPrice: executionPrice,
      amount: tokenAmount,
      costBasisUsd: positionSizeUsd,
      currentValueUsd: positionSizeUsd,
      unrealizedPnlUsd: 0,
      unrealizedReturnPercent: 0,
      allocationPercent: posPercent,
      stopLossPrice,
      takeProfitPrice,
      trailingStopPrice,
      strategyName: 'AlphaGraph Institutional Strategy',
      signalId: signal.id,
      signalAlphaScore: signal.alphaScore,
      detectionLatencyMs: quoteLatencyMs,
      slippageIncurredPercent: slippagePct
    };

    // 5. Update portfolio cash and persist
    portfolio.cashUsd -= positionSizeUsd;
    portfolio.positionsValueUsd += positionSizeUsd;
    portfolio.openPositionsCount = openPositions.length + 1;

    await storage.savePosition(newPosition);
    await storage.savePortfolio(portfolio);

    return {
      success: true,
      position: newPosition
    };
  }
}
