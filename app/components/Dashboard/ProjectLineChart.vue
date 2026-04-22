<template>
    <div class="space-y-4">
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
                    :tick-values="visibleXTicks"
                    type="x"
                />
                <VisAxis
                    :num-ticks="4"
                    :tick-format="formatYAxis"
                    type="y"
                />
                <VisTooltip />
                <VisCrosshair
                    :color="getCrosshairColor"
                    :template="formatTooltip"
                    :x="getPointIndex"
                    :y-stacked="seriesAccessors"
                />
            </VisXYContainer>
        </ChartContainer>

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

interface ChartPoint {
    index: number
    label: string
    values: Record<string, number>
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
    right: 12,
    top: 8,
}
const darkModeMinimumLuminance = 0.24
const darkModeLowContrastColor = '#94a3b8'
const yDomain = [0, undefined] satisfies [number, undefined]
const colorMode = useColorMode({
    selector: 'html',
    attribute: 'class',
    storageKey: 'app-color-mode',
})

const chartData = computed<ChartPoint[]>(() => props.xLabels.map((label, index) => ({
    index,
    label: props.tooltipLabels?.[index] ?? label,
    values: Object.fromEntries(props.series.map(series => [series.label, series.points[index] ?? 0])),
})))
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
const xDomain = computed<[number, number]>(() => [0, Math.max(props.xLabels.length - 1, 0)])
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

function getPointIndex(point: ChartPoint) {
    return point.index
}

function getAreaColor(_: ChartPoint[], index: number) {
    const series = orderedSeries.value[index]

    return series ? `url(#${getGradientId(series.label)})` : '#2563eb'
}

function getLineColor(_: ChartPoint[], index: number) {
    return orderedSeries.value[index]?.color ?? '#2563eb'
}

function getCrosshairColor(_: ChartPoint, index: number) {
    return orderedSeries.value[index]?.color ?? '#2563eb'
}

function formatXAxis(tick: number | Date) {
    if (tick instanceof Date) {
        return ''
    }

    return props.xLabels[tick] ?? ''
}

function formatYAxis(tick: number | Date) {
    if (tick instanceof Date) {
        return ''
    }

    return formatCompactNumber(tick)
}

function formatTooltip(point: ChartPoint) {
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

function getGradientId(label: string) {
    return `project-line-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`
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
