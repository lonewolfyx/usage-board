<template>
    <StatisticalAnalysisPanel compact :icon="icon" :title="name">
        <div class="flex justify-between items-center">
            <span class="text-2xl font-bold tracking-tight">{{ value }}</span>
            <div class="flex items-center gap-1">
                <Icon :class="trendMeta.iconClass" mode="svg" :name="trendMeta.icon" />
                <span :class="trendMeta.textClass">
                    {{ trend }}
                </span>
            </div>
        </div>
    </StatisticalAnalysisPanel>
</template>

<script setup lang="ts">
import { computed } from 'vue'

defineOptions({
    name: 'StatisticalAnalysisTotalCard',
})

const props = withDefaults(defineProps<{
    name: string
    value: string
    icon: string
    trend: string
    trendTone?: TrendTone
}>(), {
    trendTone: 'neutral',
})

const trendMeta = computed(() => {
    if (props.trendTone === 'down') {
        return {
            icon: 'lucide:trending-down',
            iconClass: 'size-3 text-red-500',
            textClass: 'text-xs font-medium text-red-500',
        }
    }

    if (props.trendTone === 'up') {
        return {
            icon: 'lucide:trending-up',
            iconClass: 'size-3 text-emerald-500',
            textClass: 'text-xs font-medium text-emerald-600 dark:text-emerald-400',
        }
    }

    return {
        icon: 'lucide:minus',
        iconClass: 'size-3 text-muted-foreground',
        textClass: 'text-xs font-medium text-muted-foreground',
    }
})
</script>
