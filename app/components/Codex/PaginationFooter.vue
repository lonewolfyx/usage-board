<template>
    <div class="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p class="text-sm text-muted-foreground">
            {{ rangeLabel }}
        </p>
        <div class="flex items-center justify-end gap-2">
            <Button
                :disabled="page <= 1"
                size="sm"
                variant="outline"
                @click="emit('update:page', page - 1)"
            >
                Previous
            </Button>
            <div class="flex items-center gap-1">
                <Button
                    v-for="pageNumber in visiblePages"
                    :key="pageNumber"
                    :variant="pageNumber === page ? 'default' : 'ghost'"
                    class="tabular-nums"
                    size="icon-sm"
                    @click="emit('update:page', pageNumber)"
                >
                    {{ pageNumber }}
                </Button>
            </div>
            <Button
                :disabled="page >= pageCount"
                size="sm"
                variant="outline"
                @click="emit('update:page', page + 1)"
            >
                Next
            </Button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Button } from '@/components/ui/button'

defineOptions({
    name: 'CodexPaginationFooter',
})

const props = defineProps<{
    page: number
    pageCount: number
    pageSize: number
    total: number
}>()

const emit = defineEmits<{
    'update:page': [page: number]
}>()

const visiblePages = computed(() => {
    const start = Math.max(1, props.page - 2)
    const end = Math.min(props.pageCount, start + 4)
    const adjustedStart = Math.max(1, end - 4)

    return Array.from({ length: end - adjustedStart + 1 }, (_, index) => adjustedStart + index)
})

const rangeLabel = computed(() => {
    if (props.total === 0) {
        return 'No records'
    }

    const start = (props.page - 1) * props.pageSize + 1
    const end = Math.min(props.page * props.pageSize, props.total)

    return `${start}-${end} of ${props.total}`
})
</script>
