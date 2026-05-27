<template>
    <div>
        <p v-if="tableError" class="mb-3 text-xs text-destructive">
            {{ tableError.message }}
        </p>
        <DataTable
            :columns="columns"
            :data="pageData.items"
            empty-text="No token usage found."
            :pagination="pageData.pagination"
            @page-change="setPage"
        />
    </div>
</template>

<script setup lang="ts">
import type { FetchPage, PaginatedResponse } from '#shared/types/pagination'
import type { ProjectTokenUsageRow } from '#shared/types/project-dashboard'
import type { ColumnDef } from '@tanstack/vue-table'
import { DEFAULT_PAGE_SIZE } from '#shared/types/pagination'

const props = withDefaults(defineProps<{
    fetchPage?: FetchPage<ProjectTokenUsageRow>
    items: ProjectTokenUsageRow[]
    pagination?: PaginatedResponse<ProjectTokenUsageRow>['pagination']
}>(), {
})

const initialPage = computed<PaginatedResponse<ProjectTokenUsageRow>>(() => ({
    items: props.items,
    pagination: props.pagination ?? {
        page: 1,
        pageCount: Math.max(1, Math.ceil(props.items.length / DEFAULT_PAGE_SIZE)),
        pageSize: DEFAULT_PAGE_SIZE,
        total: props.items.length,
    },
}))
const { error: tableError, pageData, setPage } = usePaginatedTable(initialPage, props.fetchPage)
const columns: ColumnDef<ProjectTokenUsageRow>[] = [
    {
        accessorKey: 'label',
        header: 'Period',
        meta: { class: 'max-w-72 truncate font-medium' },
    },
    {
        accessorKey: 'models',
        header: 'Models',
        meta: { class: 'max-w-56 truncate' },
    },
    {
        accessorKey: 'sessions',
        header: 'Sessions',
        meta: { class: 'text-right tabular-nums' },
    },
    {
        accessorKey: 'inputTokens',
        header: 'Input',
        meta: { class: 'text-right tabular-nums' },
    },
    {
        accessorKey: 'outputTokens',
        header: 'Output',
        meta: { class: 'text-right tabular-nums' },
    },
    {
        accessorKey: 'reasoningTokens',
        header: 'Reasoning',
        meta: { class: 'text-right tabular-nums' },
    },
    {
        accessorKey: 'cacheTokens',
        header: 'Cache Read',
        meta: { class: 'text-right tabular-nums' },
    },
    {
        accessorKey: 'tokens',
        header: 'Total Tokens',
        meta: { class: 'text-right tabular-nums' },
    },
    {
        accessorKey: 'cost',
        header: 'Cost',
        meta: { class: 'text-right tabular-nums' },
    },
]
</script>
