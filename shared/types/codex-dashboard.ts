export interface CodexSessionSourceItem {
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

export interface CodexSessionUsageItem {
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

export interface CodexTokenUsageRow {
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
