<template>
    <StatisticalAnalysisPanel
        description="Cached input ratio across total input tokens"
        icon="lucide:gauge"
        title="Efficiency / Cache"
    >
        <div class="grid gap-6 lg:grid-cols-[220px_1fr] lg:items-center">
            <div class="flex items-center justify-center">
                <ChartContainer class="h-52 w-full max-w-56" :config="chartConfig">
                    <VisSingleContainer :data="cacheSegments" :height="208">
                        <VisDonut
                            :arc-width="26"
                            :central-label="cacheHitRateLabel"
                            central-sub-label="Hit Rate"
                            :color="getSegmentColor"
                            :corner-radius="4"
                            :pad-angle="0.04"
                            :value="getSegmentValue"
                        />
                        <VisTooltip :triggers="tooltipTriggers" />
                    </VisSingleContainer>
                </ChartContainer>
            </div>

            <div class="space-y-3">
                <div
                    v-for="segment in cacheSegments"
                    :key="segment.key"
                    class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3"
                >
                    <div class="flex min-w-0 items-center gap-2">
                        <span class="size-2.5 shrink-0 rounded-full" :style="{ backgroundColor: segment.color }" />
                        <span class="truncate text-sm text-muted-foreground">{{ segment.label }}</span>
                    </div>
                    <span class="text-sm font-semibold tabular-nums">{{ segment.valueLabel }}</span>
                    <span class="w-12 text-right text-xs text-muted-foreground tabular-nums">{{ segment.shareLabel }}</span>
                </div>
            </div>
        </div>

        <div class="mt-5 border-t pt-4">
            <StatisticalAnalysisUsageBarList :items="items" />
        </div>
    </StatisticalAnalysisPanel>
</template>

<script setup lang="ts">
import type { ChartConfig } from '@/components/ui/chart'
import type { DailyTokenUsage, RankedUsageItem } from '~/composables/useUsageDashboard'
import { VisDonut, VisDonutSelectors, VisSingleContainer, VisTooltip } from '@unovis/vue'
import { computed } from 'vue'
import { ChartContainer } from '@/components/ui/chart'
import { formatCompactNumber, formatPercent } from '~/composables/useUsageDashboard'

defineOptions({
    name: 'StatisticalAnalysisEfficiencyCachePanel',
})

const props = defineProps<{
    dailyItems: DailyTokenUsage[]
    items: RankedUsageItem[]
}>()

interface CacheSegment {
    color: string
    key: string
    label: string
    shareLabel: string
    value: number
    valueLabel: string
}

interface DonutTooltipDatum {
    data: CacheSegment
}

const totalInputTokens = computed(() => props.dailyItems.reduce((sum, item) => sum + item.inputTokens, 0))
const totalCachedInputTokens = computed(() => props.dailyItems.reduce((sum, item) => sum + item.cachedInputTokens, 0))
const totalFreshInputTokens = computed(() => Math.max(totalInputTokens.value - totalCachedInputTokens.value, 0))
const cacheHitRate = computed(() => totalInputTokens.value > 0 ? totalCachedInputTokens.value / totalInputTokens.value : 0)
const cacheHitRateLabel = computed(() => formatPercent(cacheHitRate.value))

const cacheSegments = computed<CacheSegment[]>(() => [
    {
        color: '#059669',
        key: 'cached',
        label: 'Cached Input',
        shareLabel: formatPercent(cacheHitRate.value),
        value: totalCachedInputTokens.value,
        valueLabel: formatCompactNumber(totalCachedInputTokens.value),
    },
    {
        color: '#0ea5e9',
        key: 'fresh',
        label: 'Fresh Input',
        shareLabel: formatPercent(totalInputTokens.value > 0 ? totalFreshInputTokens.value / totalInputTokens.value : 0),
        value: totalFreshInputTokens.value,
        valueLabel: formatCompactNumber(totalFreshInputTokens.value),
    },
])

const chartConfig = computed<ChartConfig>(() => Object.fromEntries(
    cacheSegments.value.map(segment => [segment.key, {
        color: segment.color,
        label: segment.label,
    }]),
))

const tooltipTriggers = computed(() => ({
    [VisDonutSelectors.segment]: formatSegmentTooltip,
}))

function getSegmentValue(item: CacheSegment) {
    return item.value
}

function getSegmentColor(item: CacheSegment) {
    return item.color
}

function formatSegmentTooltip(item: DonutTooltipDatum) {
    const segment = item.data

    return `
        <div class="grid min-w-40 gap-2 rounded-md border bg-background px-3 py-2 text-xs shadow-lg">
            <div class="flex items-center gap-2 font-medium text-foreground">
                <span class="size-2 rounded-sm" style="background-color: ${segment.color}"></span>
                ${escapeHtml(segment.label)}
            </div>
            <div class="grid gap-1 text-muted-foreground">
                <div class="flex justify-between gap-4"><span>Tokens</span><span class="font-mono font-medium text-foreground">${segment.valueLabel}</span></div>
                <div class="flex justify-between gap-4"><span>Share</span><span class="font-mono font-medium text-foreground">${segment.shareLabel}</span></div>
            </div>
        </div>
    `
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
