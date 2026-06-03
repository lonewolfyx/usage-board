import type { ProjectUsagePlatform, ProjectUsagePlatformRecord } from '#shared/types/ai'
import type {
    AgentDashboardCoreModules,
    AgentDashboardInsightsModules,
    AgentDashboardSessionModules,
    HomeDashboardCoreModules,
    HomeDashboardModules,
    HomeDashboardSessionModules,
    HomeDashboardTodayInsights,
    HomeDashboardUsageModules,
} from '#shared/types/analysis'
import type { PaginationMeta } from '#shared/types/pagination'
import type { HourlyUsagePoint, LoadUsageResult, ProjectSessionUsageItem, RankedUsageItem, UsageOverviewCard } from '#shared/types/usage-dashboard'
import { createEmptyLoadUsageResult } from '#shared/platform/defaults'
import { PROJECT_USAGE_PLATFORMS } from '#shared/types/ai'
import { DEFAULT_PAGE_SIZE } from '#shared/types/pagination'
import {
    buildGrowthTrend,
    buildInputOutputTokenSubvalue,
    buildPercentTrend,
    buildProjectUsage,
    formatCompactNumber,
    formatCurrency,
    formatPercent,
    getDateKey,
    getDateKeyFromLabel,
    getPreviousDateKey,
    mergeDailyTokenUsage,
    mergeMonthlyModelUsage,
    roundCurrency,
} from '#shared/utils/usage-dashboard'
import { formatNumber } from '@lonewolfyx/utils'

const TOP_PROJECT_LIMIT = 10

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
        todayHourlyUsage: [],
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

export function createEmptyAgentDashboardCoreModules(): AgentDashboardCoreModules {
    const source = createEmptyLoadUsageResult()

    return {
        dailyRows: source.dailyRows,
        dailyRowsPagination: createEmptyPaginationMeta(),
        dailyTokenUsage: source.dailyTokenUsage,
        monthlyModelUsage: source.monthlyModelUsage,
        overviewCards: source.overviewCards,
    }
}

export function createEmptyAgentDashboardInsightsModules(): AgentDashboardInsightsModules {
    const source = createEmptyLoadUsageResult()

    return {
        monthlyRows: source.monthlyRows,
        monthlyRowsPagination: createEmptyPaginationMeta(),
        projectUsage: source.projectUsage,
        sessionRows: source.sessionRows,
        sessionRowsPagination: createEmptyPaginationMeta(),
        weeklyRows: source.weeklyRows,
        weeklyRowsPagination: createEmptyPaginationMeta(),
    }
}

export function createEmptyAgentDashboardSessionModules(): AgentDashboardSessionModules {
    return {
        sessionUsage: [],
        sessionUsagePagination: createEmptyPaginationMeta(),
    }
}

export function createEmptyPaginationMeta(): PaginationMeta {
    return {
        page: 1,
        pageCount: 1,
        pageSize: DEFAULT_PAGE_SIZE,
        total: 0,
    }
}

export function buildHomeDashboardModules(
    dashboardsByPlatform: ProjectUsagePlatformRecord<LoadUsageResult>,
    todayInsights: HomeDashboardTodayInsights | undefined = undefined,
): HomeDashboardModules {
    const sessionUsage = buildSessionUsage(dashboardsByPlatform)
    const dailyTokenUsage = mergeDailyTokenUsage(
        PROJECT_USAGE_PLATFORMS.flatMap(platform =>
            dashboardsByPlatform[platform].dailyTokenUsage.map((item) => {
                return {
                    ...item,
                    platforms: {
                        [platform]: {
                            cachedInputTokens: item.cachedInputTokens,
                            costUSD: item.costUSD,
                            inputTokens: item.inputTokens,
                            models: item.models,
                            outputTokens: item.outputTokens,
                            reasoningOutputTokens: item.reasoningOutputTokens,
                            totalTokens: item.totalTokens,
                        },
                    },
                }
            }),
        ),
    )
    const monthlyModelUsage = mergeMonthlyModelUsage(
        PROJECT_USAGE_PLATFORMS.flatMap(platform => dashboardsByPlatform[platform].monthlyModelUsage),
    )
    const projectUsage = buildProjectUsage(sessionUsage)
    const sessionAnalysisItems = buildHomeSessionAnalysisItems(sessionUsage)
    const totalCost = getSessionUsageCostTotal(sessionUsage)
    const totalTokens = dailyTokenUsage.reduce((sum, item) => sum + item.totalTokens, 0)
    const inputTokens = dailyTokenUsage.reduce((sum, item) => sum + item.inputTokens, 0)
    const cachedInputTokens = dailyTokenUsage.reduce((sum, item) => sum + item.cachedInputTokens, 0)
    const outputTokens = dailyTokenUsage.reduce((sum, item) => sum + item.outputTokens, 0)
    const reasoningOutputTokens = dailyTokenUsage.reduce((sum, item) => sum + item.reasoningOutputTokens, 0)
    const totalSessions = sessionUsage.length
    const efficiencyMetrics = buildEfficiencyMetrics({
        cachedInputTokens,
        inputTokens,
        outputTokens,
        reasoningOutputTokens,
        totalTokens,
    })
    const homeTodayInsights = todayInsights ?? buildHomeTodayInsights(dashboardsByPlatform)
    const todayDateKey = getDateKey(new Date())
    const previousDayDateKey = getPreviousDateKey(todayDateKey)
    const todayUsage = dailyTokenUsage.find(item => getDateKeyFromLabel(item.date) === todayDateKey)
    const previousUsage = dailyTokenUsage.find(item => getDateKeyFromLabel(item.date) === previousDayDateKey)

    return {
        dailyTokenUsage,
        efficiencyMetrics,
        hotProjects: projectUsage,
        modelUsage: monthlyModelUsage,
        overviewCards: buildHomeOverviewCards({
            cachedInputTokens,
            inputTokens,
            previousPromptCount: homeTodayInsights.previousPromptCount,
            previousSessionCount: homeTodayInsights.previousSessionCount,
            previousUsage,
            promptCount: homeTodayInsights.promptCount,
            sessionCount: homeTodayInsights.sessionCount,
            todayHourlyUsage: homeTodayInsights.todayHourlyUsage,
            todayUsage,
            totalCost,
            totalSessions,
            totalTokens,
        }),
        sessionAnalysis: {
            items: sessionAnalysisItems,
            totalSessions,
        },
        todayHourlyUsage: homeTodayInsights.todayHourlyUsage,
    }
}

function buildHomeSessionAnalysisItems(sessionUsage: HomeSessionUsageItem[]) {
    const durationMinutesByProject = new Map<string, number>()

    for (const session of sessionUsage) {
        durationMinutesByProject.set(
            session.project,
            (durationMinutesByProject.get(session.project) ?? 0) + session.durationMinutes,
        )
    }

    return buildProjectUsage(sessionUsage)
        .slice(0, TOP_PROJECT_LIMIT)
        .map(project => ({
            costUSD: project.costUSD,
            duration: formatDuration(durationMinutesByProject.get(project.label) ?? 0),
            durationMinutes: durationMinutesByProject.get(project.label) ?? 0,
            id: project.repository,
            model: '-',
            project: project.label,
            repository: project.repository,
            tokenTotal: project.tokenTotal,
        }))
}

function formatDuration(minutes: number) {
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60

    if (hours === 0) {
        return `${remainingMinutes}m`
    }

    if (remainingMinutes === 0) {
        return `${hours}h`
    }

    return `${hours}h ${remainingMinutes}m`
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

type HomeSessionUsageItem = ReturnType<typeof buildSessionUsage>[number] & Partial<Pick<ProjectSessionUsageItem, 'interactions'>>

function getSessionUsageCostTotal(sessions: HomeSessionUsageItem[]) {
    return roundCurrency(
        sessions.reduce((sessionTotal, session) => {
            if (!session.interactions) {
                return sessionTotal + session.costUSD
            }

            return sessionTotal + session.interactions.reduce((interactionTotal, interaction) => {
                return interactionTotal + (interaction.usage?.costUSD ?? 0)
            }, 0)
        }, 0),
    )
}

function buildHomeOverviewCards(options: {
    cachedInputTokens: number
    inputTokens: number
    previousPromptCount: number
    previousSessionCount: number
    previousUsage: LoadUsageResult['dailyTokenUsage'][number] | undefined
    promptCount: number
    sessionCount: number
    todayHourlyUsage: HourlyUsagePoint[]
    todayUsage: LoadUsageResult['dailyTokenUsage'][number] | undefined
    totalCost: number
    totalSessions: number
    totalTokens: number
}): UsageOverviewCard[] {
    const tokenTrend = buildGrowthTrend(
        options.todayUsage?.totalTokens ?? 0,
        options.previousUsage?.totalTokens ?? 0,
        formatCompactNumber,
    )
    const costTrend = buildGrowthTrend(
        options.todayUsage?.costUSD ?? 0,
        options.previousUsage?.costUSD ?? 0,
        formatCurrency,
    )
    const sessionTrend = buildPercentTrend(options.sessionCount, options.previousSessionCount)
    const promptTrend = buildPercentTrend(options.promptCount, options.previousPromptCount)

    return [
        {
            detail: `${formatNumber(options.todayUsage?.totalTokens ?? 0)} tokens today. Yesterday: ${formatNumber(options.previousUsage?.totalTokens ?? 0)}.`,
            icon: 'solar:cpu-line-duotone',
            name: 'Today Tokens',
            subvalue: buildInputOutputTokenSubvalue(options.todayUsage),
            trend: tokenTrend.trend,
            trendTone: tokenTrend.trendTone,
            value: formatCompactNumber(options.todayUsage?.totalTokens ?? 0),
        },
        {
            detail: `${formatCurrency(options.todayUsage?.costUSD ?? 0)} spent today. Yesterday: ${formatCurrency(options.previousUsage?.costUSD ?? 0)}.`,
            icon: 'lucide:wallet',
            name: 'Today Spend',
            subvalue: {
                items: [
                    {
                        value: `${options.todayHourlyUsage.filter(item => item.totalTokens > 0).length} active hours`,
                    },
                ],
            },
            trend: costTrend.trend,
            trendTone: costTrend.trendTone,
            value: formatCurrency(options.todayUsage?.costUSD ?? 0),
        },
        {
            detail: `${formatNumber(options.sessionCount)} sessions started today. Yesterday: ${formatNumber(options.previousSessionCount)}.`,
            icon: 'lucide:messages-square',
            name: 'Today Sessions',
            trend: sessionTrend.label,
            trendTone: sessionTrend.tone,
            value: formatNumber(options.sessionCount),
        },
        {
            detail: `${formatNumber(options.promptCount)} prompts sent today. Yesterday: ${formatNumber(options.previousPromptCount)}.`,
            icon: 'lucide:square-pen',
            name: 'Prompt Count',
            trend: promptTrend.label,
            trendTone: promptTrend.tone,
            value: formatNumber(options.promptCount),
        },
        {
            detail: `${formatCurrency(options.totalCost)} total spend across all tools`,
            icon: 'lucide:wallet',
            name: 'Total Spend',
            trend: costTrend.trend,
            trendTone: costTrend.trendTone,
            value: formatCurrency(options.totalCost),
        },
        {
            detail: `${formatNumber(options.totalTokens)} total tokens across all tools`,
            icon: 'solar:cpu-line-duotone',
            name: 'Token Usage',
            trend: tokenTrend.trend,
            trendTone: tokenTrend.trendTone,
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

function buildHomeTodayInsights(
    dashboardsByPlatform: ProjectUsagePlatformRecord<LoadUsageResult>,
) {
    const todayDateKey = getDateKey(new Date())
    const previousDayDateKey = getPreviousDateKey(todayDateKey)
    const hourlyUsage = new Map<number, {
        agents: Map<ProjectUsagePlatform, {
            costUSD: number
            totalTokens: number
        }>
        costUSD: number
        totalTokens: number
    }>()
    let promptCount = 0
    let previousPromptCount = 0
    let sessionCount = 0
    let previousSessionCount = 0

    for (const platform of PROJECT_USAGE_PLATFORMS) {
        for (const session of dashboardsByPlatform[platform].sessionUsage as ProjectSessionUsageItem[]) {
            const startedAtDateKey = getDateKeyFromTimestamp(session.startedAt)

            if (startedAtDateKey === todayDateKey) {
                sessionCount += 1
            }
            else if (startedAtDateKey === previousDayDateKey) {
                previousSessionCount += 1
            }

            for (const interaction of session.interactions) {
                const interactionDateKey = getDateKeyFromTimestamp(interaction.timestamp)

                if (interaction.role === 'user') {
                    if (interactionDateKey === todayDateKey) {
                        promptCount += 1
                    }
                    else if (interactionDateKey === previousDayDateKey) {
                        previousPromptCount += 1
                    }
                }

                if (!interaction.usage || interactionDateKey !== todayDateKey) {
                    continue
                }

                const interactionDate = new Date(interaction.timestamp!)

                if (!Number.isFinite(interactionDate.getTime())) {
                    continue
                }

                const hour = interactionDate.getHours()
                const bucket = hourlyUsage.get(hour) ?? {
                    agents: new Map<ProjectUsagePlatform, {
                        costUSD: number
                        totalTokens: number
                    }>(),
                    costUSD: 0,
                    totalTokens: 0,
                }
                const agentUsage = bucket.agents.get(platform) ?? {
                    costUSD: 0,
                    totalTokens: 0,
                }

                bucket.costUSD = roundCurrency(bucket.costUSD + interaction.usage.costUSD)
                bucket.totalTokens += interaction.usage.totalTokens
                agentUsage.costUSD = roundCurrency(agentUsage.costUSD + interaction.usage.costUSD)
                agentUsage.totalTokens += interaction.usage.totalTokens
                bucket.agents.set(platform, agentUsage)
                hourlyUsage.set(hour, bucket)
            }
        }
    }

    const todayHourlyUsage = Array.from({ length: 24 }, (_, hour) => ({
        agents: Object.fromEntries(hourlyUsage.get(hour)?.agents.entries() ?? []),
        costUSD: hourlyUsage.get(hour)?.costUSD ?? 0,
        hour,
        label: `${String(hour).padStart(2, '0')}:00`,
        totalTokens: hourlyUsage.get(hour)?.totalTokens ?? 0,
    }))

    return {
        previousPromptCount,
        previousSessionCount,
        promptCount,
        sessionCount,
        todayHourlyUsage,
    }
}

function getDateKeyFromTimestamp(value: string | null | undefined) {
    if (!value) {
        return null
    }

    const date = new Date(value)

    return Number.isFinite(date.getTime()) ? getDateKey(date) : null
}

function buildEfficiencyMetrics(options: {
    cachedInputTokens: number
    inputTokens: number
    outputTokens: number
    reasoningOutputTokens: number
    totalTokens: number
}): RankedUsageItem[] {
    const cacheHitRate = options.cachedInputTokens > 0 ? options.inputTokens / options.cachedInputTokens : 0
    const reasoningShare = options.reasoningOutputTokens > 0 ? options.totalTokens / options.reasoningOutputTokens : 0
    const outputShare = options.outputTokens > 0 ? options.totalTokens / options.outputTokens : 0

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
