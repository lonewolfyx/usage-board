<template>
    <StatisticalAnalysisPanel
        :description="heatmapDescription"
        icon="lucide:calendar-days"
        :title="props.title"
    >
        <div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div
                v-for="card in summaryCards"
                :key="card.key"
                class="rounded-md border px-3 py-2"
            >
                <p class="text-xs text-muted-foreground">
                    {{ card.label }}
                </p>
                <p class="mt-1 text-lg font-semibold tabular-nums">
                    {{ card.value }}
                </p>
            </div>
        </div>

        <div class="border-b pb-4">
            <div
                class="grid w-full gap-1"
                :style="heatmapGridStyle"
            >
                <span
                    v-for="weekday in weekdayLabels"
                    :key="weekday.key"
                    class="flex items-center justify-end pr-1 text-[10px] text-muted-foreground"
                    :style="{ gridColumn: '1', gridRow: weekday.row }"
                >
                    {{ weekday.label }}
                </span>
                <div
                    v-for="cell in heatmapCells"
                    :key="cell.key"
                    class="group relative aspect-square w-full max-w-3 justify-self-center rounded-sm border border-black/5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 dark:border-white/10"
                    :aria-label="cell.title"
                    :class="[cell.colorClass, { 'border-transparent opacity-0': cell.isBlank }]"
                    :style="{ gridColumn: cell.column, gridRow: cell.row }"
                    :tabindex="cell.isBlank ? -1 : 0"
                >
                    <span class="sr-only">{{ cell.title }}</span>
                    <div
                        v-if="!cell.isBlank"
                        class="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden min-w-40 -translate-x-1/2 gap-1 rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md group-hover:grid group-focus-visible:grid"
                        role="tooltip"
                    >
                        <span class="font-medium">{{ cell.date }}</span>
                        <span
                            v-if="props.heatMetric === 'tokens'"
                            class="flex items-center justify-between gap-4 text-muted-foreground"
                        >
                            <span>Tokens</span>
                            <span class="font-mono font-medium text-foreground">{{ cell.tokenLabel }}</span>
                        </span>
                        <span class="flex items-center justify-between gap-4 text-muted-foreground">
                            <span>Cost</span>
                            <span class="font-mono font-medium text-foreground">{{ cell.costLabel }}</span>
                        </span>
                        <span
                            v-if="props.heatMetric === 'cost'"
                            class="flex items-center justify-between gap-4 text-muted-foreground"
                        >
                            <span>Tokens</span>
                            <span class="font-mono font-medium text-foreground">{{ cell.tokenLabel }}</span>
                        </span>
                        <span class="absolute top-full left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-r border-b border-border bg-popover" />
                    </div>
                </div>
            </div>
            <div class="mt-4 flex items-center justify-between gap-4">
                <p class="text-xs text-muted-foreground">
                    {{ legendLabel }}
                </p>
                <div class="flex items-center gap-1 text-xs text-muted-foreground">
                    <span>Less</span>
                    <span
                        v-for="level in legendLevels"
                        :key="level"
                        class="size-3 rounded-[2px] border border-black/5 dark:border-white/10"
                        :class="level"
                    />
                    <span>More</span>
                </div>
            </div>
        </div>

        <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div
                v-for="item in recentTrendItems"
                :key="item.date"
                class="rounded-md border px-3 py-2"
            >
                <p class="text-xs text-muted-foreground">
                    {{ item.date }}
                </p>
                <div class="mt-1 flex items-center justify-between gap-2">
                    <span class="text-sm font-semibold">
                        {{ props.heatMetric === 'cost' ? formatCurrency(item.costUSD) : formatCompactNumber(item.totalTokens) }}
                    </span>
                    <span class="text-xs text-muted-foreground">
                        {{ props.heatMetric === 'cost' ? formatCompactNumber(item.totalTokens) : formatCurrency(item.costUSD) }}
                    </span>
                </div>
            </div>
        </div>
    </StatisticalAnalysisPanel>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { formatCompactNumber, formatCurrency } from '~/composables/useUsageDashboard'

defineOptions({
    name: 'UsageHeatmapPanel',
})

const props = withDefaults(defineProps<{
    heatMetric?: HeatmapMetric
    items: DailyTokenUsage[]
    title: string
}>(), {
    heatMetric: 'tokens',
})

type HeatmapMetric = 'cost' | 'tokens'

interface SummaryCard {
    key: string
    label: string
    value: string
}

const heatmapLevels = [
    'bg-zinc-100 dark:bg-zinc-800/80',
    'bg-emerald-50 dark:bg-emerald-950/70',
    'bg-emerald-100 dark:bg-emerald-900/70',
    'bg-teal-100 dark:bg-teal-900/75',
    'bg-teal-200 dark:bg-teal-800/80',
    'bg-cyan-200 dark:bg-cyan-800/85',
    'bg-cyan-300 dark:bg-cyan-700/90',
    'bg-sky-300 dark:bg-sky-600/90',
    'bg-sky-400 dark:bg-sky-500/95',
    'bg-blue-500 dark:bg-blue-400',
] as const

const legendLevels = [...heatmapLevels]
const weekdayLabels = [
    { key: 'sun', label: 'S', row: '1' },
    { key: 'mon', label: 'M', row: '2' },
    { key: 'tue', label: 'T', row: '3' },
    { key: 'wed', label: 'W', row: '4' },
    { key: 'thu', label: 'T', row: '5' },
    { key: 'fri', label: 'F', row: '6' },
    { key: 'sat', label: 'S', row: '7' },
]

const rangeEndDate = computed(() => cloneDate(new Date()))

const rangeStartDate = computed(() => {
    const startDate = cloneDate(rangeEndDate.value)
    startDate.setDate(startDate.getDate() - 364)

    return startDate
})

const rangeLabel = computed(() => `${formatRangeDate(rangeStartDate.value)} - ${formatRangeDate(rangeEndDate.value)}`)
const heatMetricLabel = computed(() => props.heatMetric === 'cost' ? 'spend' : 'tokens')
const heatmapDescription = computed(() =>
    `${rangeLabel.value} ${heatMetricLabel.value} heatmap. Darker cells mean higher daily ${heatMetricLabel.value}.`,
)
const legendLabel = computed(() => `Colored by daily ${heatMetricLabel.value}`)

const yearItems = computed(() => {
    const usageByDate = new Map(props.items.map(item => [formatDateKey(parseUsageDate(item.date)), item]))

    return Array.from({ length: 365 }, (_, index) => {
        const date = cloneDate(rangeStartDate.value)
        date.setDate(date.getDate() + index)

        return {
            date,
            usage: usageByDate.get(formatDateKey(date)),
        }
    })
})

const trendItems = computed(() => {
    const maxMetricValue = Math.max(
        ...yearItems.value.map(item =>
            props.heatMetric === 'cost'
                ? item.usage?.costUSD ?? 0
                : item.usage?.totalTokens ?? 0,
        ),
    )

    return yearItems.value.map((item) => {
        const costUSD = item.usage?.costUSD ?? 0
        const totalTokens = item.usage?.totalTokens ?? 0
        const metricValue = props.heatMetric === 'cost' ? costUSD : totalTokens

        return {
            colorClass: heatmapLevels[getHeatmapLevel(metricValue, maxMetricValue)],
            costLabel: formatCurrency(costUSD),
            costUSD,
            date: formatRangeDate(item.date),
            hasUsage: Boolean(item.usage),
            tokenLabel: formatCompactNumber(totalTokens),
            totalTokens,
        }
    })
})

const heatmapCells = computed(() => {
    const leadingBlankCount = rangeStartDate.value.getDay()
    const trailingBlankCount = (7 - ((leadingBlankCount + trendItems.value.length) % 7)) % 7
    const blanks = Array.from({ length: leadingBlankCount }, (_, index) => ({
        column: String(Math.floor(index / 7) + 2),
        colorClass: 'bg-transparent',
        costLabel: '',
        date: '',
        isBlank: true,
        key: `blank-${index}`,
        row: String((index % 7) + 1),
        title: 'No date',
        tokenLabel: '',
    }))
    const days = trendItems.value.map((item, index) => ({
        ...item,
        column: String(Math.floor((leadingBlankCount + index) / 7) + 2),
        isBlank: false,
        key: item.date,
        row: String(((leadingBlankCount + index) % 7) + 1),
        title: props.heatMetric === 'cost'
            ? `${item.date}: ${formatCurrency(item.costUSD)} / ${formatCompactNumber(item.totalTokens)} tokens`
            : `${item.date}: ${formatCompactNumber(item.totalTokens)} tokens / ${formatCurrency(item.costUSD)}`,
    }))
    const trailingBlanks = Array.from({ length: trailingBlankCount }, (_, index) => ({
        column: String(Math.floor((leadingBlankCount + trendItems.value.length + index) / 7) + 2),
        colorClass: 'bg-transparent',
        costLabel: '',
        date: '',
        isBlank: true,
        key: `trailing-blank-${index}`,
        row: String(((leadingBlankCount + trendItems.value.length + index) % 7) + 1),
        title: 'No date',
        tokenLabel: '',
    }))

    return [...blanks, ...days, ...trailingBlanks]
})

const heatmapColumnCount = computed(() => Math.ceil(heatmapCells.value.length / 7))
const heatmapGridStyle = computed(() => ({
    gridTemplateColumns: `max-content repeat(${heatmapColumnCount.value}, minmax(0, 1fr))`,
    gridTemplateRows: 'repeat(7, minmax(0, 1fr))',
}))
const recentTrendItems = computed(() => trendItems.value.filter(item => item.hasUsage).slice(-3))
const activeDays = computed(() => trendItems.value.filter(item => item.hasUsage).length)
const yearCost = computed(() => formatCurrency(trendItems.value.reduce((sum, item) => sum + item.costUSD, 0)))
const yearTokens = computed(() => formatCompactNumber(trendItems.value.reduce((sum, item) => sum + item.totalTokens, 0)))
const summaryCards = computed<SummaryCard[]>(() => (
    props.heatMetric === 'cost'
        ? [
                { key: 'year-cost', label: 'Year Spend', value: yearCost.value },
                { key: 'year-tokens', label: 'Year Tokens', value: yearTokens.value },
                { key: 'active-days', label: 'Active Days', value: String(activeDays.value) },
            ]
        : [
                { key: 'year-tokens', label: 'Year Tokens', value: yearTokens.value },
                { key: 'year-cost', label: 'Year Spend', value: yearCost.value },
                { key: 'active-days', label: 'Active Days', value: String(activeDays.value) },
            ]
))

function parseUsageDate(value: string) {
    return new Date(value)
}

function cloneDate(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function formatDateKey(date: Date) {
    const year = date.getFullYear()
    const month = `${date.getMonth() + 1}`.padStart(2, '0')
    const day = `${date.getDate()}`.padStart(2, '0')

    return `${year}-${month}-${day}`
}

function formatRangeDate(date: Date) {
    return new Intl.DateTimeFormat('en-US', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(date)
}

function getHeatmapLevel(value: number, maxValue: number) {
    if (value <= 0 || maxValue <= 0) {
        return 0
    }

    return Math.min(9, Math.max(1, Math.ceil((value / maxValue) * 9)))
}
</script>
