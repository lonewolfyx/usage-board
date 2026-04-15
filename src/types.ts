import type { CodexSessionUsageItem, CodexTokenUsageRow } from '#shared/types/codex-dashboard'
import type { DailyTokenUsage, MonthlyModelUsage, ProjectUsageItem } from '#shared/types/usage-dashboard'

export interface IOptions {
    '--': any
    'host': string
    'port': number
    'open': boolean
}

export interface IConfig {
    host: string
    port: number
    open: boolean
    cwd: string
    home: string
    openCodePath: string | null
    codexPath: string
}

export type TrendTone = 'down' | 'neutral' | 'up'

export interface CodexOverviewCard {
    icon: string
    name: string
    trend: string
    trendTone: TrendTone
    value: string
}

export interface CodexTopProject {
    project: string
    sessionCount: number
}

export interface CodexTopModel {
    model: string
    totalTokens: number
}

export interface LoadCodexUsageResult {
    dailyRows: CodexTokenUsageRow[]
    dailyTokenUsage: DailyTokenUsage[]
    monthlyModelUsage: MonthlyModelUsage[]
    monthlyRows: CodexTokenUsageRow[]
    overviewCards: CodexOverviewCard[]
    projectUsage: ProjectUsageItem[]
    sessionRows: CodexTokenUsageRow[]
    sessionUsage: CodexSessionUsageItem[]
    todayTopModel: CodexTopModel | null
    todayTopProject: CodexTopProject | null
    todayTotalCost: number
    todayTotalTokens: number
    weeklyRows: CodexTokenUsageRow[]
}

export interface TokenUsageSnapshot {
    cache_read_input_tokens?: number
    cached_input_tokens?: number
    input_tokens?: number
    output_tokens?: number
    reasoning_output_tokens?: number
    total_tokens?: number
}

export interface SessionLogLine {
    timestamp?: string
    type?: string
    payload?: {
        [key: string]: unknown
        info?: {
            [key: string]: unknown
            last_token_usage?: TokenUsageSnapshot
            total_token_usage?: TokenUsageSnapshot
        } | null
        message?: string
        metadata?: {
            model?: string
        }
        model?: string
        model_name?: string
        timestamp?: string
        type?: string
        cwd?: string
        git?: {
            repository_url?: string
        }
    }
}

export interface TokenUsageDelta {
    cachedInputTokens: number
    inputTokens: number
    outputTokens: number
    reasoningOutputTokens: number
    totalTokens: number
}

export interface RawUsage {
    cached_input_tokens: number
    input_tokens: number
    output_tokens: number
    reasoning_output_tokens: number
    total_tokens: number
}

export interface CodexSessionMeta {
    durationMinutes: number
    project: string
    repository: string
    sessionId: string
    startedAt: string
    threadName: string
}

export interface CodexTokenUsageEvent extends TokenUsageDelta {
    isFallbackModel: boolean
    model: string
    project: string
    repository: string
    sessionId: string
    timestamp: string
}

export interface CodexSessionFileData {
    events: CodexTokenUsageEvent[]
    meta: CodexSessionMeta
}

export interface SessionAggregateGroup {
    cachedInputTokens: number
    costUSD: number
    inputTokens: number
    label: string
    models: string[]
    outputTokens: number
    projects: string[]
    reasoningOutputTokens: number
    sessionCount: number
    totalTokens: number
}

export interface PeriodRowGroup extends SessionAggregateGroup {
    sessionIds: Set<string>
}

export interface CodexModelUsageSummary {
    cachedInputTokens: number
    inputTokens: number
    isFallback: boolean
    outputTokens: number
    reasoningOutputTokens: number
    totalTokens: number
}

export interface DailyUsageSummaryGroup extends SessionAggregateGroup {
    dateKey: string
    displayLabel: string
    modelUsage: Map<string, CodexModelUsageSummary>
    sessionIds: Set<string>
}

export interface SessionUsageSummary {
    cachedInputTokens: number
    costUSD: number
    durationMinutes: number
    inputTokens: number
    lastActivity: string
    models: string[]
    outputTokens: number
    project: string
    reasoningOutputTokens: number
    repository: string
    sessionId: string
    startedAt: string
    threadName: string
    tokenTotal: number
    topModel: string
}

export interface TokenCostUsage {
    cachedInputTokens: number
    inputTokens: number
    outputTokens: number
}

export interface ModelPricing {
    cachedInputCostPerMTokens: number
    inputCostPerMTokens: number
    outputCostPerMTokens: number
}

export interface LiteLLMModelPricing {
    cache_read_input_token_cost?: number
    input_cost_per_token?: number
    output_cost_per_token?: number
}

export type LiteLLMPricingDataset = Record<string, LiteLLMModelPricing>
export type ModelPricingResolver = (model: string) => ModelPricing

export interface PricingCacheEntry {
    fetchedAt: number
    promise?: Promise<LiteLLMPricingDataset>
    value?: LiteLLMPricingDataset
}

export interface FetchLiteLLMPricingDatasetOptions {
    cacheTtlMs?: number
    fetcher?: typeof fetch
    forceRefresh?: boolean
    url?: string
}

export interface CreateLiteLLMPricingResolverOptions extends FetchLiteLLMPricingDatasetOptions {
    aliases?: Record<string, string>
    fallbackModel?: string
    fallbackPricingTable?: Record<string, ModelPricing>
    getLookupCandidates?: (model: string) => string[]
    isZeroCostModel?: (model: string) => boolean
}
