<template>
    <StatisticalAnalysisPanel
        description="Daily model activity by token type, cache reads, total usage, and cost"
        icon="lucide:calendar-days"
        title="Daily Token Usage"
    >
        <p v-if="tableError" class="mb-3 text-xs text-destructive">
            {{ tableError.message }}
        </p>
        <DataTable
            :columns="columns"
            :data="pageData.items"
            empty-text="No daily token usage found."
            :pagination="pageData.pagination"
            @page-change="setPage"
        />
    </StatisticalAnalysisPanel>
</template>

<script lang="ts" setup>
import type { AnalysisDailyTokenRow } from '#shared/types/analysis'
import type { FetchPage, PaginatedResponse } from '#shared/types/pagination'
import type { ColumnDef } from '@tanstack/vue-table'
import { DEFAULT_PAGE_SIZE } from '#shared/types/pagination'
import { formatNumber } from '@lonewolfyx/utils'

defineOptions({
    name: 'StatisticalAnalysisTokensUsagePanel',
})

const props = defineProps<{
    fetchPage?: FetchPage<AnalysisDailyTokenRow>
    items: AnalysisDailyTokenRow[]
    pagination?: PaginatedResponse<AnalysisDailyTokenRow>['pagination']
}>()

const initialPage = computed<PaginatedResponse<AnalysisDailyTokenRow>>(() => ({
    items: props.items,
    pagination: props.pagination ?? {
        page: 1,
        pageCount: Math.max(1, Math.ceil(props.items.length / DEFAULT_PAGE_SIZE)),
        pageSize: DEFAULT_PAGE_SIZE,
        total: props.items.length,
    },
}))
const { error: tableError, pageData, setPage } = usePaginatedTable(initialPage, props.fetchPage)
const columns: ColumnDef<AnalysisDailyTokenRow>[] = [
    {
        accessorKey: 'date',
        header: 'Date',
        meta: { class: 'font-medium' },
    },
    {
        accessorKey: 'models',
        cell: ({ row }) => row.original.models.join(', '),
        header: 'Models',
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
        accessorKey: 'reasoningOutputTokens',
        cell: ({ row }) => formatNumber(row.original.reasoningOutputTokens),
        header: 'Reasoning',
        meta: { class: 'text-right tabular-nums' },
    },
    {
        accessorKey: 'cachedInputTokens',
        cell: ({ row }) => formatNumber(row.original.cachedInputTokens),
        header: 'Cache Read',
        meta: { class: 'text-right tabular-nums' },
    },
    {
        accessorKey: 'totalTokens',
        cell: ({ row }) => formatNumber(row.original.totalTokens),
        header: 'Total Tokens',
        meta: { class: 'text-right tabular-nums' },
    },
    {
        accessorKey: 'costUSD',
        cell: ({ row }) => formatCurrency(row.original.costUSD),
        header: 'Cost (USD)',
        meta: { class: 'text-right tabular-nums' },
    },
]
</script>
