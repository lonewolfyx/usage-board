<template>
    <div>
        <Table>
            <TableHeader>
                <TableRow v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
                    <TableHead
                        v-for="header in headerGroup.headers"
                        :key="header.id"
                        :class="getColumnClass(header.column.columnDef)"
                    >
                        <FlexRender
                            v-if="!header.isPlaceholder"
                            :props="header.getContext()"
                            :render="header.column.columnDef.header"
                        />
                    </TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                <template v-if="table.getRowModel().rows.length">
                    <TableRow
                        v-for="row in table.getRowModel().rows"
                        :key="row.id"
                        :data-state="row.getIsSelected() && 'selected'"
                    >
                        <TableCell
                            v-for="cell in row.getVisibleCells()"
                            :key="cell.id"
                            :class="getColumnClass(cell.column.columnDef)"
                        >
                            <FlexRender
                                :props="cell.getContext()"
                                :render="cell.column.columnDef.cell"
                            />
                        </TableCell>
                    </TableRow>
                </template>
                <TableEmpty v-else :colspan="columns.length">
                    {{ emptyText }}
                </TableEmpty>
            </TableBody>
        </Table>

        <UsageAnalyticsPaginationFooter
            v-if="pagination.total > pagination.pageSize"
            :page="pagination.page"
            :page-count="pagination.pageCount"
            :page-size="pagination.pageSize"
            :total="pagination.total"
            @update:page="emit('pageChange', $event)"
        />
    </div>
</template>

<script setup lang="ts" generic="TData">
import type { PaginationMeta } from '#shared/types/pagination'
import type { ColumnDef } from '@tanstack/vue-table'
import type { HTMLAttributes } from 'vue'
import {
    FlexRender,
    getCoreRowModel,
    useVueTable,
} from '@tanstack/vue-table'

defineOptions({
    name: 'DataTable',
})

const props = withDefaults(defineProps<{
    columns: ColumnDef<TData>[]
    data: TData[]
    emptyText?: string
    getRowId?: (row: TData, index: number) => string
    pagination: PaginationMeta
}>(), {
    emptyText: 'No results.',
})

const emit = defineEmits<{
    pageChange: [page: number]
}>()

const table = useVueTable({
    get columns() {
        return props.columns
    },
    get data() {
        return props.data
    },
    getCoreRowModel: getCoreRowModel(),
    getRowId: props.getRowId,
    manualPagination: true,
    pageCount: props.pagination.pageCount,
})

function getColumnClass(column: ColumnDef<TData>) {
    return (column.meta as { class?: HTMLAttributes['class'] } | undefined)?.class
}
</script>
