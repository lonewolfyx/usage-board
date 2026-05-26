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
                        class="pointer-events-none absolute bottom-full z-30 mb-2 hidden w-64 max-w-[calc(100vw-2rem)] gap-1 rounded-md border bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-md group-hover:grid group-focus-visible:grid"
                        :class="cell.tooltipClass"
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
                        <div
                            v-if="cell.platformSections.length > 0 || cell.modelRows.length > 0"
                            class="mt-1 grid max-h-56 gap-2 overflow-y-auto border-t pt-2 pr-1"
                        >
                            <template v-if="cell.platformSections.length > 0">
                                <div
                                    v-for="section in cell.platformSections"
                                    :key="section.key"
                                    class="grid gap-1"
                                >
                                    <div class="flex items-center justify-between gap-3 text-[11px] font-semibold">
                                        <span>{{ section.label }}</span>
                                        <span class="font-mono text-muted-foreground">
                                            {{ section.costLabel }} / {{ section.tokenLabel }}
                                        </span>
                                    </div>
                                    <div
                                        v-for="model in section.models"
                                        :key="model.key"
                                        class="flex items-center justify-between gap-3 text-[11px] text-muted-foreground"
                                    >
                                        <span class="min-w-0 truncate">
                                            {{ model.label }}<span v-if="model.isFallback"> (fallback)</span>
                                        </span>
                                        <span class="shrink-0 font-mono">
                                            {{ model.costLabel }} / {{ model.tokenLabel }}
                                        </span>
                                    </div>
                                </div>
                            </template>
                            <template v-else>
                                <div
                                    v-for="model in cell.modelRows"
                                    :key="model.key"
                                    class="flex items-center justify-between gap-3 text-[11px] text-muted-foreground"
                                >
                                    <span class="min-w-0 truncate">
                                        {{ model.label }}<span v-if="model.isFallback"> (fallback)</span>
                                    </span>
                                    <span class="shrink-0 font-mono">
                                        {{ model.costLabel }} / {{ model.tokenLabel }}
                                    </span>
                                </div>
                            </template>
                        </div>
                        <span
                            class="absolute top-full size-2 -translate-y-1/2 rotate-45 border-r border-b border-border bg-popover"
                            :class="cell.tooltipArrowClass"
                        />
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
import { PROJECT_USAGE_PLATFORM_META } from '#shared/platform/metadata'
import { computed } from 'vue'

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

interface TooltipModelRow {
    costLabel: string
    isFallback: boolean
    key: string
    label: string
    totalTokens: number
    tokenLabel: string
    costUSD: number
}

interface TooltipPlatformSection {
    costLabel: string
    key: string
    label: string
    models: TooltipModelRow[]
    totalTokens: number
    tokenLabel: string
    costUSD: number
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
            modelRows: buildTooltipModelRows(item.usage?.models ?? {}),
            platformSections: buildTooltipPlatformSections(item.usage?.platforms),
            tokenLabel: formatCompactNumber(totalTokens),
            totalTokens,
        }
    })
})

const heatmapCells = computed(() => {
    const leadingBlankCount = rangeStartDate.value.getDay()
    const trailingBlankCount = (7 - ((leadingBlankCount + trendItems.value.length) % 7)) % 7
    const weekColumnCount = Math.ceil((leadingBlankCount + trendItems.value.length + trailingBlankCount) / 7)
    const blanks = Array.from({ length: leadingBlankCount }, (_, index) => ({
        column: String(Math.floor(index / 7) + 2),
        colorClass: 'bg-transparent',
        costLabel: '',
        date: '',
        isBlank: true,
        key: `blank-${index}`,
        modelRows: [],
        platformSections: [],
        row: String((index % 7) + 1),
        title: 'No date',
        tooltipArrowClass: '',
        tooltipClass: '',
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
        ...getTooltipPlacement(Math.floor((leadingBlankCount + index) / 7), weekColumnCount),
    }))
    const trailingBlanks = Array.from({ length: trailingBlankCount }, (_, index) => ({
        column: String(Math.floor((leadingBlankCount + trendItems.value.length + index) / 7) + 2),
        colorClass: 'bg-transparent',
        costLabel: '',
        date: '',
        isBlank: true,
        key: `trailing-blank-${index}`,
        modelRows: [],
        platformSections: [],
        row: String(((leadingBlankCount + trendItems.value.length + index) % 7) + 1),
        title: 'No date',
        tooltipArrowClass: '',
        tooltipClass: '',
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

function buildTooltipPlatformSections(platforms: DailyTokenUsage['platforms']): TooltipPlatformSection[] {
    return Object.entries(platforms ?? {})
        .map(([platform, usage]) => ({
            costLabel: formatCurrency(usage.costUSD),
            costUSD: usage.costUSD,
            key: platform,
            label: PROJECT_USAGE_PLATFORM_META[platform as keyof typeof PROJECT_USAGE_PLATFORM_META]?.label ?? platform,
            models: buildTooltipModelRows(usage.models),
            totalTokens: usage.totalTokens,
            tokenLabel: formatCompactNumber(usage.totalTokens),
        }))
        .sort(sortTooltipRows)
}

function buildTooltipModelRows(models: DailyTokenUsage['models']): TooltipModelRow[] {
    return Object.entries(models)
        .map(([model, usage]) => ({
            costLabel: formatCurrency(usage.costUSD),
            costUSD: usage.costUSD,
            isFallback: usage.isFallback,
            key: model,
            label: model,
            totalTokens: usage.totalTokens,
            tokenLabel: formatCompactNumber(usage.totalTokens),
        }))
        .sort(sortTooltipRows)
}

function sortTooltipRows(
    left: Pick<TooltipModelRow, 'costUSD' | 'label' | 'totalTokens'>,
    right: Pick<TooltipModelRow, 'costUSD' | 'label' | 'totalTokens'>,
) {
    const metricDifference = props.heatMetric === 'cost'
        ? right.costUSD - left.costUSD
        : right.totalTokens - left.totalTokens

    if (metricDifference !== 0) {
        return metricDifference
    }

    if (right.totalTokens !== left.totalTokens) {
        return right.totalTokens - left.totalTokens
    }

    if (right.costUSD !== left.costUSD) {
        return right.costUSD - left.costUSD
    }

    return left.label.localeCompare(right.label)
}

function getTooltipPlacement(weekColumnIndex: number, weekColumnCount: number) {
    if (weekColumnIndex <= 1) {
        return {
            tooltipArrowClass: 'left-3.5',
            tooltipClass: 'left-0',
        }
    }

    if (weekColumnIndex >= weekColumnCount - 2) {
        return {
            tooltipArrowClass: 'right-3.5',
            tooltipClass: 'right-0',
        }
    }

    return {
        tooltipArrowClass: 'left-1/2 -translate-x-1/2',
        tooltipClass: 'left-1/2 -translate-x-1/2',
    }
}
</script>
