<template>
    <StatisticalAnalysisPanel
        description="Monthly token trends by model"
        icon="solar:cpu-line-duotone"
        title="Model Usage"
    >
        <ChartContainer class="h-72 w-full" :config="chartConfig">
            <VisXYContainer
                :auto-margin="false"
                :data="chartData"
                :height="288"
                :margin="chartMargin"
                :svg-defs="gradientSvgDefs"
                :x-domain="xDomain"
                :y-domain="yDomain"
            >
                <VisArea
                    :color="getAreaColor"
                    :line="true"
                    :line-color="getLineColor"
                    :line-width="2.5"
                    :opacity="0.82"
                    :x="getMonthIndex"
                    :y="modelTokenAccessors"
                />
                <VisAxis
                    :grid-line="false"
                    :tick-format="formatMonthAxis"
                    :tick-values="monthTicks"
                    type="x"
                />
                <VisAxis
                    :num-ticks="4"
                    :tick-format="formatTokenAxis"
                    type="y"
                />
                <VisTooltip />
                <VisCrosshair
                    :color="getCrosshairColor"
                    :template="formatTooltip"
                    :x="getMonthIndex"
                    :y-stacked="modelTokenAccessors"
                />
            </VisXYContainer>
        </ChartContainer>

        <div class="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
            <div v-for="series in modelSeries" :key="series.model" class="flex items-center gap-2">
                <span class="size-2.5 rounded-sm" :style="{ backgroundColor: series.color }" />
                <span>{{ series.model }}</span>
                <span class="font-medium text-foreground tabular-nums">{{ series.totalLabel }}</span>
            </div>
        </div>
    </StatisticalAnalysisPanel>
</template>

<script setup lang="ts">
import { VisArea, VisAxis, VisCrosshair, VisTooltip, VisXYContainer } from '@unovis/vue'
import { computed } from 'vue'
import { ChartContainer } from '@/components/ui/chart'
import { formatCompactNumber } from '~/composables/useUsageDashboard'

defineOptions({
    name: 'StatisticalAnalysisModelUsagePanel',
})

const props = defineProps<{
    monthlyItems: MonthlyModelUsage[]
    year?: number
}>()

const modelColors = ['#2563eb', '#f97316', '#0891b2', '#8b5cf6', '#059669', '#f43f5e']

const chartMargin = {
    bottom: 32,
    left: 56,
    right: 12,
    top: 8,
}

const yDomain = [0, undefined] satisfies [number, undefined]

const selectedYear = computed(() => props.year ?? getLatestUsageYear(props.monthlyItems) ?? new Date().getFullYear())

const months = computed(() => Array.from({ length: 12 }, (_, index) => {
    const monthNumber = `${index + 1}`.padStart(2, '0')

    return `${selectedYear.value}-${monthNumber}`
}))

const xDomain = computed<[number, number]>(() => [0, Math.max(months.value.length - 1, 0)])

const monthTicks = computed(() => months.value.map((_, index) => index))

const yearlyItems = computed(() => props.monthlyItems.filter(item => item.month.startsWith(`${selectedYear.value}-`)))

const models = computed(() => Array.from(new Set(yearlyItems.value.map(item => item.model))))

const chartData = computed<ModelSeriesDatum[]>(() => months.value.map((month, monthIndex) => {
    const tokensByModel = Object.fromEntries(
        models.value.map(model => [
            model,
            yearlyItems.value.find(item => item.month === month && item.model === model)?.tokenTotal ?? 0,
        ]),
    )

    return {
        month,
        monthIndex,
        tokensByModel,
        totalTokens: Object.values(tokensByModel).reduce((sum, value) => sum + value, 0),
    }
}))

const modelSeries = computed<ModelSeries[]>(() => {
    return models.value.map((model, modelIndex) => {
        const color = getModelColor(modelIndex)
        const totalTokens = chartData.value.reduce((sum, item) => sum + (item.tokensByModel[model] ?? 0), 0)

        return {
            color,
            model,
            totalLabel: formatCompactNumber(totalTokens),
            totalTokens,
        }
    }).sort((a, b) => b.totalTokens - a.totalTokens)
})

const modelTokenAccessors = computed(() => modelSeries.value.map(
    series => (item: ModelSeriesDatum) => item.tokensByModel[series.model] ?? 0,
))

const chartConfig = computed<ChartConfig>(() => Object.fromEntries(
    modelSeries.value.map(series => [series.model, {
        color: series.color,
        label: series.model,
    }]),
))

const gradientSvgDefs = computed(() => modelSeries.value.map(series => `
    <linearGradient id="${getGradientId(series.model)}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${series.color}" stop-opacity="0.45" />
        <stop offset="100%" stop-color="${series.color}" stop-opacity="0.08" />
    </linearGradient>
`).join(''))

function getMonthIndex(item: ModelSeriesDatum) {
    return item.monthIndex
}

function getAreaColor(_: ModelSeriesDatum[], index: number) {
    const series = modelSeries.value[index]

    return series ? `url(#${getGradientId(series.model)})` : getModelColor(0)
}

function getLineColor(_: ModelSeriesDatum[], index: number) {
    return modelSeries.value[index]?.color ?? getModelColor(0)
}

function getCrosshairColor(_: ModelSeriesDatum, index: number) {
    return modelSeries.value[index]?.color ?? getModelColor(0)
}

function formatTooltip(datum: ModelSeriesDatum) {
    const rows = modelSeries.value
        .map(series => ({
            ...series,
            tokenTotal: datum.tokensByModel[series.model] ?? 0,
        }))
        .sort((a, b) => b.tokenTotal - a.tokenTotal)

    return `
        <div class="grid min-w-48 gap-2 rounded-md border bg-background px-3 py-2 text-xs shadow-lg">
            <div class="font-medium text-foreground">${formatMonthLabel(datum.month)} ${datum.month.slice(0, 4)}</div>
            <div class="grid gap-1 text-muted-foreground">
                ${rows.map(series => `
                    <div class="flex items-center justify-between gap-4">
                        <span class="flex items-center gap-2">
                            <span class="size-2 rounded-sm" style="background-color: ${series.color}"></span>
                            ${escapeHtml(series.model)}
                        </span>
                        <span class="font-mono font-medium text-foreground">${formatCompactNumber(series.tokenTotal)}</span>
                    </div>
                `).join('')}
            </div>
            <div class="flex justify-between gap-4 border-t pt-2 text-muted-foreground">
                <span>Total</span>
                <span class="font-mono font-semibold text-foreground">${formatCompactNumber(datum.totalTokens)}</span>
            </div>
        </div>
    `
}

function formatMonthAxis(tick: number | Date) {
    if (tick instanceof Date) {
        return ''
    }

    const month = months.value[tick]
    if (!month) {
        return ''
    }

    return formatMonthLabel(month)
}

function formatTokenAxis(tick: number | Date) {
    if (tick instanceof Date) {
        return ''
    }

    return formatCompactNumber(tick)
}

function formatMonthLabel(month: string) {
    const [year, monthNumber] = month.split('-')
    const date = new Date(Number(year), Number(monthNumber) - 1, 1)

    return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date)
}

function getLatestUsageYear(items: MonthlyModelUsage[]) {
    const latestMonth = [...items].sort((a, b) => b.month.localeCompare(a.month))[0]?.month
    const year = latestMonth?.split('-')[0]

    return year ? Number(year) : null
}

function getGradientId(model: string) {
    return `model-usage-${model.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`
}

function getModelColor(index: number) {
    return modelColors[index % modelColors.length] ?? '#2563eb'
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
