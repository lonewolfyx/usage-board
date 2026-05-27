<template>
    <StatisticalAnalysisPanel
        :description="`Each row maps one ${productName} session to its session-level token consumption.`"
        icon="lucide:file-json-2"
        :title="`${productName} Session Statistics`"
    >
        <p v-if="errorMessage" class="text-xs text-destructive">
            {{ errorMessage }}
        </p>

        <template v-else-if="loading">
            <div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Skeleton class="h-20 w-full rounded-md" />
                <Skeleton class="h-20 w-full rounded-md" />
                <Skeleton class="h-20 w-full rounded-md" />
            </div>
            <Skeleton class="h-72 w-full rounded-md" />
        </template>

        <template v-else>
            <div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div class="rounded-md border px-3 py-2">
                    <p class="text-xs text-muted-foreground">
                        Sessions
                    </p>
                    <p class="mt-1 text-lg font-semibold tabular-nums">
                        {{ totalRows }}
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

            <p v-if="tableError" class="mb-3 text-xs text-destructive">
                {{ tableError.message }}
            </p>
            <DataTable
                :columns="columns"
                :data="pageData.items"
                :empty-text="`No ${productName} sessions found.`"
                :pagination="pageData.pagination"
                @page-change="setPage"
            />
        </template>
    </StatisticalAnalysisPanel>
</template>

<script setup lang="ts">
import type { AnalysisAgentSessionRow } from '#shared/types/analysis'
import type { FetchPage, PaginatedResponse } from '#shared/types/pagination'
import type { ColumnDef } from '@tanstack/vue-table'
import { DEFAULT_PAGE_SIZE } from '#shared/types/pagination'
import { formatNumber } from '@lonewolfyx/utils'

defineOptions({
    name: 'UsageAnalyticsSessionUsageTable',
})

const props = withDefaults(defineProps<{
    errorMessage?: string
    fetchPage?: FetchPage<AnalysisAgentSessionRow>
    items: AnalysisAgentSessionRow[]
    loading?: boolean
    pagination?: PaginatedResponse<AnalysisAgentSessionRow>['pagination']
    productName?: string
}>(), {
    productName: 'Product',
})

const initialPage = computed<PaginatedResponse<AnalysisAgentSessionRow>>(() => ({
    items: props.items,
    pagination: props.pagination ?? {
        page: 1,
        pageCount: Math.max(1, Math.ceil(props.items.length / DEFAULT_PAGE_SIZE)),
        pageSize: DEFAULT_PAGE_SIZE,
        total: props.items.length,
    },
}))
const { error: tableError, pageData, setPage } = usePaginatedTable(initialPage, props.fetchPage)
const columns: ColumnDef<AnalysisAgentSessionRow>[] = [
    {
        accessorKey: 'sessionId',
        cell: ({ row }) => row.original.sessionId,
        header: 'Session ID',
        meta: { class: 'max-w-80 truncate font-mono text-xs' },
    },
    {
        accessorKey: 'project',
        header: 'Project',
        meta: { class: 'font-medium' },
    },
    {
        accessorKey: 'threadName',
        header: 'Thread',
        meta: { class: 'max-w-64 truncate' },
    },
    {
        accessorKey: 'model',
        header: 'Model',
    },
    {
        accessorKey: 'startedAt',
        cell: ({ row }) => formatDateTime(row.original.startedAt),
        header: 'Started',
        meta: { class: 'whitespace-nowrap' },
    },
    {
        accessorKey: 'duration',
        header: 'Duration',
        meta: { class: 'text-right tabular-nums' },
    },
    {
        accessorKey: 'inputTokens',
        cell: ({ row }) => formatNumber(row.original.inputTokens),
        header: 'Input',
        meta: { class: 'text-right tabular-nums' },
    },
    {
        accessorKey: 'outputTokens',
        cell: ({ row }) => formatNumber(row.original.outputTokens),
        header: 'Output',
        meta: { class: 'text-right tabular-nums' },
    },
    {
        accessorKey: 'tokenTotal',
        cell: ({ row }) => formatNumber(row.original.tokenTotal),
        header: 'Total Tokens',
        meta: { class: 'text-right tabular-nums' },
    },
    {
        accessorKey: 'costUSD',
        cell: ({ row }) => formatCurrency(row.original.costUSD),
        header: 'Cost',
        meta: { class: 'text-right tabular-nums' },
    },
]
const totalCost = computed(() => pageData.value.items.reduce((sum, session) => sum + session.costUSD, 0))
const totalTokens = computed(() => pageData.value.items.reduce((sum, session) => sum + session.tokenTotal, 0))
const totalRows = computed(() => pageData.value.pagination.total)

watch(() => props.fetchPage, (fetchPage) => {
    if (fetchPage && pageData.value.pagination.page !== 1) {
        void setPage(1)
    }
})

function formatDateTime(value: string) {
    return new Intl.DateTimeFormat('en-US', {
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        month: 'short',
    }).format(new Date(value))
}
</script>
