<template>
    <div class="md:col-span-12">
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
                <TableRow v-for="invoice in dailyTokenUsage" :key="invoice.date">
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
    </div>
</template>

<script lang="ts" setup>
import { formatNumber } from '@lonewolfyx/utils'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useUsageDashboard } from '~/composables/useUsageDashboard'

defineOptions({
    name: 'TokensUsage',
})

const { dailyTokenUsage } = useUsageDashboard()
</script>
