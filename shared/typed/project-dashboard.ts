import type { AiIconName } from '#shared/types/navigation'
import type { TrendTone } from '#shared/types/usage-dashboard'

export type PlatformKey = 'all' | 'claudeCode' | 'codex' | 'gemini'
export type ProductPlatformKey = Exclude<PlatformKey, 'all'>
export type TableTab = 'day' | 'month' | 'session' | 'week'

export interface MockProject {
    id: string
    name: string
    owner: string
    repository: string
    since: string
    status: string
}

export interface UsageSummarySource {
    cacheTokens: number
    cost: number
    inputTokens: number
    outputTokens: number
    reasoningTokens: number
    tokens: number
}

export interface MockSession extends UsageSummarySource {
    duration: string
    id: string
    model: string
    platform: ProductPlatformKey
    projectId: string
    startedAt: string
    title: string
}

export interface OverviewCard {
    icon: string
    name: string
    trend: string
    trendTone: TrendTone
    value: string
}

export interface LineSeries {
    color: string
    label: string
    points: number[]
}

export interface SessionTableRow {
    cacheTokens: string
    cost: string
    duration: string
    id: string
    inputTokens: string
    model: string
    outputTokens: string
    platform: ProductPlatformKey
    reasoningTokens: string
    startedAt: string
    title: string
    tokens: string
}

export interface TokenUsageRow {
    cacheTokens: string
    cost: string
    inputTokens: string
    label: string
    models: string
    outputTokens: string
    reasoningTokens: string
    sessions: string
    tokens: string
}

export interface TabSummary {
    cost: string
    label: string
    sessions: string
    tokens: string
}

export interface UsageSummary {
    cacheRate: number
    cacheTokens: number
    cost: number
    inputTokens: number
    outputTokens: number
    reasoningTokens: number
    sessions: number
    tokens: number
}

export interface ProjectDashboardTab {
    aiIcon?: AiIconName
    color?: string
    label: string
    value: PlatformKey
}

export interface ProjectDashboardPlatformTab extends ProjectDashboardTab {
    aiIcon: AiIconName
    color: string
    value: ProductPlatformKey
}

export interface DailySessionGroup {
    items: MockSession[]
    key: string
    label: string
    shortLabel: string
}

export interface PeriodSessionGroup {
    items: MockSession[]
    label: string
}

export interface PlatformView {
    modelSeries: LineSeries[]
    monthRows: TokenUsageRow[]
    overviewCards: OverviewCard[]
    sessionRows: TokenUsageRow[]
    sessionTableRows: SessionTableRow[]
    dayRows: TokenUsageRow[]
    weekRows: TokenUsageRow[]
    yearSeries: LineSeries[]
}
