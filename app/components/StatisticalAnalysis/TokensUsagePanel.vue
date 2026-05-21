<template>
    <StatisticalAnalysisPanel
        description="Daily model activity by token type, cache reads, total usage, and cost"
        icon="lucide:calendar-days"
        title="Daily Token Usage"
    >
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Models</TableHead>
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
                        Cost (USD)
                    </TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                <TableRow v-for="invoice in paginatedItems" :key="invoice.date">
                    <TableCell class="font-medium">
                        {{ invoice.date }}
                    </TableCell>
                    <TableCell>{{ Object.keys(invoice.models).join(', ') }}</TableCell>
                    <TableCell class="text-right">
                        {{ formatNumber(invoice.inputTokens) }}
                    </TableCell>
                    <TableCell class="text-right">
                        {{ formatNumber(invoice.outputTokens) }}
                    </TableCell>
                    <TableCell class="text-right">
                        {{ formatNumber(invoice.reasoningOutputTokens) }}
                    </TableCell>
                    <TableCell class="text-right">
                        {{ formatNumber(invoice.cachedInputTokens) }}
                    </TableCell>
                    <TableCell class="text-right">
                        {{ formatNumber(invoice.totalTokens) }}
                    </TableCell>
                    <TableCell class="text-right">
                        {{ invoice.costUSD.toFixed(2) }}
                    </TableCell>
                </TableRow>
            </TableBody>
        </Table>

        <UsageAnalyticsPaginationFooter
            v-if="items.length > pageSize"
            v-model:page="page"
            :page-count="pageCount"
            :page-size="pageSize"
            :total="items.length"
        />
    </StatisticalAnalysisPanel>
</template>

<script lang="ts" setup>
import { formatNumber } from '@lonewolfyx/utils'

defineOptions({
    name: 'StatisticalAnalysisTokensUsagePanel',
})

const props = defineProps<{
    items: DailyTokenUsage[]
}>()

const pageSize = 10
const page = shallowRef(1)
const pageCount = computed(() => Math.max(1, Math.ceil(props.items.length / pageSize)))
const paginatedItems = computed(() => {
    const safePage = Math.min(page.value, pageCount.value)
    const start = (safePage - 1) * pageSize

    return props.items.slice(start, start + pageSize)
})

watch(() => props.items, () => {
    page.value = 1
})
</script>
