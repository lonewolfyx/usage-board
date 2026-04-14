<template>
    <StatisticalAnalysisPanel
        description="Best performers by spend"
        icon="lucide:folder-git-2"
        title="Top Projects"
    >
        <div class="space-y-3">
            <div
                v-for="project in featuredProjects"
                :key="project.repository"
                class="flex justify-between items-center gap-3 rounded-md transition-colors"
            >
                <div class="flex flex-col flex-1">
                    <p class="truncate text-sm font-medium tracking-tight">
                        {{ project.label }}
                    </p>
                    <p class="mt-1 truncate text-xs text-muted-foreground">
                        {{ project.detail }}
                    </p>
                </div>
                <div class="text-right">
                    <p class="text-xs font-medium tracking-tight tabular-nums">
                        {{ project.value }}
                    </p>
                    <div class="mt-1 flex items-center justify-end gap-1">
                        <Icon :class="getTrendIconClass(project.trendTone)" mode="svg" :name="getTrendIcon(project.trendTone)" />
                        <span :class="getTrendTextClass(project.trendTone)">
                            {{ project.trend }}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    </StatisticalAnalysisPanel>
</template>

<script setup lang="ts">
import type { ProjectUsageItem } from '~/composables/useUsageDashboard'
import { computed } from 'vue'

defineOptions({
    name: 'StatisticalAnalysisProjectUsagePanel',
})

const props = defineProps<{
    items: ProjectUsageItem[]
}>()

type TrendTone = 'down' | 'up'

interface FeaturedProjectItem extends ProjectUsageItem {
    shortName: string
    trend: string
    trendTone: TrendTone
}

const trendMocks = [
    { trend: '+12.4%', trendTone: 'up' },
    { trend: '-8.2%', trendTone: 'down' },
    { trend: '+22.1%', trendTone: 'up' },
    { trend: '+15.8%', trendTone: 'up' },
    { trend: '-3.4%', trendTone: 'down' },
    { trend: '+9.6%', trendTone: 'up' },
    { trend: '-5.1%', trendTone: 'down' },
    { trend: '+4.7%', trendTone: 'up' },
] satisfies Array<{
    trend: string
    trendTone: TrendTone
}>

const featuredProjects = computed<FeaturedProjectItem[]>(() => props.items.slice(0, 6).map((item, index) => {
    const trend = trendMocks[index] ?? {
        trend: '+0.0%',
        trendTone: 'up' as const,
    }

    return {
        ...item,
        shortName: getProjectShortName(item.label),
        trend: trend.trend,
        trendTone: trend.trendTone,
    }
}))

function getTrendIcon(tone: TrendTone) {
    return tone === 'down' ? 'lucide:trending-down' : 'lucide:trending-up'
}

function getTrendIconClass(tone: TrendTone) {
    return tone === 'down' ? 'size-3 text-red-500' : 'size-3 text-emerald-600 dark:text-emerald-400'
}

function getTrendTextClass(tone: TrendTone) {
    return tone === 'down'
        ? 'text-sm font-medium text-red-500 tabular-nums'
        : 'text-sm font-medium text-emerald-600 dark:text-emerald-400 tabular-nums'
}

function getProjectShortName(label: string) {
    return label
        .split(/[-_\s]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0]?.toUpperCase() ?? '')
        .join('')
}
</script>
