<template>
    <StatisticalAnalysisPanel
        description="Find spend sources by project or repository"
        icon="lucide:folder-git-2"
        title="Project / Repository"
    >
        <div class="grid gap-6 lg:grid-cols-[220px_1fr] lg:items-center">
            <div class="flex items-center justify-center">
                <ChartContainer class="h-52 w-full max-w-56" :config="chartConfig">
                    <VisSingleContainer :data="categoryItems" :height="208">
                        <VisDonut
                            :arc-width="26"
                            :central-label="totalCostLabel"
                            central-sub-label="Total"
                            :color="getCategoryColor"
                            :corner-radius="2"
                            :pad-angle="0.03"
                            :value="getCategoryCost"
                        />
                        <VisTooltip :triggers="tooltipTriggers" />
                    </VisSingleContainer>
                </ChartContainer>
            </div>

            <div class="space-y-3">
                <div
                    v-for="project in categoryItems"
                    :key="project.repository"
                    class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3"
                >
                    <div class="flex min-w-0 items-center gap-2">
                        <span class="size-2.5 shrink-0 rounded-full" :style="{ backgroundColor: project.color }" />
                        <span class="truncate text-sm text-muted-foreground">{{ project.label }}</span>
                    </div>
                    <span class="text-sm font-semibold tabular-nums">{{ project.value }}</span>
                    <span class="w-12 text-right text-xs text-muted-foreground tabular-nums">{{ project.shareLabel }}</span>
                </div>
            </div>
        </div>
    </StatisticalAnalysisPanel>
</template>

<script setup lang="ts">
import type { ChartConfig } from '@/components/ui/chart'
import type { ProjectUsageItem } from '~/composables/useUsageDashboard'
import { VisDonut, VisDonutSelectors, VisSingleContainer, VisTooltip } from '@unovis/vue'
import { computed } from 'vue'
import { ChartContainer } from '@/components/ui/chart'
import { formatCurrency, formatPercent } from '~/composables/useUsageDashboard'

defineOptions({
    name: 'StatisticalAnalysisProjectUsagePanel',
})

const props = defineProps<{
    items: ProjectUsageItem[]
}>()

interface ProjectCategoryItem extends ProjectUsageItem {
    color: string
    share: number
    shareLabel: string
}

interface DonutTooltipDatum {
    data: ProjectCategoryItem
}

const categoryColors = ['#2563eb', '#f97316', '#0891b2', '#8b5cf6', '#059669', '#f43f5e', '#64748b', '#eab308']
const totalCost = computed(() => props.items.reduce((sum, item) => sum + item.costUSD, 0))
const totalCostLabel = computed(() => formatCurrency(totalCost.value))

const categoryItems = computed<ProjectCategoryItem[]>(() => props.items.map((item, index) => ({
    ...item,
    color: categoryColors[index % categoryColors.length],
    share: totalCost.value > 0 ? item.costUSD / totalCost.value : 0,
    shareLabel: formatPercent(totalCost.value > 0 ? item.costUSD / totalCost.value : 0),
})))

const chartConfig = computed<ChartConfig>(() => Object.fromEntries(
    categoryItems.value.map(item => [item.label, {
        color: item.color,
        label: item.label,
    }]),
))

const tooltipTriggers = computed(() => ({
    [VisDonutSelectors.segment]: formatProjectTooltip,
}))

function getCategoryCost(item: ProjectCategoryItem) {
    return item.costUSD
}

function getCategoryColor(item: ProjectCategoryItem) {
    return item.color
}

function formatProjectTooltip(item: DonutTooltipDatum) {
    const project = item.data

    return `
        <div class="grid min-w-48 gap-2 rounded-md border bg-background px-3 py-2 text-xs shadow-lg">
            <div class="flex items-center gap-2 font-medium text-foreground">
                <span class="size-2 rounded-sm" style="background-color: ${project.color}"></span>
                ${escapeHtml(project.label)}
            </div>
            <div class="grid gap-1 text-muted-foreground">
                <div class="flex justify-between gap-4"><span>Spend</span><span class="font-mono font-medium text-foreground">${project.value}</span></div>
                <div class="flex justify-between gap-4"><span>Share</span><span class="font-mono font-medium text-foreground">${project.shareLabel}</span></div>
                <div class="flex justify-between gap-4"><span>Sessions</span><span class="font-mono font-medium text-foreground">${project.sessions}</span></div>
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
