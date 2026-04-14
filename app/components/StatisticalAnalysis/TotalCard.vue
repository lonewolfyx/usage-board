<template>
    <div class="rounded-xl border bg-card p-4 flex flex-col justify-between gap-3">
        <div class="flex items-center justify-between">
            <span
                :class="cn(
                    'text-xs font-medium text-muted-foreground uppercase tracking-wide',
                )"
            >{{ name }}</span>
            <div class="size-7 rounded-lg flex items-center justify-center bg-primary/8">
                <Icon mode="svg" :name="icon" />
            </div>
        </div>
        <div class="flex justify-between items-center">
            <span class="text-2xl font-bold tracking-tight">${{ number }}</span>
            <div class="flex items-center gap-1">
                <Icon class="size-3 text-emerald-500" mode="svg" name="lucide:trending-up" />
                <span class="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    +12.4% vs last month
                </span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { cn } from '~/lib/utils'

defineOptions({
    name: 'StatisticalAnalysisTotalCard',
})

defineProps<{
    name: string
    number: number
    icon: string
}>()
</script>

<style scoped>

</style>
