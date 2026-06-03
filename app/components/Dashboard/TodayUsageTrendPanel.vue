<template>
    <StatisticalAnalysisPanel
        description="Hourly token and spend by agent for today"
        icon="lucide:chart-area"
        title="Today's Token Trend"
    >
        <div
            v-if="orderedAgents.length > 0"
            ref="chartRoot"
            class="relative"
            @pointerleave="clearHoverGuide"
            @pointermove="handlePointerMove"
        >
            <ChartContainer class="h-72 w-full" :config="chartConfig">
                <VisXYContainer
                    :auto-margin="false"
                    :data="chartData"
                    :height="288"
                    :margin="chartMargin"
                    :padding="chartPadding"
                    :svg-defs="gradientSvgDefs"
                    :x-domain="xDomain"
                    :y-domain="yDomain"
                >
                    <VisArea
                        :color="getAreaColor"
                        curve-type="monotoneX"
                        :line="true"
                        :line-color="getLineColor"
                        :line-width="2"
                        :opacity="0.82"
                        :x="getPointHour"
                        :y="seriesAccessors"
                    />
                    <VisAxis
                        :grid-line="false"
                        :tick-format="formatXAxis"
                        :tick-padding="10"
                        :tick-values="visibleXTicks"
                        type="x"
                    />
                    <VisAxis
                        :num-ticks="4"
                        :tick-format="formatCompactAxisTick"
                        type="y"
                    />
                    <VisTooltip v-if="orderedAgents.length > 0" />
                    <VisCrosshair
                        v-if="orderedAgents.length > 0"
                        :color="getCrosshairColor"
                        :template="formatTooltip"
                        :x="getPointHour"
                        :y-stacked="seriesAccessors"
                    />
                </VisXYContainer>
            </ChartContainer>

            <div v-if="hoverGuide" class="pointer-events-none absolute inset-0 z-10">
                <div
                    class="absolute border-l border-dashed border-border/80"
                    :style="{
                        height: `${plotHeight}px`,
                        left: `${hoverGuide.x}px`,
                        top: `${plotTop}px`,
                    }"
                />
                <div
                    class="absolute border-t border-dashed border-border/80"
                    :style="{
                        left: `${plotLeft}px`,
                        top: `${hoverGuide.y}px`,
                        width: `${plotWidth}px`,
                    }"
                />
                <div
                    class="absolute rounded-sm bg-foreground px-2 py-1 text-[11px] font-medium text-background shadow-sm"
                    :style="{
                        left: `${hoverGuide.x}px`,
                        top: `${plotBottom + 6}px`,
                        transform: 'translateX(-50%)',
                    }"
                >
                    {{ hoverGuide.xLabel }}
                </div>
                <div
                    class="absolute rounded-sm bg-foreground px-2 py-1 text-[11px] font-medium text-background shadow-sm"
                    :style="{
                        left: `${Math.max(plotLeft - 8, 0)}px`,
                        top: `${hoverGuide.y}px`,
                        transform: 'translate(-100%, -50%)',
                    }"
                >
                    {{ hoverGuide.yLabel }}
                </div>
            </div>
        </div>

        <div v-else class="flex h-72 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            No usage recorded today.
        </div>

        <div class="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
            <div v-for="agent in orderedAgents" :key="agent.key" class="flex items-center gap-2">
                <span class="size-2.5 rounded-sm" :style="{ backgroundColor: agent.color }" />
                <span>{{ agent.label }}</span>
                <span class="font-medium text-foreground tabular-nums">{{ formatCompactNumber(agent.totalTokens) }}</span>
            </div>
        </div>
    </StatisticalAnalysisPanel>
</template>

<script setup lang="ts">
import { PROJECT_USAGE_PLATFORM_META } from '#shared/platform/metadata'
import { PROJECT_USAGE_PLATFORMS } from '#shared/types/ai'
import { formatCompactNumber, formatCurrency } from '#shared/utils/usage-dashboard'
import { VisArea, VisAxis, VisCrosshair, VisTooltip, VisXYContainer } from '@unovis/vue'
import { useElementSize } from '@vueuse/core'
import { useTemplateRef } from 'vue'
import { clampNumber, createStackedAreaChartColors, escapeHtml, formatCompactAxisTick } from '~/lib/chart'

interface ChartPoint {
    costUSD: number
    hour: number
    label: string
    totalTokens: number
    values: Record<string, number>
}

const props = defineProps<{
    items: HourlyUsagePoint[]
}>()

const chartMargin = {
    bottom: 32,
    left: 56,
    right: 28,
    top: 8,
}
const chartPadding = {
    left: 8,
    right: 18,
}
const chartHeight = 288
const yDomain = [0, undefined] satisfies [number, undefined]
const chartRoot = useTemplateRef<HTMLDivElement>('chartRoot')
const { width: chartWidth } = useElementSize(chartRoot)

const orderedAgents = computed(() => PROJECT_USAGE_PLATFORMS
    .map((platform) => {
        const totalTokens = props.items.reduce((sum, item) => sum + (item.agents[platform]?.totalTokens ?? 0), 0)

        return {
            color: platform === 'codex' ? '#94a3b8' : PROJECT_USAGE_PLATFORM_META[platform].color,
            key: platform,
            label: PROJECT_USAGE_PLATFORM_META[platform].label,
            totalTokens,
        }
    })
    .filter(agent => agent.totalTokens > 0)
    .sort((a, b) => b.totalTokens - a.totalTokens))

const chartData = computed<ChartPoint[]>(() => props.items.map(item => ({
    costUSD: item.costUSD,
    hour: item.hour,
    label: item.label,
    totalTokens: item.totalTokens,
    values: Object.fromEntries(orderedAgents.value.map(agent => [agent.key, item.agents[agent.key]?.totalTokens ?? 0])),
})))

const seriesAccessors = computed(() => orderedAgents.value.map(agent => (point: ChartPoint) => point.values[agent.key] ?? 0))
const chartConfig = computed<ChartConfig>(() => Object.fromEntries(
    orderedAgents.value.map(agent => [agent.key, {
        color: agent.color,
        label: agent.label,
    }]),
))
const {
    getAreaColor,
    getCrosshairColor,
    getGradientId,
    getLineColor,
} = createStackedAreaChartColors(() => orderedAgents.value, {
    getColor: agent => agent.color,
    getKey: agent => agent.key,
    gradientPrefix: 'today-usage-trend',
})
const gradientSvgDefs = computed(() => orderedAgents.value.map(agent => `
    <linearGradient id="${getGradientId(agent.key)}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${agent.color}" stop-opacity="0.42" />
        <stop offset="100%" stop-color="${agent.color}" stop-opacity="0.07" />
    </linearGradient>
`).join(''))
const xDomain = [0, 23] satisfies [number, number]
const visibleXTicks = [0, 4, 8, 12, 16, 20, 23]
const plotLeft = computed(() => chartMargin.left)
const plotTop = computed(() => chartMargin.top)
const plotWidth = computed(() => Math.max(chartWidth.value - chartMargin.left - chartMargin.right, 0))
const plotHeight = computed(() => Math.max(chartHeight - chartMargin.top - chartMargin.bottom, 0))
const plotBottom = computed(() => plotTop.value + plotHeight.value)
const plotInnerWidth = computed(() => Math.max(plotWidth.value - chartPadding.left - chartPadding.right, 0))
const maxTotalTokens = computed(() => Math.max(...chartData.value.map(point => point.totalTokens), 0))
const {
    clearHoverGuide,
    handlePointerMove,
    hoverPointerY,
    hoverSelection,
} = useChartHoverGuide({
    chartRoot,
    isEnabled: () => props.items.length > 0 && plotInnerWidth.value > 0,
    resolveBounds: () => ({
        bottom: plotBottom.value,
        left: plotLeft.value,
        right: plotLeft.value + plotWidth.value,
        top: plotTop.value,
    }),
    resolveSelection(pointerX) {
        const plotRight = plotLeft.value + plotWidth.value
        const plotInnerLeft = plotLeft.value + chartPadding.left
        const plotInnerRight = plotRight - chartPadding.right

        return Math.round(clampNumber(
            ((pointerX - plotInnerLeft) / Math.max(plotInnerRight - plotInnerLeft, 1)) * 23,
            0,
            23,
        ))
    },
})
const hoverGuide = computed(() => {
    if (hoverSelection.value === null || hoverPointerY.value === null) {
        return null
    }

    const point = chartData.value[hoverSelection.value]
    if (!point || plotWidth.value <= 0 || plotHeight.value <= 0) {
        return null
    }

    const x = plotLeft.value + chartPadding.left + ((hoverSelection.value / 23) * plotInnerWidth.value)
    const y = clampNumber(hoverPointerY.value, plotTop.value, plotBottom.value)
    const yRatio = plotHeight.value <= 0 ? 0 : 1 - ((y - plotTop.value) / plotHeight.value)

    return {
        x,
        xLabel: point.label,
        y,
        yLabel: formatCompactNumber(yRatio * maxTotalTokens.value),
    }
})

function getPointHour(point: ChartPoint | undefined) {
    return point?.hour ?? 0
}

function formatXAxis(value: number | Date) {
    return value instanceof Date ? '' : props.items[value]?.label ?? ''
}

function formatTooltip(point: ChartPoint | undefined) {
    if (!point) {
        return ''
    }

    const rows = orderedAgents.value
        .map(agent => ({
            color: agent.color,
            costUSD: props.items[point.hour]?.agents[agent.key]?.costUSD ?? 0,
            label: agent.label,
            totalTokens: point.values[agent.key] ?? 0,
        }))
        .filter(agent => agent.totalTokens > 0 || agent.costUSD > 0)
        .sort((a, b) => b.totalTokens - a.totalTokens)

    return `
        <div class="grid min-w-56 gap-2 rounded-md border bg-background px-3 py-2 text-xs shadow-lg">
            <div class="flex items-center justify-between gap-4">
                <span class="font-medium text-foreground">${escapeHtml(point.label)}</span>
                <span class="font-mono text-muted-foreground">${formatCurrency(point.costUSD)}</span>
            </div>
            <div class="flex items-center justify-between gap-4 border-b pb-2 text-muted-foreground">
                <span>Total Tokens</span>
                <span class="font-mono font-semibold text-foreground">${formatCompactNumber(point.totalTokens)}</span>
            </div>
            <div class="grid gap-1 text-muted-foreground">
                ${rows.map(agent => `
                    <div class="flex items-center justify-between gap-4">
                        <span class="flex min-w-0 items-center gap-2">
                            <span class="size-2 shrink-0 rounded-sm" style="background-color: ${agent.color}"></span>
                            <span class="truncate">${escapeHtml(agent.label)}</span>
                        </span>
                        <span class="font-mono font-medium text-foreground">${formatCompactNumber(agent.totalTokens)} / ${formatCurrency(agent.costUSD)}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `
}
</script>
