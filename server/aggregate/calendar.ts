import type { ProjectUsagePlatform } from '#shared/types/ai'
import type {
    CalendarApiResponse,
    CalendarDayData,
    CalendarMonthSummary,
    CalendarPlatformDayData,
} from '#shared/types/calendar'
import type {
    DailyPlatformTokenUsage,
    DailyTokenUsage,
    ModelTokenUsage,
    UsageOverviewCard,
} from '#shared/types/usage-dashboard'
import { useDateFormat } from '#shared/utils/date'
import {
    buildGrowthTrend,
    buildInputOutputTokenSubvalue,
    formatCompactNumber,
    formatCurrency,
    roundCurrency,
    sumCurrency,
} from '#shared/utils/usage-dashboard'
import { formatNumber } from '@lonewolfyx/utils'
import dayjs from 'dayjs'

type ModelSummary = Record<string, { tokens: number, costUSD: number }>

// `DailyTokenUsage.date` leaves the repository as a display label ("Jun 24, 2026"),
// NOT a raw YYYY-MM-DD. Recover the canonical keys with useDateFormat — the same
// round-trip `buildOverviewCardsWithTodayTokenBreakdown` relies on.
function monthOfDate(date: string): string {
    return useDateFormat(date, 'month-key') ?? date.slice(0, 7)
}

function dateKeyOf(date: string): string {
    return useDateFormat(date) ?? date
}

function toModelSummary(models: Record<string, ModelTokenUsage>): ModelSummary {
    return Object.fromEntries(
        Object.entries(models).map(([name, usage]) => [
            name,
            { tokens: usage.totalTokens, costUSD: roundCurrency(usage.costUSD) },
        ]),
    )
}

function mapPlatformSummary(
    platforms?: Partial<Record<ProjectUsagePlatform, DailyPlatformTokenUsage>>,
): Partial<Record<ProjectUsagePlatform, CalendarPlatformDayData>> {
    if (!platforms) {
        return {}
    }

    const result: Partial<Record<ProjectUsagePlatform, CalendarPlatformDayData>> = {}
    for (const [platform, usage] of Object.entries(platforms ?? {})) {
        if (!usage) {
            continue
        }
        result[platform as ProjectUsagePlatform] = {
            platform: platform as ProjectUsagePlatform,
            totalTokens: usage.totalTokens,
            costUSD: roundCurrency(usage.costUSD),
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            reasoningOutputTokens: usage.reasoningOutputTokens,
            cachedInputTokens: usage.cachedInputTokens,
            models: toModelSummary(usage.models),
        }
    }
    return result
}

export function buildCalendarDayData(d: DailyTokenUsage, scopedPlatform: ProjectUsagePlatform | null): CalendarDayData {
    const dateKey = dateKeyOf(d.date)
    const models = toModelSummary(d.models)
    const base = {
        dateKey,
        totalTokens: d.totalTokens,
        costUSD: d.costUSD,
        inputTokens: d.inputTokens,
        outputTokens: d.outputTokens,
        reasoningOutputTokens: d.reasoningOutputTokens,
        cachedInputTokens: d.cachedInputTokens,
        models,
    }

    if (scopedPlatform) {
        // Agent sequence: no platforms map — synthesize a single-platform entry from top-level fields.
        return {
            ...base,
            platforms: {
                [scopedPlatform]: {
                    platform: scopedPlatform,
                    totalTokens: d.totalTokens,
                    costUSD: roundCurrency(d.costUSD),
                    inputTokens: d.inputTokens,
                    outputTokens: d.outputTokens,
                    reasoningOutputTokens: d.reasoningOutputTokens,
                    cachedInputTokens: d.cachedInputTokens,
                    models,
                },
            },
        }
    }

    // Home sequence: map the merged per-platform map (may be undefined → empty).
    return { ...base, platforms: mapPlatformSummary(d.platforms) }
}

interface MonthAggregate {
    month: string
    totalTokens: number
    totalCostUSD: number
    inputTokens: number
    outputTokens: number
    activeDays: number
    avgDailyCostUSD: number
    topPlatform: ProjectUsagePlatform | null
    topModel: string | null
}

function pickTop<K>(totals: Map<K, number>): K | null {
    let top: K | null = null
    let max = -1
    for (const [key, value] of totals) {
        if (value > max) {
            max = value
            top = key
        }
    }
    return top
}

function aggregateMonth(days: CalendarDayData[], month: string): MonthAggregate {
    let totalTokens = 0
    let totalCostUSD = 0
    let inputTokens = 0
    let outputTokens = 0
    let activeDays = 0
    const platformTotals = new Map<ProjectUsagePlatform, number>()
    const modelTotals = new Map<string, number>()

    for (const day of days) {
        totalTokens += day.totalTokens
        totalCostUSD = sumCurrency(totalCostUSD, day.costUSD)
        inputTokens += day.inputTokens
        outputTokens += day.outputTokens
        if (day.totalTokens > 0) {
            activeDays += 1
        }

        for (const [model, data] of Object.entries(day.models)) {
            modelTotals.set(model, (modelTotals.get(model) ?? 0) + data.tokens)
        }
        for (const usage of Object.values(day.platforms)) {
            platformTotals.set(usage.platform, (platformTotals.get(usage.platform) ?? 0) + usage.totalTokens)
        }
    }

    const daysInMonth = dayjs(`${month}-01`).daysInMonth()
    const avgDailyCostUSD = daysInMonth > 0 ? roundCurrency(totalCostUSD / daysInMonth) : 0

    return {
        month,
        totalTokens,
        totalCostUSD: roundCurrency(totalCostUSD),
        inputTokens,
        outputTokens,
        activeDays,
        avgDailyCostUSD,
        topPlatform: pickTop(platformTotals),
        topModel: pickTop(modelTotals),
    }
}

interface AllTimeAggregate {
    totalTokens: number
    totalCostUSD: number
    inputTokens: number
    outputTokens: number
}

function aggregateAllTime(daily: DailyTokenUsage[]): AllTimeAggregate {
    let totalTokens = 0
    let totalCostUSD = 0
    let inputTokens = 0
    let outputTokens = 0

    for (const d of daily) {
        totalTokens += d.totalTokens
        totalCostUSD = sumCurrency(totalCostUSD, d.costUSD)
        inputTokens += d.inputTokens
        outputTokens += d.outputTokens
    }

    return {
        totalTokens,
        totalCostUSD: roundCurrency(totalCostUSD),
        inputTokens,
        outputTokens,
    }
}

export function toCalendarMonthSummary(agg: MonthAggregate, days: CalendarDayData[]): CalendarMonthSummary {
    return {
        month: agg.month,
        totalTokens: agg.totalTokens,
        totalCostUSD: agg.totalCostUSD,
        activeDays: agg.activeDays,
        avgDailyCostUSD: agg.avgDailyCostUSD,
        topPlatform: agg.topPlatform,
        topModel: agg.topModel,
        days,
    }
}

export function buildCalendarKpiCards(current: MonthAggregate, previous: MonthAggregate, allTime: AllTimeAggregate): UsageOverviewCard[] {
    const allTimePrevTokens = Math.max(allTime.totalTokens - current.totalTokens, 0)

    return [
        {
            name: 'Month Tokens',
            icon: 'lucide:zap',
            value: formatCompactNumber(current.totalTokens),
            detail: `${formatNumber(current.totalTokens)} tokens this month`,
            subvalue: buildInputOutputTokenSubvalue({ inputTokens: current.inputTokens, outputTokens: current.outputTokens }),
            ...buildGrowthTrend(current.totalTokens, previous.totalTokens, formatCompactNumber),
        },
        {
            name: 'Month Cost',
            icon: 'lucide:credit-card',
            value: formatCurrency(current.totalCostUSD),
            detail: `${formatCurrency(current.totalCostUSD)} total spend this month`,
            ...buildGrowthTrend(current.totalCostUSD, previous.totalCostUSD, formatCurrency),
        },
        {
            name: 'Total Tokens',
            icon: 'lucide:database',
            value: formatCompactNumber(allTime.totalTokens),
            detail: `${formatNumber(allTime.totalTokens)} total tokens across all tools`,
            subvalue: buildInputOutputTokenSubvalue({ inputTokens: allTime.inputTokens, outputTokens: allTime.outputTokens }),
            ...buildGrowthTrend(allTime.totalTokens, allTimePrevTokens, formatCompactNumber),
        },
        {
            name: 'Avg Daily Cost',
            icon: 'lucide:trending-up',
            value: formatCurrency(current.avgDailyCostUSD),
            detail: `${formatCurrency(current.avgDailyCostUSD)} average daily cost this month`,
            ...buildGrowthTrend(current.avgDailyCostUSD, previous.avgDailyCostUSD, formatCurrency),
        },
    ]
}

export function collectAvailableMonths(daily: DailyTokenUsage[]): string[] {
    const months = new Set<string>()

    for (const d of daily) {
        months.add(monthOfDate(d.date))
    }

    return [...months].sort((a, b) => b.localeCompare(a))
}

export function buildCalendarResponse(
    daily: DailyTokenUsage[],
    month: string,
    scopedPlatform: ProjectUsagePlatform | null,
): CalendarApiResponse {
    const currentDays = daily
        .filter(d => monthOfDate(d.date) === month)
        .map(d => buildCalendarDayData(d, scopedPlatform))
    const currentAgg = aggregateMonth(currentDays, month)

    const prevMonth = dayjs(`${month}-01`).subtract(1, 'month').format('YYYY-MM')
    const prevDays = daily
        .filter(d => monthOfDate(d.date) === prevMonth)
        .map(d => buildCalendarDayData(d, scopedPlatform))
    const prevAgg = aggregateMonth(prevDays, prevMonth)

    const allTime = aggregateAllTime(daily)

    return {
        kpiCards: buildCalendarKpiCards(currentAgg, prevAgg, allTime),
        month: toCalendarMonthSummary(currentAgg, currentDays),
        availableMonths: collectAvailableMonths(daily),
        scopedPlatform,
    }
}
