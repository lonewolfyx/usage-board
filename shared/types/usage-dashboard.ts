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

export interface SessionUsageItem {
    id: string
    project: string
    model: string
    duration: string
    tokenTotal: number
    costUSD: number
}
