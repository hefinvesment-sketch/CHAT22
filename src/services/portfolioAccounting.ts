import { PaperPortfolio, PaperPosition, PaperTradeRecord } from '../types';

export interface EntryCostBreakdown {
  grossPositionValueUsd: number;
  entryFeeUsd: number;
  networkFeeUsd: number;
  slippageCostUsd: number;
  netEntryCostUsd: number;
}

export interface ExitProceedsBreakdown {
  grossProceedsUsd: number;
  exitFeeUsd: number;
  networkFeeUsd: number;
  slippageCostUsd: number;
  netProceedsUsd: number;
  netRealizedPnlUsd: number;
  returnPercent: number;
}

export interface PortfolioAuditResult {
  isValid: boolean;
  startingCapitalUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  expectedEquityUsd: number;
  actualEquityUsd: number;
  discrepancyUsd: number;
  cashUsd: number;
  positionsValueUsd: number;
  message: string;
}

/**
 * Institutional Portfolio Accounting Engine
 * Enforces strict double-entry ledger mechanics:
 * TOTAL EQUITY = CASH + SUM(MARKET VALUE OF ALL OPEN POSITIONS)
 * REALIZED PNL = SUM(NET CLOSED TRADE PNL)
 * UNREALIZED PNL = SUM(CURRENT POSITION VALUE) - SUM(CURRENT POSITION COST BASIS)
 * Reconciles starting capital + realized PnL + unrealized PnL == current equity to the cent.
 */
export class PortfolioAccountingEngine {
  public static readonly ROUNDING_TOLERANCE_USD = 0.01;

  /**
   * Calculate exact net entry cost including fees and slippage
   */
  public static calculateEntryCost(
    quantity: number,
    executionPrice: number,
    entryFeeRate: number = 0.001, // 10 bps DEX fee
    networkFeeUsd: number = 0.05, // Solana network + priority fee
    slippageRate: number = 0.0035 // 35 bps execution slippage
  ): EntryCostBreakdown {
    const grossPositionValueUsd = Number((quantity * executionPrice).toFixed(4));
    const entryFeeUsd = Number((grossPositionValueUsd * entryFeeRate).toFixed(4));
    const slippageCostUsd = Number((grossPositionValueUsd * slippageRate).toFixed(4));
    const netEntryCostUsd = Number(
      (grossPositionValueUsd + entryFeeUsd + networkFeeUsd + slippageCostUsd).toFixed(2)
    );

    return {
      grossPositionValueUsd,
      entryFeeUsd,
      networkFeeUsd,
      slippageCostUsd,
      netEntryCostUsd
    };
  }

  /**
   * Calculate exact net exit proceeds and net PnL after all fees
   */
  public static calculateExitProceeds(
    quantity: number,
    exitPrice: number,
    costBasisUsd: number,
    exitFeeRate: number = 0.001, // 10 bps DEX fee
    networkFeeUsd: number = 0.05, // Solana priority fee
    slippageRate: number = 0.0035 // 35 bps execution slippage
  ): ExitProceedsBreakdown {
    const grossProceedsUsd = Number((quantity * exitPrice).toFixed(4));
    const exitFeeUsd = Number((grossProceedsUsd * exitFeeRate).toFixed(4));
    const slippageCostUsd = Number((grossProceedsUsd * slippageRate).toFixed(4));
    
    // Deduct all exit costs from gross proceeds
    const netProceedsUsd = Number(
      (grossProceedsUsd - exitFeeUsd - networkFeeUsd - slippageCostUsd).toFixed(2)
    );
    
    // Net PnL = Net Proceeds - Cost Basis
    const netRealizedPnlUsd = Number((netProceedsUsd - costBasisUsd).toFixed(2));
    const returnPercent = costBasisUsd > 0
      ? Number(((netRealizedPnlUsd / costBasisUsd) * 100).toFixed(2))
      : 0;

    return {
      grossProceedsUsd,
      exitFeeUsd,
      networkFeeUsd,
      slippageCostUsd,
      netProceedsUsd,
      netRealizedPnlUsd,
      returnPercent
    };
  }

  /**
   * Open a position in the portfolio atomically
   */
  public static openPosition(
    portfolio: PaperPortfolio,
    openPositions: PaperPosition[],
    positionInput: {
      id: string;
      tokenSymbol: string;
      tokenAddress: string;
      openPrice: number;
      amount: number;
      strategyName: string;
      signalId: string;
      signalAlphaScore: number;
      detectionLatencyMs: number;
      slippageIncurredPercent: number;
      entryFeeRate?: number;
      networkFeeUsd?: number;
      stopLossPercent?: number;
      takeProfitPercent?: number;
    }
  ): {
    updatedPortfolio: PaperPortfolio;
    updatedPositions: PaperPosition[];
    newPosition: PaperPosition;
    entryBreakdown: EntryCostBreakdown;
  } {
    const entryBreakdown = this.calculateEntryCost(
      positionInput.amount,
      positionInput.openPrice,
      positionInput.entryFeeRate ?? 0.001,
      positionInput.networkFeeUsd ?? 0.05,
      positionInput.slippageIncurredPercent
    );

    if (portfolio.cashUsd < entryBreakdown.netEntryCostUsd) {
      throw new Error(
        `CRITICAL ACCOUNTING ERROR: Insufficient cash ($${portfolio.cashUsd.toFixed(2)}) to allocate $${entryBreakdown.netEntryCostUsd.toFixed(2)}`
      );
    }

    const stopLossPercent = positionInput.stopLossPercent ?? 0.05;
    const takeProfitPercent = positionInput.takeProfitPercent ?? 0.15;

    const newPosition: PaperPosition = {
      id: positionInput.id,
      portfolioId: portfolio.id,
      tokenSymbol: positionInput.tokenSymbol,
      tokenAddress: positionInput.tokenAddress,
      openedAt: new Date().toISOString(),
      openPrice: positionInput.openPrice,
      currentPrice: positionInput.openPrice,
      amount: positionInput.amount,
      costBasisUsd: entryBreakdown.netEntryCostUsd,
      currentValueUsd: entryBreakdown.grossPositionValueUsd,
      unrealizedPnlUsd: Number((entryBreakdown.grossPositionValueUsd - entryBreakdown.netEntryCostUsd).toFixed(2)),
      unrealizedReturnPercent: Number(
        (((entryBreakdown.grossPositionValueUsd - entryBreakdown.netEntryCostUsd) / entryBreakdown.netEntryCostUsd) * 100).toFixed(2)
      ),
      allocationPercent: Number(((entryBreakdown.netEntryCostUsd / portfolio.totalEquityUsd) * 100).toFixed(2)),
      stopLossPrice: Number((positionInput.openPrice * (1 - stopLossPercent)).toFixed(6)),
      takeProfitPrice: Number((positionInput.openPrice * (1 + takeProfitPercent)).toFixed(6)),
      trailingStopPrice: Number((positionInput.openPrice * 0.96).toFixed(6)),
      strategyName: positionInput.strategyName,
      signalId: positionInput.signalId,
      signalAlphaScore: positionInput.signalAlphaScore,
      detectionLatencyMs: positionInput.detectionLatencyMs,
      slippageIncurredPercent: positionInput.slippageIncurredPercent
    };

    const updatedPositions = [newPosition, ...openPositions];
    
    // Atomic portfolio state update
    const newCash = Number((portfolio.cashUsd - entryBreakdown.netEntryCostUsd).toFixed(2));
    const totalPositionsValue = Number(
      updatedPositions.reduce((acc, p) => acc + p.currentValueUsd, 0).toFixed(2)
    );
    const totalUnrealizedPnl = Number(
      updatedPositions.reduce((acc, p) => acc + (p.currentValueUsd - p.costBasisUsd), 0).toFixed(2)
    );
    const totalEquity = Number((newCash + totalPositionsValue).toFixed(2));
    const totalFeesPaid = Number((portfolio.totalFeesPaidUsd + entryBreakdown.entryFeeUsd + entryBreakdown.networkFeeUsd).toFixed(2));

    const updatedPortfolio: PaperPortfolio = {
      ...portfolio,
      cashUsd: newCash,
      positionsValueUsd: totalPositionsValue,
      totalEquityUsd: totalEquity,
      unrealizedPnlUsd: totalUnrealizedPnl,
      totalReturnPercent: Number((((totalEquity - portfolio.startingCapitalUsd) / portfolio.startingCapitalUsd) * 100).toFixed(2)),
      openPositionsCount: updatedPositions.length,
      totalFeesPaidUsd: totalFeesPaid
    };

    this.validatePortfolioReconciliation(updatedPortfolio, updatedPositions, []);

    return {
      updatedPortfolio,
      updatedPositions,
      newPosition,
      entryBreakdown
    };
  }

  /**
   * Close a position atomically and update cash by net proceeds
   */
  public static closePosition(
    portfolio: PaperPortfolio,
    openPositions: PaperPosition[],
    closedTrades: PaperTradeRecord[],
    positionId: string,
    exitPrice: number,
    exitReason: PaperTradeRecord['exitReason'] = 'MANUAL_CLOSE',
    options?: {
      exitFeeRate?: number;
      networkFeeUsd?: number;
      slippageRate?: number;
      closedAt?: string;
    }
  ): {
    updatedPortfolio: PaperPortfolio;
    updatedPositions: PaperPosition[];
    updatedClosedTrades: PaperTradeRecord[];
    closedTrade: PaperTradeRecord;
    exitBreakdown: ExitProceedsBreakdown;
  } {
    const posIndex = openPositions.findIndex(p => p.id === positionId);
    if (posIndex === -1) {
      throw new Error(`Position ${positionId} not found in open positions`);
    }

    const pos = openPositions[posIndex];
    if (!pos) {
      throw new Error(`Position ${positionId} not found in open positions`);
    }
    const exitBreakdown = this.calculateExitProceeds(
      pos.amount,
      exitPrice,
      pos.costBasisUsd,
      options?.exitFeeRate ?? 0.001,
      options?.networkFeeUsd ?? 0.05,
      options?.slippageRate ?? pos.slippageIncurredPercent
    );

    const closedAt = options?.closedAt ?? new Date().toISOString();
    const openTimeMs = new Date(pos.openedAt).getTime();
    const closeTimeMs = new Date(closedAt).getTime();
    const holdingPeriodMinutes = Math.max(1, Math.round((closeTimeMs - openTimeMs) / 60000));

    const closedTrade: PaperTradeRecord = {
      id: `trade-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      portfolioId: portfolio.id,
      tokenSymbol: pos.tokenSymbol,
      tokenAddress: pos.tokenAddress,
      openedAt: pos.openedAt,
      closedAt,
      openPrice: pos.openPrice,
      closePrice: exitPrice,
      amount: pos.amount,
      costBasisUsd: pos.costBasisUsd,
      proceedsUsd: exitBreakdown.netProceedsUsd,
      realizedPnlUsd: exitBreakdown.netRealizedPnlUsd,
      returnPercent: exitBreakdown.returnPercent,
      holdingPeriodMinutes,
      exitReason,
      strategyName: pos.strategyName,
      feesPaidUsd: Number((exitBreakdown.exitFeeUsd + exitBreakdown.networkFeeUsd).toFixed(4)),
      slippagePaidUsd: exitBreakdown.slippageCostUsd
    };

    const updatedPositions = openPositions.filter((_, idx) => idx !== posIndex);
    const updatedClosedTrades = [closedTrade, ...closedTrades];

    // Double-entry cash increment: cash receives NET proceeds
    const newCash = Number((portfolio.cashUsd + exitBreakdown.netProceedsUsd).toFixed(2));
    const totalPositionsValue = Number(
      updatedPositions.reduce((acc, p) => acc + p.currentValueUsd, 0).toFixed(2)
    );
    const totalRealizedPnl = Number(
      updatedClosedTrades.reduce((acc, t) => acc + t.realizedPnlUsd, 0).toFixed(2)
    );
    const totalUnrealizedPnl = Number(
      updatedPositions.reduce((acc, p) => acc + (p.currentValueUsd - p.costBasisUsd), 0).toFixed(2)
    );
    const totalEquity = Number((newCash + totalPositionsValue).toFixed(2));
    const totalFeesPaid = Number(
      (portfolio.totalFeesPaidUsd + closedTrade.feesPaidUsd).toFixed(2)
    );

    // Win Rate & Profit Factor calculation from actual trades
    const winningTrades = updatedClosedTrades.filter(t => t.realizedPnlUsd > 0);
    const losingTrades = updatedClosedTrades.filter(t => t.realizedPnlUsd < 0);
    const totalWinsUsd = winningTrades.reduce((acc, t) => acc + t.realizedPnlUsd, 0);
    const totalLossesUsd = Math.abs(losingTrades.reduce((acc, t) => acc + t.realizedPnlUsd, 0));
    const winRatePercent = updatedClosedTrades.length > 0
      ? Number(((winningTrades.length / updatedClosedTrades.length) * 100).toFixed(1))
      : 0;
    const profitFactor = totalLossesUsd > 0
      ? Number((totalWinsUsd / totalLossesUsd).toFixed(2))
      : totalWinsUsd > 0 ? 99.0 : 0;

    const updatedPortfolio: PaperPortfolio = {
      ...portfolio,
      cashUsd: newCash,
      positionsValueUsd: totalPositionsValue,
      totalEquityUsd: totalEquity,
      realizedPnlUsd: totalRealizedPnl,
      unrealizedPnlUsd: totalUnrealizedPnl,
      totalReturnPercent: Number((((totalEquity - portfolio.startingCapitalUsd) / portfolio.startingCapitalUsd) * 100).toFixed(2)),
      openPositionsCount: updatedPositions.length,
      totalTradesCount: updatedClosedTrades.length,
      winRatePercent,
      profitFactor,
      totalFeesPaidUsd: totalFeesPaid
    };

    this.validatePortfolioReconciliation(updatedPortfolio, updatedPositions, updatedClosedTrades);

    return {
      updatedPortfolio,
      updatedPositions,
      updatedClosedTrades,
      closedTrade,
      exitBreakdown
    };
  }

  /**
   * Mark all open positions to current market prices
   */
  public static markToMarket(
    portfolio: PaperPortfolio,
    openPositions: PaperPosition[],
    priceMap: Record<string, number>
  ): {
    updatedPortfolio: PaperPortfolio;
    updatedPositions: PaperPosition[];
    triggeredExits: {
      position: PaperPosition;
      reason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'TRAILING_STOP';
      triggerPrice: number;
    }[];
  } {
    const triggeredExits: {
      position: PaperPosition;
      reason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'TRAILING_STOP';
      triggerPrice: number;
    }[] = [];

    const updatedPositions = openPositions.map(pos => {
      const newPrice = priceMap[pos.tokenAddress] || priceMap[pos.tokenSymbol] || pos.currentPrice;
      const currentValueUsd = Number((pos.amount * newPrice).toFixed(2));
      const unrealizedPnlUsd = Number((currentValueUsd - pos.costBasisUsd).toFixed(2));
      const unrealizedReturnPercent = pos.costBasisUsd > 0
        ? Number(((unrealizedPnlUsd / pos.costBasisUsd) * 100).toFixed(2))
        : 0;

      // Update trailing stop if price made new high
      let trailingStopPrice = pos.trailingStopPrice;
      if (newPrice > pos.openPrice && (!trailingStopPrice || newPrice * 0.96 > trailingStopPrice)) {
        trailingStopPrice = Number((newPrice * 0.96).toFixed(6));
      }

      const updatedPos: PaperPosition = {
        ...pos,
        currentPrice: newPrice,
        currentValueUsd,
        unrealizedPnlUsd,
        unrealizedReturnPercent,
        trailingStopPrice
      };

      // Check exit triggers
      if (pos.stopLossPrice && newPrice <= pos.stopLossPrice) {
        triggeredExits.push({ position: updatedPos, reason: 'STOP_LOSS', triggerPrice: newPrice });
      } else if (pos.takeProfitPrice && newPrice >= pos.takeProfitPrice) {
        triggeredExits.push({ position: updatedPos, reason: 'TAKE_PROFIT', triggerPrice: newPrice });
      } else if (trailingStopPrice && newPrice <= trailingStopPrice && newPrice > pos.openPrice) {
        triggeredExits.push({ position: updatedPos, reason: 'TRAILING_STOP', triggerPrice: newPrice });
      }

      return updatedPos;
    });

    const positionsValueUsd = Number(
      updatedPositions.reduce((acc, p) => acc + p.currentValueUsd, 0).toFixed(2)
    );
    const unrealizedPnlUsd = Number(
      updatedPositions.reduce((acc, p) => acc + p.unrealizedPnlUsd, 0).toFixed(2)
    );
    const totalEquityUsd = Number((portfolio.cashUsd + positionsValueUsd).toFixed(2));

    const updatedPortfolio: PaperPortfolio = {
      ...portfolio,
      positionsValueUsd,
      unrealizedPnlUsd,
      totalEquityUsd,
      totalReturnPercent: Number((((totalEquityUsd - portfolio.startingCapitalUsd) / portfolio.startingCapitalUsd) * 100).toFixed(2))
    };

    return {
      updatedPortfolio,
      updatedPositions,
      triggeredExits
    };
  }

  /**
   * Reconcile portfolio equation:
   * startingCapital + realizedPnl + unrealizedPnl == totalEquity
   */
  public static validatePortfolioReconciliation(
    portfolio: PaperPortfolio,
    openPositions: PaperPosition[],
    closedTrades: PaperTradeRecord[]
  ): PortfolioAuditResult {
    const calculatedPositionsValue = Number(
      openPositions.reduce((acc, p) => acc + p.currentValueUsd, 0).toFixed(2)
    );
    const calculatedUnrealized = Number(
      openPositions.reduce((acc, p) => acc + (p.currentValueUsd - p.costBasisUsd), 0).toFixed(2)
    );
    const calculatedRealized = closedTrades.length > 0
      ? Number(closedTrades.reduce((acc, t) => acc + t.realizedPnlUsd, 0).toFixed(2))
      : portfolio.realizedPnlUsd;

    const expectedEquity = Number(
      (portfolio.startingCapitalUsd + calculatedRealized + calculatedUnrealized).toFixed(2)
    );
    const actualEquity = Number((portfolio.cashUsd + calculatedPositionsValue).toFixed(2));
    const discrepancy = Number(Math.abs(expectedEquity - actualEquity).toFixed(2));

    const isValid = discrepancy <= this.ROUNDING_TOLERANCE_USD;

    if (!isValid) {
      console.error(
        `CRITICAL ACCOUNTING ERROR: Portfolio ${portfolio.id} reconciliation failed! ` +
        `Expected equity ($${expectedEquity}) != Actual equity ($${actualEquity}), discrepancy: $${discrepancy}. ` +
        `Starting: $${portfolio.startingCapitalUsd}, Realized: $${calculatedRealized}, Unrealized: $${calculatedUnrealized}, Cash: $${portfolio.cashUsd}`
      );
    }

    return {
      isValid,
      startingCapitalUsd: portfolio.startingCapitalUsd,
      realizedPnlUsd: calculatedRealized,
      unrealizedPnlUsd: calculatedUnrealized,
      expectedEquityUsd: expectedEquity,
      actualEquityUsd: actualEquity,
      discrepancyUsd: discrepancy,
      cashUsd: portfolio.cashUsd,
      positionsValueUsd: calculatedPositionsValue,
      message: isValid
        ? 'Portfolio reconciled successfully'
        : `CRITICAL ACCOUNTING ERROR: Discrepancy of $${discrepancy.toFixed(2)} between ledger and equity balance`
    };
  }

  /**
   * Rebuild the entire portfolio state from the ground up using raw events/ledger.
   */
  public static rebuildPortfolioFromLedger(
    startingCapitalUsd: number,
    closedTrades: PaperTradeRecord[],
    openPositions: PaperPosition[]
  ): {
    reconstructedCashUsd: number;
    reconstructedPositionsValueUsd: number;
    reconstructedRealizedPnlUsd: number;
    reconstructedUnrealizedPnlUsd: number;
    reconstructedEquityUsd: number;
    reconstructedFeesPaidUsd: number;
    auditResult: PortfolioAuditResult;
  } {
    let cash = startingCapitalUsd;
    let totalFees = 0;

    // Deduct cost basis of open positions
    for (const pos of openPositions) {
      cash -= pos.costBasisUsd;
    }

    // Process closed trades: each trade entered at cost basis and exited at proceeds
    for (const trade of closedTrades) {
      // Net change to cash = proceeds - cost basis = realized PnL
      cash += trade.realizedPnlUsd;
      totalFees += trade.feesPaidUsd;
    }

    const reconstructedCashUsd = Number(cash.toFixed(2));
    const reconstructedPositionsValueUsd = Number(
      openPositions.reduce((acc, p) => acc + p.currentValueUsd, 0).toFixed(2)
    );
    const reconstructedRealizedPnlUsd = Number(
      closedTrades.reduce((acc, t) => acc + t.realizedPnlUsd, 0).toFixed(2)
    );
    const reconstructedUnrealizedPnlUsd = Number(
      openPositions.reduce((acc, p) => acc + (p.currentValueUsd - p.costBasisUsd), 0).toFixed(2)
    );
    const reconstructedEquityUsd = Number(
      (reconstructedCashUsd + reconstructedPositionsValueUsd).toFixed(2)
    );
    const reconstructedFeesPaidUsd = Number(totalFees.toFixed(2));

    const dummyPortfolio: PaperPortfolio = {
      id: 'audit-portfolio',
      name: 'Audit',
      description: 'Audit',
      strategyKey: 'audit',
      startingCapitalUsd,
      initialCashUsd: startingCapitalUsd,
      cashUsd: reconstructedCashUsd,
      positionsValueUsd: reconstructedPositionsValueUsd,
      totalEquityUsd: reconstructedEquityUsd,
      totalReturnPercent: Number((((reconstructedEquityUsd - startingCapitalUsd) / startingCapitalUsd) * 100).toFixed(2)),
      realizedPnlUsd: reconstructedRealizedPnlUsd,
      unrealizedPnlUsd: reconstructedUnrealizedPnlUsd,
      todayPnlUsd: 0,
      todayReturnPercent: 0,
      weeklyPnlUsd: 0,
      monthlyPnlUsd: 0,
      maxDrawdownPercent: 0,
      winRatePercent: 0,
      profitFactor: 0,
      expectedValuePerTradeUsd: 0,
      sharpeRatio: 0,
      averageSlippageBps: 0,
      averageDetectionLatencyMs: 0,
      copyEfficiencyPercent: 0,
      totalTradesCount: closedTrades.length,
      openPositionsCount: openPositions.length,
      totalFeesPaidUsd: reconstructedFeesPaidUsd,
      equityHistory: []
    };

    const auditResult = this.validatePortfolioReconciliation(
      dummyPortfolio,
      openPositions,
      closedTrades
    );

    return {
      reconstructedCashUsd,
      reconstructedPositionsValueUsd,
      reconstructedRealizedPnlUsd,
      reconstructedUnrealizedPnlUsd,
      reconstructedEquityUsd,
      reconstructedFeesPaidUsd,
      auditResult
    };
  }
}
