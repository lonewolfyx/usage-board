<template>
    <div class="space-y-4">
        <div v-for="item in items" :key="item.label" class="space-y-2">
            <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                    <p class="truncate text-sm font-medium">
                        {{ item.label }}
                    </p>
                    <p class="truncate text-xs text-muted-foreground">
                        {{ item.detail }}
                    </p>
                </div>
                <span class="shrink-0 text-sm font-semibold tabular-nums">{{ item.value }}</span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-secondary">
                <div
                    class="h-full rounded-full transition-[width]"
                    :class="getToneClass(item.tone)"
                    :style="{ width: getItemWidth(item) }"
                />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import type { RankedUsageItem } from '~/composables/useUsageDashboard'

defineOptions({
    name: 'StatisticalAnalysisUsageBarList',
})

defineProps<{
    items: RankedUsageItem[]
}>()

function getToneClass(tone: RankedUsageItem['tone']) {
    switch (tone) {
        case 'green':
            return 'bg-emerald-500'
        case 'amber':
            return 'bg-amber-500'
        case 'sky':
            return 'bg-sky-500'
        case 'rose':
            return 'bg-rose-500'
        default:
            return 'bg-primary'
    }
}

function getItemWidth(item: RankedUsageItem) {
    return `${Math.max(item.percent, item.percent > 0 ? 3 : 0)}%`
}
</script>
