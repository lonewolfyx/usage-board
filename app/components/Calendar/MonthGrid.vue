<template>
    <div class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="grid grid-cols-7 border-b border-border bg-muted/50">
            <div
                v-for="d in WEEK_HEADERS"
                :key="d"
                class="px-2 py-2.5 text-center text-xs font-medium text-muted-foreground"
            >
                {{ d }}
            </div>
        </div>
        <div class="grid grid-cols-7">
            <CalendarDayCell
                v-for="(cell, idx) in cells"
                :key="cell.dateKey || idx"
                :cell="cell"
                :is-last-in-row="idx % 7 === 6"
                :is-last-row="idx >= cells.length - 7"
            />
        </div>
    </div>
</template>

<script setup lang="ts">
import type { CalendarCell } from '#shared/types/calendar'

defineProps<{ cells: CalendarCell[] }>()

const WEEK_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
</script>
