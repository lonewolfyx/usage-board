import type { ProjectUsagePlatformRecord } from '#shared/types/ai'
import type {
    AgentDashboardCoreModules,
    AgentDashboardInsightsModules,
    AgentDashboardModules,
    AgentDashboardSessionModules,
    HomeDashboardCoreModules,
    HomeDashboardModules,
    HomeDashboardSessionModules,
    HomeDashboardUsageModules,
} from '#shared/types/analysis'
import type { LoadUsageResult, RankedUsageItem, UsageOverviewCard } from '#shared/types/usage-dashboard'
import { createEmptyLoadUsageResult } from '#shared/platform/defaults'
import { PROJECT_USAGE_PLATFORMS } from '#shared/types/ai'
import {
    buildGrowthTrend,
    buildProjectUsage,
    formatCompactNumber,
    formatCurrency,
    formatPercent,
    getDateKey,
    getDateKeyFromLabel,
    getPreviousDateKey,
    mergeDailyTokenUsage,
    mergeMonthlyModelUsage,
} from '#shared/utils/usage-dashboard'
import { formatNumber } from '@lonewolfyx/utils'

export function createEmptyHomeDashboardModules(): HomeDashboardModules {
    return {
        ...createEmptyHomeDashboardCoreModules(),
        ...createEmptyHomeDashboardUsageModules(),
        ...createEmptyHomeDashboardSessionModules(),
    }
}

export function createEmptyHomeDashboardCoreModules(): HomeDashboardCoreModules {
    return {
        hotProjects: [],
        modelUsage: [],
        overviewCards: [],
    }
}

export function createEmptyHomeDashboardUsageModules(): HomeDashboardUsageModules {
    return {
        dailyTokenUsage: [],
        efficiencyMetrics: [],
    }
}

export function createEmptyHomeDashboardSessionModules(): HomeDashboardSessionModules {
    return {
        sessionAnalysis: {
            items: [],
            totalSessions: 0,
        },
    }
}

export function createEmptyAgentDashboardModules(): AgentDashboardModules {
    return {
        ...createEmptyAgentDashboardCoreModules(),
        ...createEmptyAgentDashboardInsightsModules(),
        ...createEmptyAgentDashboardSessionModules(),
    }
}

export function createEmptyAgentDashboardCoreModules(): AgentDashboardCoreModules {
    const source = createEmptyLoadUsageResult()

    return {
        dailyRows: source.dailyRows,
        dailyTokenUsage: source.dailyTokenUsage,
        monthlyModelUsage: source.monthlyModelUsage,
        overviewCards: source.overviewCards,
    }
}

export function createEmptyAgentDashboardInsightsModules(): AgentDashboardInsightsModules {
    const source = createEmptyLoadUsageResult()

    return {
        monthlyRows: source.monthlyRows,
        projectUsage: source.projectUsage,
        sessionRows: source.sessionRows,
        weeklyRows: source.weeklyRows,
    }
}

export function createEmptyAgentDashboardSessionModules(): AgentDashboardSessionModules {
    return {
        sessionUsage: createEmptyLoadUsageResult().sessionUsage,
    }
}

export function buildHomeDashboardModules(
    dashboardsByPlatform: ProjectUsagePlatformRecord<LoadUsageResult>,
): HomeDashboardModules {
    const sessionUsage = buildSessionUsage(dashboardsByPlatform)
    const dailyTokenUsage = mergeDailyTokenUsage(
        PROJECT_USAGE_PLATFORMS.flatMap(platform => dashboardsByPlatform[platform].dailyTokenUsage),
    )
    const monthlyModelUsage = mergeMonthlyModelUsage(
        PROJECT_USAGE_PLATFORMS.flatMap(platform => dashboardsByPlatform[platform].monthlyModelUsage),
    )
    const projectUsage = buildProjectUsage(sessionUsage)
    const totalCost = dailyTokenUsage.reduce((sum, item) => sum + item.costUSD, 0)
    const totalTokens = dailyTokenUsage.reduce((sum, item) => sum + item.totalTokens, 0)
    const inputTokens = dailyTokenUsage.reduce((sum, item) => sum + item.inputTokens, 0)
    const cachedInputTokens = dailyTokenUsage.reduce((sum, item) => sum + item.cachedInputTokens, 0)
    const outputTokens = dailyTokenUsage.reduce((sum, item) => sum + item.outputTokens, 0)
    const reasoningOutputTokens = dailyTokenUsage.reduce((sum, item) => sum + item.reasoningOutputTokens, 0)
    const totalSessions = sessionUsage.length
    const todayDateKey = getDateKey(new Date())
    const previousDayDateKey = getPreviousDateKey(todayDateKey)
    const todayDailyUsage = dailyTokenUsage.find(item => getDateKeyFromLabel(item.date) === todayDateKey)
    const previousDayDailyUsage = dailyTokenUsage.find(item => getDateKeyFromLabel(item.date) === previousDayDateKey)
    const costGrowthTrend = buildGrowthTrend(
        todayDailyUsage?.costUSD ?? 0,
        previousDayDailyUsage?.costUSD ?? 0,
        formatCurrency,
    )
    const tokenGrowthTrend = buildGrowthTrend(
        todayDailyUsage?.totalTokens ?? 0,
        previousDayDailyUsage?.totalTokens ?? 0,
        formatCompactNumber,
    )
    const efficiencyMetrics = buildEfficiencyMetrics({
        cachedInputTokens,
        inputTokens,
        outputTokens,
        reasoningOutputTokens,
        totalTokens,
    })

    return {
        dailyTokenUsage,
        efficiencyMetrics,
        hotProjects: projectUsage,
        modelUsage: monthlyModelUsage,
        overviewCards: buildHomeOverviewCards({
            cachedInputTokens,
            costGrowthTrend,
            inputTokens,
            tokenGrowthTrend,
            totalCost,
            totalSessions,
            totalTokens,
        }),
        sessionAnalysis: {
            items: sessionUsage,
            totalSessions,
        },
    }
}

function buildSessionUsage(dashboardsByPlatform: ProjectUsagePlatformRecord<LoadUsageResult>) {
    return PROJECT_USAGE_PLATFORMS
        .flatMap(platform => dashboardsByPlatform[platform].sessionUsage.map(session => ({
            ...session,
            id: `${platform}:${session.id}`,
            sessionId: `${platform}:${session.sessionId}`,
        })))
        .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
}

function buildHomeOverviewCards(options: {
    cachedInputTokens: number
    costGrowthTrend: Pick<UsageOverviewCard, 'trend' | 'trendTone'>
    inputTokens: number
    tokenGrowthTrend: Pick<UsageOverviewCard, 'trend' | 'trendTone'>
    totalCost: number
    totalSessions: number
    totalTokens: number
}): UsageOverviewCard[] {
    return [
        {
            detail: `${formatCurrency(options.totalCost)} total spend across all tools`,
            icon: 'lucide:wallet',
            name: 'Total Spend',
            trend: options.costGrowthTrend.trend,
            trendTone: options.costGrowthTrend.trendTone,
            value: formatCurrency(options.totalCost),
        },
        {
            detail: `${formatNumber(options.totalTokens)} total tokens across all tools`,
            icon: 'solar:cpu-line-duotone',
            name: 'Token Usage',
            trend: options.tokenGrowthTrend.trend,
            trendTone: options.tokenGrowthTrend.trendTone,
            value: formatCompactNumber(options.totalTokens),
        },
        {
            detail: `${formatNumber(options.cachedInputTokens)} of ${formatNumber(options.inputTokens)} input tokens were served from cache`,
            icon: 'lucide:database-zap',
            name: 'Cache Hit Rate',
            trend: `${formatCompactNumber(options.cachedInputTokens)} cached`,
            trendTone: 'neutral',
            value: formatPercent(options.inputTokens > 0 ? options.cachedInputTokens / options.inputTokens : 0),
        },
        {
            detail: `${formatCurrency(options.totalCost)} across ${formatNumber(options.totalSessions)} sessions`,
            icon: 'lucide:receipt-text',
            name: 'Avg Session Cost',
            trend: 'across all tools',
            trendTone: 'neutral',
            value: formatCurrency(options.totalSessions > 0 ? options.totalCost / options.totalSessions : 0),
        },
    ]
}

function buildEfficiencyMetrics(options: {
    cachedInputTokens: number
    inputTokens: number
    outputTokens: number
    reasoningOutputTokens: number
    totalTokens: number
}): RankedUsageItem[] {
    const cacheHitRate = safeRatio(options.cachedInputTokens, options.inputTokens)
    const reasoningShare = safeRatio(options.reasoningOutputTokens, options.totalTokens)
    const outputShare = safeRatio(options.outputTokens, options.totalTokens)

    return [
        {
            detail: `${formatCompactNumber(options.cachedInputTokens)} cached input tokens`,
            label: 'Cache Hit Rate',
            percent: cacheHitRate * 100,
            tone: 'green',
            value: formatPercent(cacheHitRate),
        },
        {
            detail: `${formatCompactNumber(options.reasoningOutputTokens)} reasoning output tokens`,
            label: 'Reasoning Token Share',
            percent: reasoningShare * 100,
            tone: 'amber',
            value: formatPercent(reasoningShare),
        },
        {
            detail: `${formatCompactNumber(options.outputTokens)} output tokens`,
            label: 'Output Token Share',
            percent: outputShare * 100,
            tone: 'sky',
            value: formatPercent(outputShare),
        },
    ]
}

function safeRatio(numerator: number, denominator: number) {
    return denominator > 0 ? numerator / denominator : 0
}
