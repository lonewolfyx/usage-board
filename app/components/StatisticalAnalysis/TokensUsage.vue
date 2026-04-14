<template>
    <Table>
        <TableHeader>
            <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Models</TableHead>
                <TableHead>Input</TableHead>
                <TableHead>Output</TableHead>
                <TableHead>Reasoning</TableHead>
                <TableHead>Cache Read</TableHead>
                <TableHead>Total Tokens</TableHead>
                <TableHead>Cost (USD)</TableHead>
            </TableRow>
        </TableHeader>
        <TableBody>
            <TableRow v-for="invoice in invoices" :key="invoice.date">
                <TableCell class="font-medium">
                    {{ invoice.date }}
                </TableCell>
                <TableCell>{{ Object.keys(invoice.models).join(',') }}</TableCell>
                <TableCell class="text-right">
                    {{ formatNumber(invoice.inputTokens) }}
                </TableCell>
                <TableCell class="text-right">
                    {{ formatNumber(invoice.outputTokens) }}
                </tablecell>
                <TableCell class="text-right">
                    {{ formatNumber(invoice.reasoningOutputTokens) }}
                </tablecell>
                <TableCell class="text-right">
                    {{ formatNumber(invoice.cachedInputTokens) }}
                </tablecell>
                <TableCell class="text-right">
                    {{ formatNumber(invoice.totalTokens) }}
                </tablecell>
                <TableCell class="text-right">
                    {{ invoice.costUSD.toFixed(2) }}
                </tablecell>
            </TableRow>
        </TableBody>
        <!--        <TableFooter> -->
        <!--            <TableRow> -->
        <!--                <TableCell colspan="3"> -->
        <!--                    Total -->
        <!--                </TableCell> -->
        <!--                <TableCell class="text-right"> -->
        <!--                    $2,500.00 -->
        <!--                </TableCell> -->
        <!--            </TableRow> -->
        <!--        </TableFooter> -->
    </Table>
</template>

<script lang="ts" setup>
import { formatNumber } from '@lonewolfyx/utils'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

defineOptions({
    name: 'TokensUsage',
})

const invoices = [
    {
        date: 'Mar 19, 2026',
        inputTokens: 5274379,
        cachedInputTokens: 4317312,
        outputTokens: 33443,
        reasoningOutputTokens: 9011,
        totalTokens: 5307822,
        costUSD: 3.9736405,
        models: {
            'gpt-5.4': {
                inputTokens: 5274379,
                cachedInputTokens: 4317312,
                outputTokens: 33443,
                reasoningOutputTokens: 9011,
                totalTokens: 5307822,
                isFallback: false,
            },
        },
    },
    {
        date: 'Mar 20, 2026',
        inputTokens: 2972768,
        cachedInputTokens: 2191872,
        outputTokens: 30106,
        reasoningOutputTokens: 3500,
        totalTokens: 3002874,
        costUSD: 2.951798,
        models: {
            'gpt-5.4': {
                inputTokens: 2972768,
                cachedInputTokens: 2191872,
                outputTokens: 30106,
                reasoningOutputTokens: 3500,
                totalTokens: 3002874,
                isFallback: false,
            },
        },
    },
    {
        date: 'Mar 27, 2026',
        inputTokens: 277230,
        cachedInputTokens: 258816,
        outputTokens: 7404,
        reasoningOutputTokens: 5062,
        totalTokens: 284634,
        costUSD: 0.18117329999999998,
        models: {
            'gpt-5.3-codex': {
                inputTokens: 277230,
                cachedInputTokens: 258816,
                outputTokens: 7404,
                reasoningOutputTokens: 5062,
                totalTokens: 284634,
                isFallback: false,
            },
        },
    },
    {
        date: 'Mar 28, 2026',
        inputTokens: 2369917,
        cachedInputTokens: 1904896,
        outputTokens: 18591,
        reasoningOutputTokens: 10599,
        totalTokens: 2388508,
        costUSD: 1.40741755,
        models: {
            'gpt-5.3-codex': {
                inputTokens: 2369917,
                cachedInputTokens: 1904896,
                outputTokens: 18591,
                reasoningOutputTokens: 10599,
                totalTokens: 2388508,
                isFallback: false,
            },
        },
    },
    {
        date: 'Mar 30, 2026',
        inputTokens: 3308750,
        cachedInputTokens: 3204096,
        outputTokens: 40618,
        reasoningOutputTokens: 20878,
        totalTokens: 3349368,
        costUSD: 1.3125133,
        models: {
            'gpt-5.3-codex': {
                inputTokens: 3308750,
                cachedInputTokens: 3204096,
                outputTokens: 40618,
                reasoningOutputTokens: 20878,
                totalTokens: 3349368,
                isFallback: false,
            },
        },
    },
    {
        date: 'Apr 01, 2026',
        inputTokens: 22783796,
        cachedInputTokens: 21042432,
        outputTokens: 110037,
        reasoningOutputTokens: 51391,
        totalTokens: 22893833,
        costUSD: 8.2703306,
        models: {
            'gpt-5.3-codex': {
                inputTokens: 22783796,
                cachedInputTokens: 21042432,
                outputTokens: 110037,
                reasoningOutputTokens: 51391,
                totalTokens: 22893833,
                isFallback: false,
            },
        },
    },
    {
        date: 'Apr 02, 2026',
        inputTokens: 22874109,
        cachedInputTokens: 21237120,
        outputTokens: 156231,
        reasoningOutputTokens: 62813,
        totalTokens: 23030340,
        costUSD: 8.76846075,
        models: {
            'gpt-5.3-codex': {
                inputTokens: 22874109,
                cachedInputTokens: 21237120,
                outputTokens: 156231,
                reasoningOutputTokens: 62813,
                totalTokens: 23030340,
                isFallback: false,
            },
        },
    },
    {
        date: 'Apr 03, 2026',
        inputTokens: 20819675,
        cachedInputTokens: 19853184,
        outputTokens: 172877,
        reasoningOutputTokens: 106205,
        totalTokens: 20992552,
        costUSD: 7.5859444499999995,
        models: {
            'gpt-5.3-codex': {
                inputTokens: 20819675,
                cachedInputTokens: 19853184,
                outputTokens: 172877,
                reasoningOutputTokens: 106205,
                totalTokens: 20992552,
                isFallback: false,
            },
        },
    },
    {
        date: 'Apr 08, 2026',
        inputTokens: 2730499,
        cachedInputTokens: 2246400,
        outputTokens: 29855,
        reasoningOutputTokens: 16411,
        totalTokens: 2760354,
        costUSD: 2.2196724999999997,
        models: {
            'gpt-5.4': {
                inputTokens: 2730499,
                cachedInputTokens: 2246400,
                outputTokens: 29855,
                reasoningOutputTokens: 16411,
                totalTokens: 2760354,
                isFallback: false,
            },
        },
    },
    {
        date: 'Apr 09, 2026',
        inputTokens: 1919460,
        cachedInputTokens: 1513472,
        outputTokens: 37657,
        reasoningOutputTokens: 15077,
        totalTokens: 1957117,
        costUSD: 1.958193,
        models: {
            'gpt-5.4': {
                inputTokens: 1919460,
                cachedInputTokens: 1513472,
                outputTokens: 37657,
                reasoningOutputTokens: 15077,
                totalTokens: 1957117,
                isFallback: false,
            },
        },
    },
    {
        date: 'Apr 10, 2026',
        inputTokens: 4788095,
        cachedInputTokens: 4163840,
        outputTokens: 40936,
        reasoningOutputTokens: 18162,
        totalTokens: 4829031,
        costUSD: 3.2156375,
        models: {
            'gpt-5.4': {
                inputTokens: 4788095,
                cachedInputTokens: 4163840,
                outputTokens: 40936,
                reasoningOutputTokens: 18162,
                totalTokens: 4829031,
                isFallback: false,
            },
        },
    },
    {
        date: 'Apr 13, 2026',
        inputTokens: 16031,
        cachedInputTokens: 4480,
        outputTokens: 196,
        reasoningOutputTokens: 153,
        totalTokens: 16227,
        costUSD: 0.0329375,
        models: {
            'gpt-5.4': {
                inputTokens: 16031,
                cachedInputTokens: 4480,
                outputTokens: 196,
                reasoningOutputTokens: 153,
                totalTokens: 16227,
                isFallback: false,
            },
        },
    },
    {
        date: 'Apr 14, 2026',
        inputTokens: 441319,
        cachedInputTokens: 343296,
        outputTokens: 11906,
        reasoningOutputTokens: 4338,
        totalTokens: 453225,
        costUSD: 0.5094715,
        models: {
            'gpt-5.4': {
                inputTokens: 441319,
                cachedInputTokens: 343296,
                outputTokens: 11906,
                reasoningOutputTokens: 4338,
                totalTokens: 453225,
                isFallback: false,
            },
        },
    },
]
</script>
