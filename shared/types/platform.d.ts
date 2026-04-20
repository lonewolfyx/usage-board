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
        id?: string
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

export interface CodexSessionIndexLine {
    id?: string
    thread_name?: string
    updated_at?: string
}

export interface TokenUsageDelta {
    cachedInputTokens: number
    inputTokens: number
    outputTokens: number
    reasoningOutputTokens: number
    totalTokens: number
}

/** Normalized usage event emitted by platform loaders for date, project, model, and session aggregation. */
export interface UsageAggregateEvent extends TokenUsageDelta {
    costUSD?: number
    isFallbackModel: boolean
    model: string
    project: string
    repository: string
    sessionId: string
    timestamp: string
}

/** Optional aggregation behavior, allowing platforms to override cost calculation or filter hidden models. */
export interface AggregateOptions<TEvent extends UsageAggregateEvent> {
    getCostUSD?: (event: TEvent) => number
    includeModel?: (event: TEvent) => boolean
}

export interface RawUsage {
    cached_input_tokens: number
    input_tokens: number
    output_tokens: number
    reasoning_output_tokens: number
    total_tokens: number
}

export interface UsageSessionMeta {
    durationMinutes: number
    project: string
    repository: string
    sessionId: string
    startedAt: string
    threadName: string
}

export type CodexSessionMeta = UsageSessionMeta

export type CodexTokenUsageEvent = UsageAggregateEvent

export interface CodexSessionFileData {
    events: CodexTokenUsageEvent[]
    meta: UsageSessionMeta
}

export interface GeminiSessionFileData {
    events: GeminiTokenUsageEvent[]
    meta: UsageSessionMeta
}

export interface GeminiTokenUsageEvent extends UsageAggregateEvent {
    costUSD: number
    toolTokens: number
}

export interface GeminiSessionFile {
    lastUpdated?: string
    messages: GeminiSessionMessage[]
    sessionId?: string
    startTime?: string
    summary?: string
}

export interface GeminiSessionMessage {
    content?: string | Array<{ text?: string }>
    model?: string
    timestamp?: string
    tokens?: GeminiTokenSnapshot
    type?: string
}

export interface GeminiTokenSnapshot {
    cached?: number
    input?: number
    output?: number
    thoughts?: number
    tool?: number
    total?: number
}

export interface ClaudeUsageRecord {
    costUSD?: number
    cwd?: string
    message: {
        content?: Array<{ text?: string }>
        id?: string
        model?: string
        usage: {
            cache_creation_input_tokens?: number
            cache_read_input_tokens?: number
            input_tokens: number
            output_tokens: number
            speed?: 'fast' | 'standard'
        }
    }
    requestId?: string
    sessionId?: string
    timestamp: string
    version?: string
}

export interface ClaudeTokenTotals {
    cacheCreationTokens: number
    cacheReadTokens: number
    inputTokens: number
    outputTokens: number
}

export interface ClaudeUsageEntry extends ClaudeTokenTotals {
    costUSD: number
    cwd?: string
    model: string
    projectPath: string
    rawModel?: string
    sessionId: string
    timestamp: string
}

export type ClaudeSessionSummary = SessionUsageSummaryLike & ClaudeTokenTotals

export interface ClaudeAggregateEvent extends UsageAggregateEvent, ClaudeTokenTotals {
    costUSD: number
}

export interface ClaudeModelUsageSummary extends TokenUsageDelta, ClaudeTokenTotals {
    costUSD: number
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

export interface ModelUsageSummary {
    cachedInputTokens: number
    inputTokens: number
    isFallback: boolean
    outputTokens: number
    reasoningOutputTokens: number
    totalTokens: number
}

export type CodexModelUsageSummary = ModelUsageSummary

export interface DailyUsageSummaryGroup extends SessionAggregateGroup {
    dateKey: string
    displayLabel: string
    modelUsage: Map<string, ModelUsageSummary>
    sessionIds: Set<string>
}

export interface SessionUsageSummary extends SessionUsageSummaryLike {
    cachedInputTokens: number
    reasoningOutputTokens: number
}

/** Minimal shared session summary shape that covers Codex, Gemini, and Claude Code differences. */
export interface SessionUsageSummaryLike {
    costUSD: number
    durationMinutes: number
    inputTokens: number
    lastActivity: string
    models: string[]
    outputTokens: number
    project: string
    repository: string
    sessionId: string
    startedAt: string
    threadName: string
    tokenTotal: number
    topModel: string
}

/** Field access options used when converting session summaries into display rows. */
export interface SessionUsageOptions<TSession extends SessionUsageSummaryLike> {
    getCachedInputTokens?: (session: TSession) => number
    getReasoningOutputTokens?: (session: TSession) => number
}

export interface TokenCostUsage {
    cachedInputTokens: number
    cacheCreationTokens?: number
    inputTokens: number
    outputTokens: number
}

export interface ModelPricing {
    cachedInputCostPerMTokens: number
    cachedInputCostPerMTokensAbove200K?: number
    cacheCreationInputCostPerMTokens: number
    cacheCreationInputCostPerMTokensAbove200K?: number
    fastMultiplier?: number
    inputCostPerMTokensAbove200K?: number
    inputCostPerMTokens: number
    outputCostPerMTokensAbove200K?: number
    outputCostPerMTokens: number
}

export interface LiteLLMModelPricing {
    cache_creation_input_token_cost?: number
    cache_creation_input_token_cost_above_200k_tokens?: number
    cache_read_input_token_cost?: number
    cache_read_input_token_cost_above_200k_tokens?: number
    input_cost_per_token?: number
    input_cost_per_token_above_200k_tokens?: number
    output_cost_per_token_above_200k_tokens?: number
    output_cost_per_token?: number
    provider_specific_entry?: {
        fast?: number
    }
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
