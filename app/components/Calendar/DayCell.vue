<template>
    <div
        class="border-b border-r border-border min-h-24 p-1.5 transition-colors"
        :class="cn(
            cell.isCurrentMonth ? 'bg-card hover:bg-accent/30' : 'bg-muted/20 text-muted-foreground',
            isLastInRow && 'border-r-0',
            isLastRow && 'border-b-0',
        )"
    >
        <div class="flex items-center justify-between mb-1">
            <span
                class="text-xs font-medium leading-none"
                :class="cn(
                    cell.isToday && 'bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center',
                )"
            >{{ cell.day }}</span>
            <span v-if="cell.totalTokens > 0" class="text-[10px] text-muted-foreground">
                {{ formatCompactNumber(cell.totalTokens) }}
            </span>
        </div>

        <div class="flex flex-col gap-1">
            <TooltipProvider>
                <Tooltip v-for="event in cell.events" :key="event.platform">
                    <TooltipTrigger as-child>
                        <div
                            :class="cn(
                                'flex items-center justify-between',
                                'px-1.5 py-1',
                                'text-xs truncate',
                                'rounded-r',
                            )"
                            :style="{
                                borderLeft: `3px solid ${event.color}`,
                                backgroundColor: platformBg(event.color),
                            }"
                        >
                            <span class="flex items-center gap-1 truncate">
                                <Icon :name="event.icon" class="w-3 h-3 shrink-0" />
                                <span class="font-extralight font-mono truncate">{{ event.label }}</span>
                            </span>
                            <span class="text-muted-foreground shrink-0 ml-1">{{ formatCompactNumber(event.totalTokens) }}</span>
                        </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" class="w-72">
                        <CalendarDayTooltip :event="event" />
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        </div>
    </div>
</template>

<script setup lang="ts">
import type { CalendarCell } from '#shared/types/calendar'
import { cn } from '~/lib/utils'

defineProps<{
    cell: CalendarCell
    isLastInRow: boolean
    isLastRow: boolean
}>()

// color-mix keeps the tint legible on both light & dark backgrounds — a flat low
// alpha (e.g. color+'15') makes near-black platform colors like codex #111827 invisible.
function platformBg(color: string) {
    return `color-mix(in srgb, ${color} 16%, transparent)`
}
</script>
