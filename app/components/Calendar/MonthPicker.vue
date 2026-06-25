<template>
    <div class="p-3 w-[260px]">
        <div class="flex items-center justify-between mb-3">
            <Button variant="ghost" size="icon-sm" @click="changeYear(-1)">
                <Icon name="lucide:chevron-left" class="size-4" />
            </Button>
            <span class="text-sm font-medium">{{ selectedYear }}</span>
            <Button variant="ghost" size="icon-sm" @click="changeYear(1)">
                <Icon name="lucide:chevron-right" class="size-4" />
            </Button>
        </div>
        <div class="grid grid-cols-4 gap-1">
            <Button
                v-for="(label, m) in MONTH_LABELS"
                :key="m"
                variant="ghost"
                size="sm"
                :class="monthClass(m)"
                @click="pickMonth(m)"
            >
                {{ label }}
            </Button>
        </div>
    </div>
</template>

<script setup lang="ts">
const props = defineProps<{ modelValue: string, availableMonths: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const selectedYear = ref(Number(props.modelValue.split('-')[0]))
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
const availableSet = computed(() => new Set(props.availableMonths))

// Keep the picker's displayed year in sync when the parent navigates across a year boundary.
watch(() => props.modelValue, (value) => {
    selectedYear.value = Number(value.split('-')[0])
})

function monthKey(m: number) {
    return `${selectedYear.value}-${String(m + 1).padStart(2, '0')}`
}

// No-data months are dimmed but still selectable — the parent re-fetches regardless.
function monthClass(m: number) {
    if (monthKey(m) === props.modelValue) {
        return 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'
    }
    if (!availableSet.value.has(monthKey(m))) {
        return 'text-muted-foreground/40'
    }
    return ''
}

function pickMonth(m: number) {
    emit('update:modelValue', monthKey(m))
}

function changeYear(delta: number) {
    selectedYear.value += delta
}
</script>
