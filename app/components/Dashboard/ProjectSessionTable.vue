<template>
    <div>
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Session</TableHead>
                    <TableHead>Tool</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead class="text-right">
                        Duration
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
                        Tokens
                    </TableHead>
                    <TableHead class="text-right">
                        Cost
                    </TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                <TableRow v-for="item in paginatedItems" :key="item.id">
                    <TableCell class="max-w-72 truncate font-medium">
                        {{ item.title }}
                    </TableCell>
                    <TableCell>
                        <div class="flex items-center gap-2">
                            <IconAi :name="getProjectPlatformIcon(item.platform)" />
                            <span>{{ getProjectPlatformLabel(item.platform) }}</span>
                        </div>
                    </TableCell>
                    <TableCell class="max-w-56 truncate" translate="no">
                        {{ item.model }}
                    </TableCell>
                    <TableCell class="whitespace-nowrap">
                        {{ item.startedAt }}
                    </TableCell>
                    <TableCell class="text-right tabular-nums">
                        {{ item.duration }}
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
                <TableEmpty v-if="items.length === 0" :colspan="11">
                    No sessions found.
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
import type { ProjectSessionTableRow } from '#shared/types/project-dashboard'
import { getProjectPlatformIcon, getProjectPlatformLabel } from '#shared/utils/project-dashboard'

const props = withDefaults(defineProps<{
    items: ProjectSessionTableRow[]
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
