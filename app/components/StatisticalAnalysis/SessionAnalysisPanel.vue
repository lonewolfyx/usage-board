<template>
    <StatisticalAnalysisPanel
        description="Token, duration, and cost grouped by project"
        icon="lucide:messages-square"
        title="Session Analysis"
    >
        <div class="mb-4 grid grid-cols-2 gap-3">
            <div class="rounded-md border px-3 py-2">
                <p class="text-xs text-muted-foreground">
                    Total Sessions
                </p>
                <p class="mt-1 text-xl font-semibold tabular-nums">
                    {{ totalSessions }}
                </p>
            </div>
            <div class="rounded-md border px-3 py-2">
                <p class="text-xs text-muted-foreground">
                    Top Session Avg
                </p>
                <p class="mt-1 text-xl font-semibold tabular-nums">
                    {{ topSessionAverageCost }}
                </p>
            </div>
        </div>

        <ChartContainer class="h-80 w-full" :config="chartConfig">
            <VisXYContainer
                :auto-margin="false"
                :data="chartData"
                :height="320"
                :margin="chartMargin"
                y-direction="south"
            >
                <VisStackedBar
                    :bar-max-width="28"
                    :bar-padding="0.28"
                    :color="getSegmentColor"
                    cursor="pointer"
                    orientation="horizontal"
                    :rounded-corners="3"
                    :x="getProjectIndex"
                    :y="[getTokenScore, getDurationScore, getCostScore]"
                />
                <VisAxis
                    :grid-line="false"
                    :tick-format="formatProjectAxis"
                    :tick-text-width="104"
                    :tick-values="projectTicks"
                    type="y"
                />
                <VisAxis
                    :num-ticks="4"
                    :tick-format="formatScoreAxis"
                    type="x"
                />
                <VisTooltip :triggers="tooltipTriggers" />
            </VisXYContainer>
        </ChartContainer>

        <div class="mt-4 flex flex-wrap justify-center items-center gap-3 text-xs text-muted-foreground">
            <div v-for="segment in chartSegments" :key="segment.key" class="flex items-center gap-2">
                <span class="size-2.5 rounded-sm" :style="{ backgroundColor: segment.color }" />
                <span>{{ segment.label }}</span>
            </div>
        </div>
    </StatisticalAnalysisPanel>
</template>

<script setup lang="ts">
import { VisAxis, VisStackedBar, VisStackedBarSelectors, VisTooltip, VisXYContainer } from '@unovis/vue'
import { computed } from 'vue'
import { ChartContainer } from '@/components/ui/chart'
import { formatCompactNumber, formatCurrency } from '~/composables/useUsageDashboard'

defineOptions({
    name: 'StatisticalAnalysisSessionAnalysisPanel',
})

const props = defineProps<{
    items: SessionUsageItem[]
    totalSessions: number
}>()

const chartSegments = [
    {
        color: '#2563eb',
        key: 'tokens',
        label: 'Token Usage',
    },
    {
        color: '#b6d72f',
        key: 'duration',
        label: 'Duration',
    },
    {
        color: '#f97316',
        key: 'cost',
        label: 'Cost',
    },
] as const

const chartConfig = {
    cost: {
        color: chartSegments[2].color,
        label: chartSegments[2].label,
    },
    duration: {
        color: chartSegments[1].color,
        label: chartSegments[1].label,
    },
    tokens: {
        color: chartSegments[0].color,
        label: chartSegments[0].label,
    },
} satisfies ChartConfig

const chartMargin = {
    bottom: 32,
    left: 120,
    right: 12,
    top: 8,
}

const topSessionAverageCost = computed(() => {
    const averageCost = props.items.reduce((sum, item) => sum + item.costUSD, 0) / props.items.length

    return formatCurrency(averageCost)
})

const chartData = computed<SessionProjectDatum[]>(() => {
    const projects = new Map<string, {
        costUSD: number
        durationMinutes: number
        sessionCount: number
        tokenTotal: number
    }>()

    for (const item of props.items) {
        const project = projects.get(item.project) ?? {
            costUSD: 0,
            durationMinutes: 0,
            sessionCount: 0,
            tokenTotal: 0,
        }

        project.costUSD += item.costUSD
        project.durationMinutes += parseDurationMinutes(item.duration)
        project.sessionCount += 1
        project.tokenTotal += item.tokenTotal
        projects.set(item.project, project)
    }

    const rows = Array.from(projects.entries())
        .map(([project, usage]) => ({
            project,
            ...usage,
        }))
        .sort((a, b) => b.costUSD - a.costUSD)

    const maxTokens = Math.max(...rows.map(row => row.tokenTotal), 0)
    const maxDuration = Math.max(...rows.map(row => row.durationMinutes), 0)
    const maxCost = Math.max(...rows.map(row => row.costUSD), 0)

    return rows.map((row, index) => ({
        ...row,
        costLabel: formatCurrency(row.costUSD),
        costScore: normalizeScore(row.costUSD, maxCost),
        durationLabel: formatDuration(row.durationMinutes),
        durationScore: normalizeScore(row.durationMinutes, maxDuration),
        index,
        tokenLabel: formatCompactNumber(row.tokenTotal),
        tokenScore: normalizeScore(row.tokenTotal, maxTokens),
    }))
})

const projectTicks = computed(() => chartData.value.map(item => item.index))

const tooltipTriggers = computed(() => ({
    [VisStackedBarSelectors.bar]: formatTooltip,
}))

function parseDurationMinutes(duration: string) {
    const hours = duration.match(/(\d+)h/)?.[1]
    const minutes = duration.match(/(\d+)m/)?.[1]

    return Number(hours ?? 0) * 60 + Number(minutes ?? 0)
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

function normalizeScore(value: number, maxValue: number) {
    return maxValue > 0 ? (value / maxValue) * 100 : 0
}

function getProjectIndex(item: SessionProjectDatum) {
    return item.index
}

function getTokenScore(item: SessionProjectDatum) {
    return item.tokenScore
}

function getDurationScore(item: SessionProjectDatum) {
    return item.durationScore
}

function getCostScore(item: SessionProjectDatum) {
    return item.costScore
}

function getSegmentColor(_: SessionProjectDatum, index: number) {
    return chartSegments[index]?.color ?? chartSegments[0].color
}

function formatTooltip(data: StackedBarTooltipDatum) {
    const project = data.datum
    const segment = chartSegments[data.stackIndex] ?? chartSegments[0]
    const metricValue = getMetricTooltipValue(project, data.stackIndex)

    return `
        <div class="grid min-w-44 gap-2 rounded-md border bg-background px-3 py-2 text-xs shadow-lg">
            <div class="font-medium text-foreground">${escapeHtml(project.project)}</div>
            <div class="flex items-center justify-between gap-4">
                <span class="flex items-center gap-2 text-muted-foreground">
                    <span class="size-2 rounded-sm" style="background-color: ${segment.color}"></span>
                    ${segment.label}
                </span>
                <span class="font-mono font-semibold text-foreground">${metricValue}</span>
            </div>
            <div class="grid gap-1 border-t pt-2 text-muted-foreground">
                <div class="flex justify-between gap-4"><span>Tokens</span><span>${project.tokenLabel}</span></div>
                <div class="flex justify-between gap-4"><span>Duration</span><span>${project.durationLabel}</span></div>
                <div class="flex justify-between gap-4"><span>Cost</span><span>${project.costLabel}</span></div>
                <div class="flex justify-between gap-4"><span>Sessions</span><span>${project.sessionCount}</span></div>
            </div>
        </div>
    `
}

function getMetricTooltipValue(project: SessionProjectDatum, stackIndex: number) {
    if (stackIndex === 0) {
        return `${project.tokenLabel} tokens`
    }

    if (stackIndex === 1) {
        return project.durationLabel
    }

    return project.costLabel
}

function formatProjectAxis(tick: number | Date) {
    if (tick instanceof Date) {
        return ''
    }

    return chartData.value.find(item => item.index === tick)?.project ?? ''
}

function formatScoreAxis(tick: number | Date) {
    if (tick instanceof Date) {
        return ''
    }

    return `${Math.round(tick)}%`
}

function escapeHtml(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}
</script>
