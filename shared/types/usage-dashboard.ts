export interface ModelTokenUsage {
    inputTokens: number
    cachedInputTokens: number
    outputTokens: number
    reasoningOutputTokens: number
    totalTokens: number
    isFallback: boolean
}

export type TrendTone = 'down' | 'neutral' | 'up'

export interface UsageOverviewCard {
    icon: string
    name: string
    trend: string
    trendTone: TrendTone
    value: string
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

export interface ProjectInteractionUsage {
    cachedInputTokens: number
    cacheCreationTokens?: number
    cacheReadTokens?: number
    costUSD: number
    inputTokens: number
    isFallbackModel?: boolean
    outputTokens: number
    reasoningOutputTokens: number
    toolTokens?: number
    totalTokens: number
}

export type ProjectInteractionRole = 'assistant' | 'system' | 'tool' | 'unknown' | 'usage' | 'user'

export interface ProjectSessionInteractionItem {
    content: string
    costUSD: number
    index: number
    model: string | null
    raw: unknown
    role: ProjectInteractionRole
    timestamp: string | null
    type: string
    usage: ProjectInteractionUsage | null
}

export interface ProjectSessionUsageItem extends UsageSessionUsageItem {
    interactions: ProjectSessionInteractionItem[]
    models: string[]
}

export interface ProjectPlatformUsage extends LoadUsageResult {
    sessions: ProjectSessionUsageItem[]
}

export interface ProjectUsageAnalyzing {
    claudeCode: ProjectPlatformUsage
    codex: ProjectPlatformUsage
    gemini: ProjectPlatformUsage
}

export interface ProjectUsageDetail {
    label: string
    models: string[]
    createTime: string | null
    sessionCound: number
    analyzing: ProjectUsageAnalyzing
}

export type LoadProjectsUsageResult = Array<Record<string, ProjectUsageDetail>>

export interface UsageTopProject {
    project: string
    sessionCount: number
}

export interface UsageTopModel {
    model: string
    totalTokens: number
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

export interface LoadUsageResult {
    dailyRows: TokenUsageRow[]
    dailyTokenUsage: DailyTokenUsage[]
    monthlyModelUsage: MonthlyModelUsage[]
    monthlyRows: TokenUsageRow[]
    overviewCards: UsageOverviewCard[]
    projectUsage: ProjectUsageItem[]
    sessionRows: TokenUsageRow[]
    sessionUsage: UsageSessionUsageItem[]
    todayTopModel: UsageTopModel | null
    todayTopProject: UsageTopProject | null
    todayTotalCost: number
    todayTotalTokens: number
    weeklyRows: TokenUsageRow[]
}

export interface TokensConsumptionResult {
    version: string
    claudeCode: LoadUsageResult
    codex: LoadUsageResult
    gemini: LoadUsageResult
}

export type PayloadDashboardKey = 'claudeCode' | 'codex' | 'gemini'
