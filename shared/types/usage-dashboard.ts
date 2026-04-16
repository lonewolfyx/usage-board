export interface ModelTokenUsage {
    inputTokens: number
    cachedInputTokens: number
    outputTokens: number
    reasoningOutputTokens: number
    totalTokens: number
    isFallback: boolean
}

export interface MonthlyModelUsage {
    model: string
    month: string
    tokenTotal: number
}

export interface DailyTokenUsage {
    date: string
    inputTokens: number
    cachedInputTokens: number
    outputTokens: number
    reasoningOutputTokens: number
    totalTokens: number
    costUSD: number
    models: Record<string, ModelTokenUsage>
}

export interface RankedUsageItem {
    label: string
    value: string
    detail: string
    percent: number
    tone?: 'default' | 'green' | 'amber' | 'sky' | 'rose'
}

export interface ProjectUsageItem extends RankedUsageItem {
    repository: string
    sessions: number
    tokenTotal: number
    costUSD: number
}

export interface UsageSessionSourceItem {
    sessionId: string
    threadName: string
    project: string
    repository: string
    model: string
    startedAt: string
    durationMinutes: number
    inputTokens: number
    cachedInputTokens: number
    outputTokens: number
    reasoningOutputTokens: number
    costUSD: number
}

export interface UsageSessionUsageItem {
    id: string
    sessionId: string
    threadName: string
    project: string
    repository: string
    model: string
    startedAt: string
    date: string
    month: string
    week: string
    duration: string
    durationMinutes: number
    inputTokens: number
    cachedInputTokens: number
    outputTokens: number
    reasoningOutputTokens: number
    tokenTotal: number
    costUSD: number
}

export interface SessionUsageItem {
    id: string
    project: string
    model: string
    duration: string
    tokenTotal: number
    costUSD: number
}

export interface TokenUsageRow {
    id: string
    label: string
    period: string
    models: string[]
    projects: string[]
    sessionCount: number
    inputTokens: number
    cachedInputTokens: number
    outputTokens: number
    reasoningOutputTokens: number
    totalTokens: number
    costUSD: number
}
