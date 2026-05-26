<template>
    <StatisticalAnalysisPanel :icon="icon" :title="name" compact>
        <div class="flex justify-between items-center">
            <div class="flex items-end gap-2 min-w-0">
                <ValueTooltip :content="detail">
                    <span
                        :class="cn(
                            'text-2xl font-bold tracking-tight',
                        )"
                    >
                        {{ value }}
                    </span>
                </ValueTooltip>
                <div v-if="subvalue?.items.length" class="flex gap-1 truncate text-xs text-muted-foreground">
                    <template
                        v-for="(item, index) in subvalue.items"
                        :key="`${item.label ?? 'value'}-${item.value}`"
                    >
                        <div
                            :class="cn(
                                'flex gap-0.5',
                                { 'text-amber-500': item.label === 'In' },
                                { 'text-emerald-600': item.label === 'Out' },
                            )"
                        >
                            <span>{{ item.label }} </span>
                            <span>{{ item.value }}</span>
                        </div>
                        <span v-if="index < subvalue.items.length - 1">{{ subvalue.separator ?? ' / ' }}</span>
                    </template>
                </div>
            </div>
            <div class="flex items-center gap-1">
                <Icon :class="trendMeta.iconClass" :name="trendMeta.icon" mode="svg" />
                <span :class="trendMeta.textClass">
                    {{ trend }}
                </span>
            </div>
        </div>
    </StatisticalAnalysisPanel>
</template>

<script lang="ts" setup>
import { cn } from '~/lib/utils'

defineOptions({
    name: 'StatisticalAnalysisTotalCard',
})

const props = withDefaults(defineProps<{
    detail?: string
    name: string
    subvalue?: UsageOverviewCardSubvalue
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
