<template>
    <div class="space-y-1.5 text-xs">
        <p class="text-sm font-semibold flex items-center gap-1.5">
            <Icon :name="event.icon" class="w-4 h-4" />
            {{ event.label }}
        </p>

        <div class="space-y-1">
            <div class="flex justify-between text-muted">
                <span>Input</span>
                <span>{{ formatNumber(event.inputTokens) }}</span>
            </div>
            <div class="flex justify-between text-muted">
                <span>Output</span>
                <span>{{ formatNumber(event.outputTokens) }}</span>
            </div>
            <div class="flex justify-between text-muted">
                <span>Reasoning</span>
                <span>{{ formatNumber(event.reasoningOutputTokens) }}</span>
            </div>
            <div class="flex justify-between text-muted">
                <span>Cache Read</span>
                <span>{{ formatNumber(event.cachedInputTokens) }}</span>
            </div>
        </div>

        <Separator />
        <div class="flex justify-between text-muted">
            <span>Total Tokens</span>
            <span>{{ formatNumber(event.totalTokens) }}</span>
        </div>
        <div class="flex justify-between text-muted">
            <span>Cost</span>
            <span>{{ formatCurrency(event.costUSD) }}</span>
        </div>

        <template v-if="Object.keys(event.models).length > 1">
            <Separator class="" />
            <p class="text-muted font-medium">
                Models
            </p>
            <div class="space-y-1">
                <div v-for="(data, model) in event.models" :key="model" class="flex justify-between gap-2">
                    <span class="text-muted truncate capitalize">{{ model }}</span>
                    <span>{{ formatNumber(data.tokens) }}</span>
                </div>
            </div>
        </template>
    </div>
</template>

<script setup lang="ts">
import type { CalendarCellEvent } from '#shared/types/calendar'
import { formatNumber } from '@lonewolfyx/utils'

defineProps<{ event: CalendarCellEvent }>()
</script>
