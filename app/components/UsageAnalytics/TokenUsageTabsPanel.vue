<template>
    <StatisticalAnalysisPanel
        :description="`Browse ${productName} token consumption by day, week, month, or session.`"
        icon="lucide:table-2"
        :title="`${productName} Token Usage`"
    >
        <p v-if="errorMessage" class="text-xs text-destructive">
            {{ errorMessage }}
        </p>

        <template v-else-if="loading">
            <Skeleton class="h-10 w-64 rounded-md" />
            <Skeleton class="mt-4 h-72 w-full rounded-md" />
        </template>

        <template v-else>
            <Tabs v-model="activeTab">
                <TabsList class="grid w-full grid-cols-4 sm:w-fit">
                    <TabsTrigger
                        v-for="tab in tabs"
                        :key="tab.value"
                        :value="tab.value"
                    >
                        {{ tab.label }}
                    </TabsTrigger>
                </TabsList>

                <TabsContent
                    v-for="tab in tabs"
                    :key="tab.value"
                    class="mt-4"
                    :value="tab.value"
                >
                    <p v-if="tableError" class="mb-3 text-xs text-destructive">
                        {{ tableError.message }}
                    </p>
                    <DataTable
                        :columns="columnsByTab[tab.value]"
                        :data="tabState[tab.value].items"
                        :empty-text="`No ${productName} token usage found.`"
                        :pagination="tabState[tab.value].pagination"
                        @page-change="page => setPage(tab.value, page)"
                    />
                </TabsContent>
            </Tabs>
        </template>
    </StatisticalAnalysisPanel>
</template>

<script setup lang="ts">
import type { FetchPage, PaginatedResponse } from '#shared/types/pagination'
import type { ColumnDef } from '@tanstack/vue-table'
import { DEFAULT_PAGE_SIZE } from '#shared/types/pagination'
import { formatNumber } from '@lonewolfyx/utils'

defineOptions({
    name: 'UsageAnalyticsTokenUsageTabsPanel',
})

const props = withDefaults(defineProps<{
    dailyItems: UsageAnalyticsTokenUsageRow[]
    errorMessage?: string
    fetchPage?: (tab: TokenTabValue, page: number) => ReturnType<FetchPage<UsageAnalyticsTokenUsageRow>>
    loading?: boolean
    weeklyItems: UsageAnalyticsTokenUsageRow[]
    monthlyItems: UsageAnalyticsTokenUsageRow[]
    sessionItems: UsageAnalyticsTokenUsageRow[]
    dailyPagination?: PaginatedResponse<UsageAnalyticsTokenUsageRow>['pagination']
    weeklyPagination?: PaginatedResponse<UsageAnalyticsTokenUsageRow>['pagination']
    monthlyPagination?: PaginatedResponse<UsageAnalyticsTokenUsageRow>['pagination']
    sessionPagination?: PaginatedResponse<UsageAnalyticsTokenUsageRow>['pagination']
    productName?: string
}>(), {
    productName: 'Product',
})

const activeTab = shallowRef<TokenTabValue>('day')
const tableError = shallowRef<Error | null>(null)

const tabs: TokenTab[] = [
    { heading: 'Date', label: 'Day', value: 'day' },
    { heading: 'Week', label: 'Week', value: 'week' },
    { heading: 'Month', label: 'Month', value: 'month' },
    { heading: 'Session ID', label: 'Session', value: 'session' },
]

const itemsByTab = computed<Record<TokenTabValue, UsageAnalyticsTokenUsageRow[]>>(() => ({
    day: props.dailyItems,
    month: props.monthlyItems,
    session: props.sessionItems,
    week: props.weeklyItems,
}))
const paginationByTab = computed<Record<TokenTabValue, PaginatedResponse<UsageAnalyticsTokenUsageRow>['pagination']>>(() => ({
    day: props.dailyPagination ?? buildLocalPagination(props.dailyItems),
    month: props.monthlyPagination ?? buildLocalPagination(props.monthlyItems),
    session: props.sessionPagination ?? buildLocalPagination(props.sessionItems),
    week: props.weeklyPagination ?? buildLocalPagination(props.weeklyItems),
}))
const pageDataByTab = shallowReactive<Record<TokenTabValue, PaginatedResponse<UsageAnalyticsTokenUsageRow>>>({
    day: {
        items: [],
        pagination: buildLocalPagination([]),
    },
    month: {
        items: [],
        pagination: buildLocalPagination([]),
    },
    session: {
        items: [],
        pagination: buildLocalPagination([]),
    },
    week: {
        items: [],
        pagination: buildLocalPagination([]),
    },
})

watch([itemsByTab, paginationByTab], () => {
    for (const tab of tabs) {
        pageDataByTab[tab.value] = {
            items: itemsByTab.value[tab.value],
            pagination: paginationByTab.value[tab.value],
        }
    }
}, {
    immediate: true,
})

const tabState = computed<Record<TokenTabValue, TokenTabState>>(() => Object.fromEntries(tabs.map((tab) => {
    const { items, pagination } = pageDataByTab[tab.value]

    return [tab.value, {
        items,
        page: pagination.page,
        pageCount: pagination.pageCount,
        pagination,
    }]
})) as Record<TokenTabValue, TokenTabState>)

const baseColumns: ColumnDef<UsageAnalyticsTokenUsageRow>[] = [
    {
        accessorKey: 'models',
        cell: ({ row }) => formatList(row.original.models),
        header: 'Models',
    },
    {
        accessorKey: 'projects',
        cell: ({ row }) => formatList(row.original.projects),
        header: 'Projects',
        meta: { class: 'max-w-56 truncate' },
    },
    {
        accessorKey: 'sessionCount',
        header: 'Sessions',
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
        header: 'Cost',
        meta: { class: 'text-right tabular-nums' },
    },
]
const columnsByTab = computed<Record<TokenTabValue, ColumnDef<UsageAnalyticsTokenUsageRow>[]>>(() => Object.fromEntries(tabs.map(tab => [
    tab.value,
    [
        {
            accessorKey: 'label',
            cell: ({ row }) => row.original.label,
            header: tab.heading,
            meta: { class: 'max-w-72 truncate font-medium' },
        },
        ...baseColumns,
    ],
])) as Record<TokenTabValue, ColumnDef<UsageAnalyticsTokenUsageRow>[]>)

async function setPage(tab: TokenTabValue, page: number) {
    if (!props.fetchPage || page === pageDataByTab[tab].pagination.page) {
        return
    }

    tableError.value = null

    try {
        pageDataByTab[tab] = await props.fetchPage(tab, page)
    }
    catch (error) {
        tableError.value = error instanceof Error ? error : new Error('Failed to load token usage page.')
    }
}

function formatList(items: string[]) {
    return items.length > 0 ? items.join(', ') : 'None'
}

function buildLocalPagination(items: unknown[]) {
    return {
        page: 1,
        pageCount: Math.max(1, Math.ceil(items.length / DEFAULT_PAGE_SIZE)),
        pageSize: DEFAULT_PAGE_SIZE,
        total: items.length,
    }
}
</script>
