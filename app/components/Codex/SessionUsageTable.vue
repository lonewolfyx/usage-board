<template>
    <StatisticalAnalysisPanel
        description="Each row maps one Codex jsonl file to its session-level token consumption."
        icon="lucide:file-json-2"
        title="Codex Session Statistics"
    >
        <div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div class="rounded-md border px-3 py-2">
                <p class="text-xs text-muted-foreground">
                    Sessions
                </p>
                <p class="mt-1 text-lg font-semibold tabular-nums">
                    {{ items.length }}
                </p>
            </div>
            <div class="rounded-md border px-3 py-2">
                <p class="text-xs text-muted-foreground">
                    Tokens
                </p>
                <p class="mt-1 text-lg font-semibold tabular-nums">
                    {{ formatCompactNumber(totalTokens) }}
                </p>
            </div>
            <div class="rounded-md border px-3 py-2">
                <p class="text-xs text-muted-foreground">
                    Spend
                </p>
                <p class="mt-1 text-lg font-semibold tabular-nums">
                    {{ formatCurrency(totalCost) }}
                </p>
            </div>
        </div>

        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Session ID</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Thread</TableHead>
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
                        Total Tokens
                    </TableHead>
                    <TableHead class="text-right">
                        Cost
                    </TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                <TableRow v-for="session in paginatedItems" :key="session.sessionId">
                    <TableCell class="max-w-80 truncate font-mono text-xs">
                        {{ session.sessionId }}
                    </TableCell>
                    <TableCell class="font-medium">
                        {{ session.project }}
                    </TableCell>
                    <TableCell class="max-w-64 truncate">
                        {{ session.threadName }}
                    </TableCell>
                    <TableCell>{{ session.model }}</TableCell>
                    <TableCell class="whitespace-nowrap">
                        {{ formatDateTime(session.startedAt) }}
                    </TableCell>
                    <TableCell class="text-right tabular-nums">
                        {{ session.duration }}
                    </TableCell>
                    <TableCell class="text-right tabular-nums">
                        {{ formatNumber(session.inputTokens) }}
                    </TableCell>
                    <TableCell class="text-right tabular-nums">
                        {{ formatNumber(session.outputTokens) }}
                    </TableCell>
                    <TableCell class="text-right tabular-nums">
                        {{ formatNumber(session.tokenTotal) }}
                    </TableCell>
                    <TableCell class="text-right tabular-nums">
                        {{ formatCurrency(session.costUSD) }}
                    </TableCell>
                </TableRow>
                <TableEmpty v-if="items.length === 0" :colspan="10">
                    No Codex sessions found.
                </TableEmpty>
            </TableBody>
        </Table>

        <CodexPaginationFooter
            v-model:page="page"
            :page-count="pageCount"
            :page-size="pageSize"
            :total="items.length"
        />
    </StatisticalAnalysisPanel>
</template>

<script setup lang="ts">
import { formatNumber } from '@lonewolfyx/utils'
import { computed, shallowRef } from 'vue'
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCompactNumber, formatCurrency } from '~/composables/useUsageDashboard'
import CodexPaginationFooter from './PaginationFooter.vue'

defineOptions({
    name: 'CodexSessionUsageTable',
})

const props = withDefaults(defineProps<{
    items: CodexSessionUsageItem[]
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
const totalCost = computed(() => props.items.reduce((sum, session) => sum + session.costUSD, 0))
const totalTokens = computed(() => props.items.reduce((sum, session) => sum + session.tokenTotal, 0))

function formatDateTime(value: string) {
    return new Intl.DateTimeFormat('en-US', {
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        month: 'short',
    }).format(new Date(value))
}
</script>
