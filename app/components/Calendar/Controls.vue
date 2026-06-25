<template>
    <div class="flex items-center gap-2">
        <Button variant="outline" size="icon" @click="$emit('prev')">
            <Icon name="lucide:chevron-left" />
        </Button>
        <Popover>
            <PopoverTrigger as-child>
                <Button variant="outline" class="min-w-[170px]">
                    <Icon name="lucide:calendar" class="mr-2 size-4" />
                    {{ formattedMonth }}
                </Button>
            </PopoverTrigger>
            <PopoverContent class="w-auto p-0">
                <CalendarMonthPicker
                    :model-value="selectedMonth"
                    :available-months="availableMonths"
                    @update:model-value="$emit('select', $event)"
                />
            </PopoverContent>
        </Popover>
        <Button variant="outline" size="icon" @click="$emit('next')">
            <Icon name="lucide:chevron-right" />
        </Button>
        <Button variant="ghost" size="sm" @click="$emit('today')">
            Today
        </Button>

        <slot name="filter" />
    </div>
</template>

<script setup lang="ts">
import { useDateFormat } from '#shared/utils/date'

const props = defineProps<{ selectedMonth: string, availableMonths: string[] }>()
defineEmits<{ prev: [], next: [], today: [], select: [month: string] }>()

const formattedMonth = computed(() => useDateFormat(`${props.selectedMonth}-01`, 'month-label') ?? props.selectedMonth)
</script>
