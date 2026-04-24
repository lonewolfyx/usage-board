import type { ProjectUsageItem, TrendTone } from './usage-dashboard'

export interface DashboardOverviewCard {
    detail?: string
    icon: string
    name: string
    trend: string
    trendTone: TrendTone
    value: string
}

export interface FeaturedProjectItem extends ProjectUsageItem {
    shortName: string
    trend: string
    trendTone: TrendTone
}

export interface SessionProjectDatum {
    costLabel: string
    costScore: number
    costUSD: number
    durationLabel: string
    durationMinutes: number
    durationScore: number
    index: number
    project: string
    sessionCount: number
    tokenLabel: string
    tokenScore: number
    tokenTotal: number
}

export interface StackedBarTooltipDatum {
    datum: SessionProjectDatum
    stackIndex: number
}

export interface ModelSeriesDatum {
    month: string
    monthIndex: number
    tokensByModel: Record<string, number>
    totalTokens: number
}

export interface ModelSeries {
    color: string
    model: string
    totalLabel: string
    totalTokens: number
}

export interface CacheSegment {
    color: string
    key: string
    label: string
    shareLabel: string
    value: number
    valueLabel: string
}

export interface DonutTooltipDatum {
    data: CacheSegment
}
