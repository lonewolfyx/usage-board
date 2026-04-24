<template>
    <StatisticalAnalysisPanel compact :icon="icon" :title="name">
        <div class="flex justify-between items-center">
            <ValueTooltip :content="detail">
                <span
                    :class="cn(
                        'text-2xl font-bold tracking-tight',
                    )"
                >
                    {{ value }}
                </span>
            </ValueTooltip>
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
import { cn } from '~/lib/utils'

defineOptions({
    name: 'StatisticalAnalysisTotalCard',
})

const props = withDefaults(defineProps<{
    detail?: string
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
