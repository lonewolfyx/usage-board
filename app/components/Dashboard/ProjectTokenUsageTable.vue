<template>
    <div>
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Models</TableHead>
                    <TableHead class="text-right">
                        Sessions
                    </TableHead>
                    <TableHead class="text-right">
                        Input
                    </TableHead>
                    <TableHead class="text-right">
                        Output
                    </TableHead>
                    <TableHead class="text-right">
                        Reasoning
                    </TableHead>
                    <TableHead class="text-right">
                        Cache Read
                    </TableHead>
                    <TableHead class="text-right">
                        Total Tokens
                    </TableHead>
                    <TableHead class="text-right">
                        Cost
                    </TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                <TableRow v-for="item in paginatedItems" :key="item.label">
                    <TableCell class="max-w-72 truncate font-medium">
                        {{ item.label }}
                    </TableCell>
                    <TableCell class="max-w-56 truncate" translate="no">
                        {{ item.models }}
                    </TableCell>
                    <TableCell class="text-right tabular-nums">
                        {{ item.sessions }}
                    </TableCell>
                    <TableCell class="text-right tabular-nums">
                        {{ item.inputTokens }}
                    </TableCell>
                    <TableCell class="text-right tabular-nums">
                        {{ item.outputTokens }}
                    </TableCell>
                    <TableCell class="text-right tabular-nums">
                        {{ item.reasoningTokens }}
                    </TableCell>
                    <TableCell class="text-right tabular-nums">
                        {{ item.cacheTokens }}
                    </TableCell>
                    <TableCell class="text-right tabular-nums">
                        {{ item.tokens }}
                    </TableCell>
                    <TableCell class="text-right tabular-nums">
                        {{ item.cost }}
                    </TableCell>
                </TableRow>
                <TableEmpty v-if="items.length === 0" :colspan="9">
                    No token usage found.
                </TableEmpty>
            </TableBody>
        </Table>

        <UsageAnalyticsPaginationFooter
            v-if="items.length > pageSize"
            v-model:page="page"
            :page-count="pageCount"
            :page-size="pageSize"
            :total="items.length"
        />
    </div>
</template>

<script setup lang="ts">
import type { ProjectTokenUsageRow } from '#shared/types/project-dashboard'

const props = withDefaults(defineProps<{
    items: ProjectTokenUsageRow[]
    pageSize?: number
}>(), {
    pageSize: 10,
})

const page = shallowRef(1)
const pageCount = computed(() => Math.max(1, Math.ceil(props.items.length / props.pageSize)))
const paginatedItems = computed(() => {
    const safePage = Math.min(page.value, pageCount.value)
    const start = (safePage - 1) * props.pageSize

    return props.items.slice(start, start + props.pageSize)
})

watch(() => props.items, () => {
    page.value = 1
})
</script>
