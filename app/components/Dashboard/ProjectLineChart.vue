<template>
    <div class="space-y-4">
        <div
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
                        :x="getPointIndex"
                        :y="seriesAccessors"
                    />
                    <VisAxis
                        :grid-line="false"
                        :tick-format="formatXAxis"
                        :tick-padding="10"
                        :tick-text-hide-overlapping="true"
                        :tick-text-width="56"
                        :tick-values="visibleXTicks"
                        type="x"
                    />
                    <VisAxis
                        :num-ticks="4"
                        :tick-format="formatYAxis"
                        type="y"
                    />
                    <VisTooltip v-if="hasChartData" />
                    <VisCrosshair
                        v-if="hasChartData"
                        :color="getCrosshairColor"
                        :template="formatTooltip"
                        :x="getPointIndex"
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

        <div class="flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
            <div v-for="item in orderedSeries" :key="item.label" class="flex items-center gap-2">
                <span class="size-2.5 rounded-sm" :style="{ backgroundColor: item.color }" />
                <span class="max-w-40 truncate" translate="no">{{ item.label }}</span>
                <span class="font-medium text-foreground tabular-nums">{{ formatCompactNumber(item.total) }}</span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import type { LineSeries } from '#shared/typed/project-dashboard'
import { formatCompactNumber } from '#shared/utils/usage-dashboard'
import { VisArea, VisAxis, VisCrosshair, VisTooltip, VisXYContainer } from '@unovis/vue'
import { useElementSize } from '@vueuse/core'
import { useTemplateRef } from 'vue'

interface ChartPoint {
    index: number
    label: string
    values: Record<string, number>
}

interface HoverGuideState {
    datumIndex: number | null
    pointerY: number | null
}

const props = defineProps<{
    series: LineSeries[]
    tooltipLabels?: string[]
    tickIndexes?: number[]
    xLabels: string[]
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
const darkModeMinimumLuminance = 0.24
const darkModeLowContrastColor = '#94a3b8'
const yDomain = [0, undefined] satisfies [number, undefined]
const chartHeight = 288
const colorMode = useColorMode({
    selector: 'html',
    attribute: 'class',
    storageKey: 'app-color-mode',
})
const axisMonthDayFormatter = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
})
const axisMonthFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
})
const chartRoot = useTemplateRef<HTMLDivElement>('chartRoot')
const { width: chartWidth } = useElementSize(chartRoot)
const hoverGuideState = reactive<HoverGuideState>({
    datumIndex: null,
    pointerY: null,
})

const chartData = computed<ChartPoint[]>(() => props.xLabels.map((label, index) => ({
    index,
    label: props.tooltipLabels?.[index] ?? label,
    values: Object.fromEntries(props.series.map(series => [series.label, series.points[index] ?? 0])),
})))
const axisLabels = computed(() => props.xLabels.map((label, index) => formatAxisLabel(label, index, props.xLabels.length)))
const orderedSeries = computed(() => props.series
    .map(series => ({
        ...series,
        color: getThemeAwareColor(series.color),
        total: series.points.reduce((sum, point) => sum + point, 0),
    }))
    .sort((a, b) => b.total - a.total))
const seriesAccessors = computed(() => orderedSeries.value.map(series => (point: ChartPoint) => point.values[series.label] ?? 0))
const chartConfig = computed<ChartConfig>(() => Object.fromEntries(
    orderedSeries.value.map(series => [series.label, {
        color: series.color,
        label: series.label,
    }]),
))
const gradientSvgDefs = computed(() => orderedSeries.value.map(series => `
    <linearGradient id="${getGradientId(series.label)}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${series.color}" stop-opacity="0.42" />
        <stop offset="100%" stop-color="${series.color}" stop-opacity="0.07" />
    </linearGradient>
`).join(''))
const hasChartData = computed(() => chartData.value.length > 0 && orderedSeries.value.length > 0)
const xDomain = computed<[number, number]>(() => [0, Math.max(props.xLabels.length - 1, 0)])
const plotLeft = computed(() => chartMargin.left)
const plotTop = computed(() => chartMargin.top)
const plotWidth = computed(() => Math.max(chartWidth.value - chartMargin.left - chartMargin.right, 0))
const plotHeight = computed(() => Math.max(chartHeight - chartMargin.top - chartMargin.bottom, 0))
const plotBottom = computed(() => plotTop.value + plotHeight.value)
const plotInnerWidth = computed(() => Math.max(plotWidth.value - chartPadding.left - chartPadding.right, 0))
const maxStackedValue = computed(() => Math.max(...chartData.value.map(point => Object.values(point.values).reduce((sum, value) => sum + value, 0)), 0))
const hoverGuide = computed(() => {
    if (hoverGuideState.datumIndex === null || hoverGuideState.pointerY === null) {
        return null
    }

    const point = chartData.value[hoverGuideState.datumIndex]
    if (!point || plotWidth.value <= 0 || plotHeight.value <= 0) {
        return null
    }

    const xRatio = props.xLabels.length <= 1 ? 0 : hoverGuideState.datumIndex / (props.xLabels.length - 1)
    const x = plotLeft.value + chartPadding.left + (xRatio * plotInnerWidth.value)
    const y = clampValue(hoverGuideState.pointerY, plotTop.value, plotBottom.value)
    const yRatio = plotHeight.value <= 0 ? 0 : 1 - ((y - plotTop.value) / plotHeight.value)
    const yValue = yRatio * maxStackedValue.value

    return {
        x,
        xLabel: point.label,
        y,
        yLabel: formatCompactNumber(yValue),
    }
})
const visibleXTicks = computed(() => {
    if (props.tickIndexes && props.tickIndexes.length > 0) {
        return props.tickIndexes
    }

    const count = props.xLabels.length
    const step = count > 12 ? 5 : 1

    return props.xLabels
        .map((_, index) => index)
        .filter(index => index === 0 || index === count - 1 || index % step === 0)
})

function getPointIndex(point: ChartPoint | undefined) {
    return point?.index ?? 0
}

function getAreaColor(_: ChartPoint[], index: number) {
    const series = orderedSeries.value[index]

    return series ? `url(#${getGradientId(series.label)})` : '#2563eb'
}

function getLineColor(_: ChartPoint[], index: number) {
    return orderedSeries.value[index]?.color ?? '#2563eb'
}

function getCrosshairColor(_: ChartPoint | undefined, index: number) {
    return orderedSeries.value[index]?.color ?? '#2563eb'
}

function formatXAxis(tick: number | Date) {
    if (tick instanceof Date) {
        return ''
    }

    return axisLabels.value[tick] ?? ''
}

function formatYAxis(tick: number | Date) {
    if (tick instanceof Date) {
        return ''
    }

    return formatCompactNumber(tick)
}

function formatTooltip(point: ChartPoint | undefined) {
    if (!point) {
        return ''
    }

    const rows = orderedSeries.value
        .map(series => ({
            ...series,
            value: point.values[series.label] ?? 0,
        }))
        .sort((a, b) => b.value - a.value)

    return `
        <div class="grid min-w-48 gap-2 rounded-md border bg-background px-3 py-2 text-xs shadow-lg">
            <div class="font-medium text-foreground">${escapeHtml(point.label)}</div>
            <div class="grid gap-1 text-muted-foreground">
                ${rows.map(series => `
                    <div class="flex items-center justify-between gap-4">
                        <span class="flex min-w-0 items-center gap-2">
                            <span class="size-2 shrink-0 rounded-sm" style="background-color: ${series.color}"></span>
                            <span class="truncate">${escapeHtml(series.label)}</span>
                        </span>
                        <span class="font-mono font-medium text-foreground">${formatCompactNumber(series.value)}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `
}

function handlePointerMove(event: PointerEvent) {
    const rect = chartRoot.value?.getBoundingClientRect()

    if (!rect) {
        return
    }

    const pointerX = event.clientX - rect.left
    const pointerY = event.clientY - rect.top
    const plotRight = plotLeft.value + plotWidth.value
    const plotInnerLeft = plotLeft.value + chartPadding.left
    const plotInnerRight = plotRight - chartPadding.right

    if (
        pointerX < plotLeft.value
        || pointerX > plotRight
        || pointerY < plotTop.value
        || pointerY > plotBottom.value
        || plotInnerWidth.value <= 0
        || props.xLabels.length === 0
    ) {
        clearHoverGuide()
        return
    }

    const relativeX = clampValue((pointerX - plotInnerLeft) / Math.max(plotInnerRight - plotInnerLeft, 1), 0, 1)
    const datumIndex = props.xLabels.length <= 1
        ? 0
        : Math.round(relativeX * (props.xLabels.length - 1))

    hoverGuideState.datumIndex = datumIndex
    hoverGuideState.pointerY = pointerY
}

function clearHoverGuide() {
    hoverGuideState.datumIndex = null
    hoverGuideState.pointerY = null
}

function formatAxisLabel(label: string, index: number, total: number) {
    const date = new Date(label)
    if (Number.isNaN(date.getTime())) {
        return label
    }

    const isBoundary = index === 0 || index === total - 1
    if (total >= 90 && !isBoundary && date.getDate() === 1) {
        return axisMonthFormatter.format(date)
    }

    return axisMonthDayFormatter.format(date)
}

function getGradientId(label: string) {
    return `project-line-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`
}

function clampValue(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max)
}

function escapeHtml(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function getThemeAwareColor(color: string) {
    if (colorMode.value !== 'dark') {
        return color
    }

    const luminance = getHexColorLuminance(color)

    return luminance !== null && luminance < darkModeMinimumLuminance
        ? darkModeLowContrastColor
        : color
}

function getHexColorLuminance(color: string) {
    const normalized = color.trim().replace(/^#/, '')
    const hex = normalized.length === 3
        ? normalized.split('').map(char => `${char}${char}`).join('')
        : normalized

    if (!/^[\da-f]{6}$/i.test(hex)) {
        return null
    }

    const red = Number.parseInt(hex.slice(0, 2), 16) / 255
    const green = Number.parseInt(hex.slice(2, 4), 16) / 255
    const blue = Number.parseInt(hex.slice(4, 6), 16) / 255
    const linearRed = toLinearRgb(red)
    const linearGreen = toLinearRgb(green)
    const linearBlue = toLinearRgb(blue)

    return (0.2126 * linearRed) + (0.7152 * linearGreen) + (0.0722 * linearBlue)
}

function toLinearRgb(value: number) {
    return value <= 0.03928
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4
}
</script>
