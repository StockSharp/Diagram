// Shared localization bridge. A host can provide localized values through
// `window.__designerI18n`; every module reads them through `t(key, fallback)`.
// The English fallback prevents a missing or stale key from rendering blank.

export interface DesignerI18n {
    // Panel titles (GoldenLayout tabs).
    panelStrategies?: string;
    panelPalette?: string;
    panelProperties?: string;
    panelDiagram?: string;
    panelOutput?: string;
    panelErrors?: string;
    panelCode?: string;
    panelBacktest?: string;
    panelOptimizer?: string;
    panelLive?: string;
    liveNoRuns?: string;
    selectAnElement?: string;
    noErrors?: string;

    // Solution explorer.
    strategies?: string;
    noStrategiesYet?: string;
    rename?: string;
    newStrategy?: string;
    refresh?: string;
    run?: string;
    stop?: string;
    newIndicator?: string;
    newComposite?: string;
    newCodeStrategy?: string;
    codeLanguagePrompt?: string;
    groupStrategies?: string;
    groupComposites?: string;
    groupIndicators?: string;
    noComposites?: string;
    noIndicators?: string;
    groupOptimizations?: string;
    groupLive?: string;
    optReady?: string;
    optNoStrategy?: string;
    btReady?: string;
    btNoStrategy?: string;
    noOptimizations?: string;
    newOptimization?: string;
    optimize?: string;
    duplicate?: string;
    delete?: string;
    create?: string;
    deleteStrategyTitle?: string;
    deleteStrategyMsg?: string;
    ctxExport?: string;
    encryptTitle?: string;
    encryptLabel?: string;
    importEncTitle?: string;
    importEncLabel?: string;
    importEncRetry?: string;

    // Property grid.
    openDocumentation?: string;
    selectPlaceholder?: string;
    notANumber?: string;
    expectedTimeSpan?: string;
    basicSettings?: string;
    advancedSettings?: string;
    noParameters?: string;
    noBasicParameters?: string;
    noneOption?: string;
    loadingParameters?: string;

    // Modals / generic.
    loading?: string;
    cancel?: string;

    // Discard-confirm dialog.
    discardTitle?: string;
    discardOpenMsg?: string;
    discardCreateMsg?: string;
    discardOpenOk?: string;
    discardCreateOk?: string;

    // Node / diagram authoring.
    nodeMessage?: string;
    nodeName?: string;
    strategyNamePrompt?: string;
    untitledStrategy?: string;
    annotationPlaceholder?: string;
    searchPlaceholder?: string;
    noMatches?: string;

    // Diagram context menu.
    undo?: string;
    redo?: string;
    cut?: string;
    copy?: string;
    paste?: string;
    ctxOpen?: string;
    properties?: string;
    ctxHelp?: string;
    collapse?: string;
    expand?: string;

    // Sign-in popup + run-action gating.
    fillEmailPassword?: string;
    signingIn?: string;
    loginFailed?: string;
    connectionError?: string;
    signInToBacktest?: string;
    signInToExport?: string;
    signInToOptimize?: string;
    signInToRunLive?: string;

    // Strategy-level properties.
    statusLabel?: string;
    statusSaved?: string;
    statusModified?: string;

    // Backtest / optimizer chrome.
    loadingEllipsis?: string;
    failed?: string;
    optGrid?: string;
    optHeatmap?: string;
    opt3d?: string;
    optPickRow?: string;

    // Backtest/optimizer statistic names (StatisticParameterTypes), shown in the
    // backtest stats grid and the optimizer result columns / chart axes.
    stat_winning_trades?: string;
    stat_trade_count?: string;
    stat_roundtrip_count?: string;
    stat_avg_trade_profit?: string;
    stat_avg_win?: string;
    stat_avg_loss?: string;
    stat_losing_trades?: string;
    stat_max_long_position?: string;
    stat_max_short_position?: string;
    stat_max_profit?: string;
    stat_max_drawdown?: string;
    stat_max_relative_drawdown?: string;
    stat_return?: string;
    stat_recovery_factor?: string;
    stat_net_profit?: string;
    stat_max_latency_reg?: string;
    stat_max_latency_cancel?: string;
    stat_min_latency_reg?: string;
    stat_min_latency_cancel?: string;
    stat_order_count?: string;
    stat_order_error_count?: string;
    stat_insufficient_fund_errors?: string;
    stat_trades_per_month?: string;
    stat_trades_per_day?: string;
    stat_max_drawdown_date?: string;
    stat_max_profit_date?: string;
    stat_commission?: string;
    stat_max_drawdown_percent?: string;
    stat_net_profit_percent?: string;
    stat_sharpe_ratio?: string;
    stat_sortino_ratio?: string;
    stat_profit_factor?: string;
    stat_expectancy?: string;
    stat_calmar_ratio?: string;
    stat_sterling_ratio?: string;
    stat_avg_drawdown?: string;
    stat_order_cancel_errors?: string;
    stat_gross_loss?: string;
    stat_gross_profit?: string;
    stat_max_profit_percent?: string;
    stat_sharpe?: string; // short grid-header form
    stat_trades?: string; // short grid-header form

    // Backtest run status / errors.
    btstat_starting?: string;
    btstat_done?: string;
    btstat_stopped?: string;
    btstat_failed?: string;
    bterr_chart_runtime_missing?: string;

    // Order side labels.
    order_buy?: string;
    order_sell?: string;

    // Log level names.
    loglevel_inherit?: string;
    loglevel_verbose?: string;
    loglevel_debug?: string;
    loglevel_info?: string;
    loglevel_warning?: string;
    loglevel_error?: string;
    loglevel_off?: string;

    // Optimizer status / errors / messages.
    opt_no_params?: string;
    opt_bool_values?: string;
    optstat_starting?: string;
    optstat_done?: string;
    optstat_stopped?: string;
    optstat_failed?: string;
    opterr_plotly_missing?: string;
}

const i18n: DesignerI18n =
    typeof window === 'undefined'
        ? {}
        : (window as unknown as { __designerI18n?: DesignerI18n }).__designerI18n ?? {};

/// Localized string for `key`, or `fallback` (English) when the host
/// didn't provide it.
export function t(key: keyof DesignerI18n, fallback: string): string {
    return i18n[key] ?? fallback;
}
