import type { ComputedRef } from 'vue'
import { computed } from 'vue'

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

export function formatCurrency(value: number) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value)
}

export function formatCompactNumber(value: number) {
    return new Intl.NumberFormat('en-US', {
        notation: 'compact',
        maximumFractionDigits: 1,
    }).format(value)
}

export function formatPercent(value: number) {
    return new Intl.NumberFormat('en-US', {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
    }).format(value)
}

export function useUsageDashboard() {
    const dailyTokenUsage = computed<DailyTokenUsage[]>(() => ([
        {
            date: 'Mar 19, 2026',
            inputTokens: 5274379,
            cachedInputTokens: 4317312,
            outputTokens: 33443,
            reasoningOutputTokens: 9011,
            totalTokens: 5307822,
            costUSD: 3.9736405,
            models: {
                'gpt-5.4': {
                    inputTokens: 5274379,
                    cachedInputTokens: 4317312,
                    outputTokens: 33443,
                    reasoningOutputTokens: 9011,
                    totalTokens: 5307822,
                    isFallback: false,
                },
            },
        },
        {
            date: 'Mar 20, 2026',
            inputTokens: 2972768,
            cachedInputTokens: 2191872,
            outputTokens: 30106,
            reasoningOutputTokens: 3500,
            totalTokens: 3002874,
            costUSD: 2.951798,
            models: {
                'gpt-5.4': {
                    inputTokens: 2972768,
                    cachedInputTokens: 2191872,
                    outputTokens: 30106,
                    reasoningOutputTokens: 3500,
                    totalTokens: 3002874,
                    isFallback: false,
                },
            },
        },
        {
            date: 'Mar 27, 2026',
            inputTokens: 277230,
            cachedInputTokens: 258816,
            outputTokens: 7404,
            reasoningOutputTokens: 5062,
            totalTokens: 284634,
            costUSD: 0.18117329999999998,
            models: {
                'gpt-5.3-codex': {
                    inputTokens: 277230,
                    cachedInputTokens: 258816,
                    outputTokens: 7404,
                    reasoningOutputTokens: 5062,
                    totalTokens: 284634,
                    isFallback: false,
                },
            },
        },
        {
            date: 'Mar 28, 2026',
            inputTokens: 2369917,
            cachedInputTokens: 1904896,
            outputTokens: 18591,
            reasoningOutputTokens: 10599,
            totalTokens: 2388508,
            costUSD: 1.40741755,
            models: {
                'gpt-5.3-codex': {
                    inputTokens: 2369917,
                    cachedInputTokens: 1904896,
                    outputTokens: 18591,
                    reasoningOutputTokens: 10599,
                    totalTokens: 2388508,
                    isFallback: false,
                },
            },
        },
        {
            date: 'Mar 30, 2026',
            inputTokens: 3308750,
            cachedInputTokens: 3204096,
            outputTokens: 40618,
            reasoningOutputTokens: 20878,
            totalTokens: 3349368,
            costUSD: 1.3125133,
            models: {
                'gpt-5.3-codex': {
                    inputTokens: 3308750,
                    cachedInputTokens: 3204096,
                    outputTokens: 40618,
                    reasoningOutputTokens: 20878,
                    totalTokens: 3349368,
                    isFallback: false,
                },
            },
        },
        {
            date: 'Apr 01, 2026',
            inputTokens: 22783796,
            cachedInputTokens: 21042432,
            outputTokens: 110037,
            reasoningOutputTokens: 51391,
            totalTokens: 22893833,
            costUSD: 8.2703306,
            models: {
                'gpt-5.3-codex': {
                    inputTokens: 22783796,
                    cachedInputTokens: 21042432,
                    outputTokens: 110037,
                    reasoningOutputTokens: 51391,
                    totalTokens: 22893833,
                    isFallback: false,
                },
            },
        },
        {
            date: 'Apr 02, 2026',
            inputTokens: 22874109,
            cachedInputTokens: 21237120,
            outputTokens: 156231,
            reasoningOutputTokens: 62813,
            totalTokens: 23030340,
            costUSD: 8.76846075,
            models: {
                'gpt-5.3-codex': {
                    inputTokens: 22874109,
                    cachedInputTokens: 21237120,
                    outputTokens: 156231,
                    reasoningOutputTokens: 62813,
                    totalTokens: 23030340,
                    isFallback: false,
                },
            },
        },
        {
            date: 'Apr 03, 2026',
            inputTokens: 20819675,
            cachedInputTokens: 19853184,
            outputTokens: 172877,
            reasoningOutputTokens: 106205,
            totalTokens: 20992552,
            costUSD: 7.5859444499999995,
            models: {
                'gpt-5.3-codex': {
                    inputTokens: 20819675,
                    cachedInputTokens: 19853184,
                    outputTokens: 172877,
                    reasoningOutputTokens: 106205,
                    totalTokens: 20992552,
                    isFallback: false,
                },
            },
        },
        {
            date: 'Apr 08, 2026',
            inputTokens: 2730499,
            cachedInputTokens: 2246400,
            outputTokens: 29855,
            reasoningOutputTokens: 16411,
            totalTokens: 2760354,
            costUSD: 2.2196724999999997,
            models: {
                'gpt-5.4': {
                    inputTokens: 2730499,
                    cachedInputTokens: 2246400,
                    outputTokens: 29855,
                    reasoningOutputTokens: 16411,
                    totalTokens: 2760354,
                    isFallback: false,
                },
            },
        },
        {
            date: 'Apr 09, 2026',
            inputTokens: 1919460,
            cachedInputTokens: 1513472,
            outputTokens: 37657,
            reasoningOutputTokens: 15077,
            totalTokens: 1957117,
            costUSD: 1.958193,
            models: {
                'gpt-5.4': {
                    inputTokens: 1919460,
                    cachedInputTokens: 1513472,
                    outputTokens: 37657,
                    reasoningOutputTokens: 15077,
                    totalTokens: 1957117,
                    isFallback: false,
                },
            },
        },
        {
            date: 'Apr 10, 2026',
            inputTokens: 4788095,
            cachedInputTokens: 4163840,
            outputTokens: 40936,
            reasoningOutputTokens: 18162,
            totalTokens: 4829031,
            costUSD: 3.2156375,
            models: {
                'gpt-5.4': {
                    inputTokens: 4788095,
                    cachedInputTokens: 4163840,
                    outputTokens: 40936,
                    reasoningOutputTokens: 18162,
                    totalTokens: 4829031,
                    isFallback: false,
                },
            },
        },
        {
            date: 'Apr 13, 2026',
            inputTokens: 16031,
            cachedInputTokens: 4480,
            outputTokens: 196,
            reasoningOutputTokens: 153,
            totalTokens: 16227,
            costUSD: 0.0329375,
            models: {
                'gpt-5.4': {
                    inputTokens: 16031,
                    cachedInputTokens: 4480,
                    outputTokens: 196,
                    reasoningOutputTokens: 153,
                    totalTokens: 16227,
                    isFallback: false,
                },
            },
        },
        {
            date: 'Apr 14, 2026',
            inputTokens: 441319,
            cachedInputTokens: 343296,
            outputTokens: 11906,
            reasoningOutputTokens: 4338,
            totalTokens: 453225,
            costUSD: 0.5094715,
            models: {
                'gpt-5.4': {
                    inputTokens: 441319,
                    cachedInputTokens: 343296,
                    outputTokens: 11906,
                    reasoningOutputTokens: 4338,
                    totalTokens: 453225,
                    isFallback: false,
                },
            },
        },
    ] as DailyTokenUsage[]))

    const totalCost = computed(() => dailyTokenUsage.value.reduce((sum, item) => sum + item.costUSD, 0))
    const totalTokens = computed(() => dailyTokenUsage.value.reduce((sum, item) => sum + item.totalTokens, 0))
    const inputTokens = computed(() => dailyTokenUsage.value.reduce((sum, item) => sum + item.inputTokens, 0))
    const cachedInputTokens = computed(() => dailyTokenUsage.value.reduce((sum, item) => sum + item.cachedInputTokens, 0))
    const outputTokens = computed(() => dailyTokenUsage.value.reduce((sum, item) => sum + item.outputTokens, 0))
    const reasoningOutputTokens = computed(() => dailyTokenUsage.value.reduce((sum, item) => sum + item.reasoningOutputTokens, 0))

    const modelUsage: ComputedRef<RankedUsageItem[]> = computed(() => {
        const models = new Map<string, {
            activeDays: number
            costUSD: number
            inputTokens: number
            outputTokens: number
            totalTokens: number
        }>()

        for (const day of dailyTokenUsage.value) {
            for (const [name, usage] of Object.entries(day.models)) {
                const model = models.get(name) ?? {
                    activeDays: 0,
                    costUSD: 0,
                    inputTokens: 0,
                    outputTokens: 0,
                    totalTokens: 0,
                }
                const tokenShare = day.totalTokens > 0 ? usage.totalTokens / day.totalTokens : 0
                model.activeDays += 1
                model.costUSD += day.costUSD * tokenShare
                model.inputTokens += usage.inputTokens
                model.outputTokens += usage.outputTokens
                model.totalTokens += usage.totalTokens
                models.set(name, model)
            }
        }

        return Array.from(models.entries())
            .map(([name, usage], index) => ({
                label: name,
                value: formatCurrency(usage.costUSD),
                detail: `${formatCompactNumber(usage.totalTokens)} tokens / ${usage.activeDays} active days`,
                percent: totalCost.value > 0 ? (usage.costUSD / totalCost.value) * 100 : 0,
                tone: (index === 0 ? 'sky' : 'green') as RankedUsageItem['tone'],
            }))
            .sort((a, b) => b.percent - a.percent)
    })

    const monthlyModelUsage = computed<MonthlyModelUsage[]>(() => [
        { month: '2025-05', model: 'gpt-5.2', tokenTotal: 8400000 },
        { month: '2025-05', model: 'gpt-5.4-mini', tokenTotal: 2100000 },
        { month: '2025-06', model: 'gpt-5.2', tokenTotal: 12800000 },
        { month: '2025-06', model: 'gpt-5.3-codex', tokenTotal: 3200000 },
        { month: '2025-07', model: 'gpt-5.2', tokenTotal: 9800000 },
        { month: '2025-07', model: 'gpt-5.3-codex', tokenTotal: 7600000 },
        { month: '2025-08', model: 'gpt-5.3-codex', tokenTotal: 16400000 },
        { month: '2025-08', model: 'gpt-5.4-mini', tokenTotal: 4300000 },
        { month: '2025-09', model: 'gpt-5.3-codex', tokenTotal: 22100000 },
        { month: '2025-09', model: 'gpt-5.4-mini', tokenTotal: 6900000 },
        { month: '2025-10', model: 'gpt-5.3-codex', tokenTotal: 18800000 },
        { month: '2025-10', model: 'gpt-5.4', tokenTotal: 5300000 },
        { month: '2025-11', model: 'gpt-5.3-codex', tokenTotal: 29600000 },
        { month: '2025-11', model: 'gpt-5.4', tokenTotal: 9100000 },
        { month: '2025-12', model: 'gpt-5.3-codex', tokenTotal: 34700000 },
        { month: '2025-12', model: 'gpt-5.4', tokenTotal: 14800000 },
        { month: '2026-01', model: 'gpt-5.4', tokenTotal: 26200000 },
        { month: '2026-01', model: 'gpt-5.3-codex', tokenTotal: 11800000 },
        { month: '2026-02', model: 'gpt-5.4', tokenTotal: 31800000 },
        { month: '2026-02', model: 'gpt-5.3-codex', tokenTotal: 9200000 },
        { month: '2026-02', model: 'gpt-5.4-mini', tokenTotal: 4100000 },
        { month: '2026-03', model: 'gpt-5.3-codex', tokenTotal: 59372000 },
        { month: '2026-03', model: 'gpt-5.4', tokenTotal: 8310000 },
        { month: '2026-04', model: 'gpt-5.3-codex', tokenTotal: 66916562 },
        { month: '2026-04', model: 'gpt-5.4', tokenTotal: 10016185 },
    ])

    const projectUsage = computed<ProjectUsageItem[]>(() => {
        const projects = [
            { label: 'web-jetbrains-git', repository: 'lonewolfyx/web-jetbrains-git', sessions: 53, tokenTotal: 52600000, costUSD: 24.6 },
            { label: 'codex-desktop', repository: 'lonewolfyx/codex-desktop', sessions: 29, tokenTotal: 18400000, costUSD: 8.92 },
            { label: 'uni-deps-fix', repository: 'lonewolfyx/uni-deps-fix', sessions: 11, tokenTotal: 13300000, costUSD: 6.1 },
            { label: 'nuxt-dashboard', repository: 'lonewolfyx/nuxt-dashboard', sessions: 16, tokenTotal: 9800000, costUSD: 4.88 },
            { label: 'sixninenine', repository: 'lonewolfyx/sixninenine', sessions: 12, tokenTotal: 7600000, costUSD: 3.76 },
            { label: 'x', repository: 'lonewolfyx/x', sessions: 5, tokenTotal: 7400000, costUSD: 3.37 },
            { label: 'billing-insights', repository: 'lonewolfyx/billing-insights', sessions: 9, tokenTotal: 6100000, costUSD: 2.84 },
            { label: 'dnmp', repository: 'lonewolfyx/dnmp', sessions: 3, tokenTotal: 4700000, costUSD: 2.09 },
            { label: 'design-system', repository: 'lonewolfyx/design-system', sessions: 7, tokenTotal: 3900000, costUSD: 1.76 },
            { label: 'codex-register', repository: 'lonewolfyx/codex-register', sessions: 4, tokenTotal: 3300000, costUSD: 1.31 },
            { label: 'talks', repository: 'lonewolfyx/talks', sessions: 2, tokenTotal: 1400000, costUSD: 0.64 },
            { label: 'usage-board', repository: 'lonewolfyx/usage-board', sessions: 1, tokenTotal: 453225, costUSD: 0.51 },
        ]
        const maxCost = Math.max(...projects.map(project => project.costUSD))

        return projects
            .sort((a, b) => b.costUSD - a.costUSD)
            .map(project => ({
                ...project,
                value: formatCurrency(project.costUSD),
                detail: `${project.sessions} sessions / ${formatCompactNumber(project.tokenTotal)} tokens`,
                percent: maxCost > 0 ? (project.costUSD / maxCost) * 100 : 0,
                tone: 'amber' as const,
            }))
    })

    const sessionUsage = computed<SessionUsageItem[]>(() => [
        { id: '019d4eac', project: 'web-jetbrains-git', model: 'gpt-5.3-codex', duration: '1h 42m', tokenTotal: 23030340, costUSD: 8.77 },
        { id: '019d4cf1', project: 'web-jetbrains-git', model: 'gpt-5.3-codex', duration: '1h 08m', tokenTotal: 22893833, costUSD: 8.27 },
        { id: '019d495e', project: 'web-jetbrains-git', model: 'gpt-5.3-codex', duration: '58m', tokenTotal: 20992552, costUSD: 7.59 },
        { id: '019d69ab', project: 'uni-deps-fix', model: 'gpt-5.4', duration: '44m', tokenTotal: 9100000, costUSD: 4.1 },
        { id: '019d6883', project: 'uni-deps-fix', model: 'gpt-5.4', duration: '27m', tokenTotal: 4200000, costUSD: 2 },
        { id: '019d7605', project: 'sixninenine', model: 'gpt-5.4', duration: '39m', tokenTotal: 4829031, costUSD: 3.22 },
        { id: '019d720d', project: 'sixninenine', model: 'gpt-5.4', duration: '21m', tokenTotal: 2770000, costUSD: 0.54 },
        { id: '019d701c', project: 'x', model: 'gpt-5.3-codex', duration: '36m', tokenTotal: 5600000, costUSD: 2.42 },
        { id: '019d6f91', project: 'x', model: 'gpt-5.4', duration: '18m', tokenTotal: 1800000, costUSD: 0.95 },
        { id: '019d6b42', project: 'dnmp', model: 'gpt-5.3-codex', duration: '24m', tokenTotal: 3400000, costUSD: 1.48 },
        { id: '019d6a11', project: 'dnmp', model: 'gpt-5.4', duration: '13m', tokenTotal: 1300000, costUSD: 0.61 },
        { id: '019d668f', project: 'codex-register', model: 'gpt-5.4', duration: '19m', tokenTotal: 2100000, costUSD: 0.84 },
        { id: '019d64a3', project: 'codex-register', model: 'gpt-5.3-codex', duration: '15m', tokenTotal: 1200000, costUSD: 0.47 },
        { id: '019d5ffd', project: 'usage-board', model: 'gpt-5.4', duration: '11m', tokenTotal: 453225, costUSD: 0.51 },
        { id: '019d5d8e', project: 'talks', model: 'gpt-5.4', duration: '12m', tokenTotal: 900000, costUSD: 0.39 },
        { id: '019d5b72', project: 'talks', model: 'gpt-5.3-codex', duration: '9m', tokenTotal: 500000, costUSD: 0.25 },
    ])

    const totalSessions = computed(() => sessionUsage.value.length)

    const efficiencyMetrics = computed<RankedUsageItem[]>(() => [
        {
            label: 'Cache Hit Rate',
            value: formatPercent(cachedInputTokens.value / inputTokens.value),
            detail: `${formatCompactNumber(cachedInputTokens.value)} cached input tokens`,
            percent: (cachedInputTokens.value / inputTokens.value) * 100,
            tone: 'green',
        },
        {
            label: 'Reasoning Token Share',
            value: formatPercent(reasoningOutputTokens.value / totalTokens.value),
            detail: `${formatCompactNumber(reasoningOutputTokens.value)} reasoning output tokens`,
            percent: (reasoningOutputTokens.value / totalTokens.value) * 100,
            tone: 'amber',
        },
        {
            label: 'Output Token Share',
            value: formatPercent(outputTokens.value / totalTokens.value),
            detail: `${formatCompactNumber(outputTokens.value)} output tokens`,
            percent: (outputTokens.value / totalTokens.value) * 100,
            tone: 'sky',
        },
    ])

    return {
        cachedInputTokens,
        dailyTokenUsage,
        efficiencyMetrics,
        inputTokens,
        modelUsage,
        monthlyModelUsage,
        outputTokens,
        projectUsage,
        reasoningOutputTokens,
        sessionUsage,
        totalCost,
        totalSessions,
        totalTokens,
    }
}
