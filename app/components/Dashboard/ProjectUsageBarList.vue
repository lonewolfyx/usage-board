<template>
    <div class="space-y-4">
        <div v-for="item in items" :key="item.label" class="space-y-2">
            <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                    <p class="truncate text-sm font-medium" translate="no">
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
                    class="h-full rounded-full"
                    :class="item.colorClass"
                    :style="{ width: `${Math.max(item.percent, item.percent > 0 ? 4 : 0)}%` }"
                />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
defineProps<{
    items: Array<{
        colorClass: string
        detail: string
        label: string
        percent: number
        value: string
    }>
}>()
</script>
