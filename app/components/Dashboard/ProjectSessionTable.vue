<template>
    <div>
        <p v-if="tableError" class="mb-3 text-xs text-destructive">
            {{ tableError.message }}
        </p>
        <DataTable
            :columns="columns"
            :data="pageData.items"
            empty-text="No sessions found."
            :pagination="pageData.pagination"
            @page-change="setPage"
        />
    </div>
</template>

<script setup lang="ts">
import type { FetchPage, PaginatedResponse } from '#shared/types/pagination'
import type { ProjectSessionTableRow } from '#shared/types/project-dashboard'
import type { ColumnDef } from '@tanstack/vue-table'
import { PROJECT_USAGE_PLATFORM_META } from '#shared/platform/metadata'
import { DEFAULT_PAGE_SIZE } from '#shared/types/pagination'

const props = withDefaults(defineProps<{
    fetchPage?: FetchPage<ProjectSessionTableRow>
    items: ProjectSessionTableRow[]
    pagination?: PaginatedResponse<ProjectSessionTableRow>['pagination']
}>(), {
})

const initialPage = computed<PaginatedResponse<ProjectSessionTableRow>>(() => ({
    items: props.items,
    pagination: props.pagination ?? {
        page: 1,
        pageCount: Math.max(1, Math.ceil(props.items.length / DEFAULT_PAGE_SIZE)),
        pageSize: DEFAULT_PAGE_SIZE,
        total: props.items.length,
    },
}))
const { error: tableError, pageData, setPage } = usePaginatedTable(initialPage, props.fetchPage)
const columns: ColumnDef<ProjectSessionTableRow>[] = [
    {
        accessorKey: 'sessionId',
        cell: ({ row }) => row.original.sessionId,
        header: 'Session ID',
        meta: { class: 'max-w-72 truncate font-medium font-mono text-xs' },
    },
    {
        accessorKey: 'platform',
        cell: ({ row }) => h('div', { class: 'flex items-center gap-2' }, [
            h(resolveComponent('Icon'), {
                class: 'size-5',
                name: PROJECT_USAGE_PLATFORM_META[row.original.platform].aiIcon,
            }),
            h('span', PROJECT_USAGE_PLATFORM_META[row.original.platform].label),
        ]),
        header: 'Tool',
    },
    {
        accessorKey: 'model',
        header: 'Model',
        meta: { class: 'max-w-56 truncate' },
    },
    {
        accessorKey: 'startedAt',
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
        header: 'Tokens',
        meta: { class: 'text-right tabular-nums' },
    },
    {
        accessorKey: 'cost',
        header: 'Cost',
        meta: { class: 'text-right tabular-nums' },
    },
]
</script>
