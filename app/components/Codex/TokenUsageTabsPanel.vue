<template>
    <StatisticalAnalysisPanel
        description="Browse Codex token consumption by day, week, month, or session."
        icon="lucide:table-2"
        title="Codex Token Usage"
    >
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
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{{ tab.heading }}</TableHead>
                            <TableHead>Models</TableHead>
                            <TableHead>Projects</TableHead>
                            <TableHead class="text-right">
                                Sessions
                            </TableHead>
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
                                Cost
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableRow
                            v-for="item in tabState[tab.value].paginatedItems"
                            :key="item.id"
                        >
                            <TableCell class="max-w-72 truncate font-medium">
                                {{ item.label }}
                            </TableCell>
                            <TableCell>{{ formatList(item.models) }}</TableCell>
                            <TableCell class="max-w-56 truncate">
                                {{ formatList(item.projects) }}
                            </TableCell>
                            <TableCell class="text-right tabular-nums">
                                {{ item.sessionCount }}
                            </TableCell>
                            <TableCell class="text-right tabular-nums">
                                {{ formatNumber(item.inputTokens) }}
                            </TableCell>
                            <TableCell class="text-right tabular-nums">
                                {{ formatNumber(item.outputTokens) }}
                            </TableCell>
                            <TableCell class="text-right tabular-nums">
                                {{ formatNumber(item.reasoningOutputTokens) }}
                            </TableCell>
                            <TableCell class="text-right tabular-nums">
                                {{ formatNumber(item.cachedInputTokens) }}
                            </TableCell>
                            <TableCell class="text-right tabular-nums">
                                {{ formatNumber(item.totalTokens) }}
                            </TableCell>
                            <TableCell class="text-right tabular-nums">
                                {{ formatCurrency(item.costUSD) }}
                            </TableCell>
                        </TableRow>
                        <TableEmpty v-if="tabState[tab.value].items.length === 0" :colspan="10">
                            No Codex token usage found.
                        </TableEmpty>
                    </TableBody>
                </Table>

                <CodexPaginationFooter
                    :page="tabState[tab.value].page"
                    :page-count="tabState[tab.value].pageCount"
                    :page-size="pageSize"
                    :total="tabState[tab.value].items.length"
                    @update:page="page => setPage(tab.value, page)"
                />
            </TabsContent>
        </Tabs>
    </StatisticalAnalysisPanel>
</template>

<script setup lang="ts">
import type { CodexTokenUsageRow } from '~/composables/useCodexDashboard'
import { formatNumber } from '@lonewolfyx/utils'
import { computed, reactive, shallowRef } from 'vue'
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatCurrency } from '~/composables/useUsageDashboard'
import CodexPaginationFooter from './PaginationFooter.vue'

defineOptions({
    name: 'CodexTokenUsageTabsPanel',
})

const props = withDefaults(defineProps<{
    dailyItems: CodexTokenUsageRow[]
    weeklyItems: CodexTokenUsageRow[]
    monthlyItems: CodexTokenUsageRow[]
    sessionItems: CodexTokenUsageRow[]
    pageSize?: number
}>(), {
    pageSize: 8,
})

type TokenTabValue = 'day' | 'month' | 'session' | 'week'

interface TokenTab {
    heading: string
    label: string
    value: TokenTabValue
}

const activeTab = shallowRef<TokenTabValue>('day')
const pageByTab = reactive<Record<TokenTabValue, number>>({
    day: 1,
    month: 1,
    session: 1,
    week: 1,
})

const tabs: TokenTab[] = [
    { heading: 'Date', label: '日', value: 'day' },
    { heading: 'Week', label: '周', value: 'week' },
    { heading: 'Month', label: '月', value: 'month' },
    { heading: 'Session ID', label: '会话', value: 'session' },
]

const itemsByTab = computed<Record<TokenTabValue, CodexTokenUsageRow[]>>(() => ({
    day: props.dailyItems,
    month: props.monthlyItems,
    session: props.sessionItems,
    week: props.weeklyItems,
}))

interface TokenTabState {
    items: CodexTokenUsageRow[]
    page: number
    pageCount: number
    paginatedItems: CodexTokenUsageRow[]
}

const tabState = computed<Record<TokenTabValue, TokenTabState>>(() => Object.fromEntries(tabs.map((tab) => {
    const items = itemsByTab.value[tab.value]
    const pageCount = Math.max(1, Math.ceil(items.length / props.pageSize))
    const page = Math.min(pageByTab[tab.value], pageCount)
    const start = (page - 1) * props.pageSize

    return [tab.value, {
        items,
        page,
        pageCount,
        paginatedItems: items.slice(start, start + props.pageSize),
    }]
})) as Record<TokenTabValue, TokenTabState>)

function setPage(tab: TokenTabValue, page: number) {
    const pageCount = tabState.value[tab].pageCount
    pageByTab[tab] = Math.min(pageCount, Math.max(1, page))
}

function formatList(items: string[]) {
    return items.length > 0 ? items.join(', ') : 'None'
}
</script>
