<template>
    <DashboardPage>
        <DashboardOverviewCards :cards="overviewCards" />

        <DashboardPanelGrid>
            <StatisticalAnalysisModelUsagePanel :monthly-items="monthlyModelUsage" class="md:col-span-8" />
            <StatisticalAnalysisProjectUsagePanel :items="projectUsage" class="md:col-span-4" />
            <CodexTokenHeatmapPanel
                :items="dailyTokenUsage"
                :product-name="productName"
                class="md:col-span-12"
            />
            <CodexTokenUsageTabsPanel
                :daily-items="sessionDailyRows"
                :monthly-items="monthlyRows"
                :product-name="productName"
                :session-items="sessionRows"
                :weekly-items="weeklyRows"
                class="md:col-span-12"
            />
            <CodexSessionUsageTable
                :items="sessionUsage"
                :product-name="productName"
                class="md:col-span-12"
            />
        </DashboardPanelGrid>
    </DashboardPage>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import CodexSessionUsageTable from '~/components/Codex/SessionUsageTable.vue'
import CodexTokenHeatmapPanel from '~/components/Codex/TokenHeatmapPanel.vue'
import CodexTokenUsageTabsPanel from '~/components/Codex/TokenUsageTabsPanel.vue'

defineOptions({
    name: 'DashboardTokenConsumptionDashboard',
})

const props = defineProps<{
    dailyRows: CodexTokenUsageRow[]
    dailyTokenUsage: DailyTokenUsage[]
    monthlyModelUsage: MonthlyModelUsage[]
    monthlyRows: CodexTokenUsageRow[]
    overviewCards: DashboardOverviewCard[]
    productName: string
    projectUsage: ProjectUsageItem[]
    sessionRows: CodexTokenUsageRow[]
    sessionUsage: CodexSessionUsageItem[]
    weeklyRows: CodexTokenUsageRow[]
}>()

const sessionDailyRows = computed<CodexTokenUsageRow[]>(() => {
    const groups = new Map<string, CodexTokenUsageRow>()

    for (const session of props.sessionUsage) {
        const id = getDateRowId(session.date)
        const group = groups.get(id) ?? {
            cachedInputTokens: 0,
            costUSD: 0,
            id,
            inputTokens: 0,
            label: session.date,
            models: [],
            outputTokens: 0,
            period: session.date,
            projects: [],
            reasoningOutputTokens: 0,
            sessionCount: 0,
            totalTokens: 0,
        }

        group.cachedInputTokens += session.cachedInputTokens
        group.costUSD += session.costUSD
        group.inputTokens += session.inputTokens
        group.models = uniqueItems([...group.models, session.model])
        group.outputTokens += session.outputTokens
        group.projects = uniqueItems([...group.projects, session.project])
        group.reasoningOutputTokens += session.reasoningOutputTokens
        group.sessionCount += 1
        group.totalTokens += session.tokenTotal
        groups.set(id, group)
    }

    return Array.from(groups.values()).sort((a, b) => b.id.localeCompare(a.id))
})

function getDateRowId(dateLabel: string) {
    const timestamp = Date.parse(dateLabel)

    if (!Number.isFinite(timestamp)) {
        return dateLabel
    }

    const date = new Date(timestamp)
    const year = date.getFullYear()
    const month = `${date.getMonth() + 1}`.padStart(2, '0')
    const day = `${date.getDate()}`.padStart(2, '0')

    return `${year}-${month}-${day}`
}

function uniqueItems(items: string[]) {
    return Array.from(new Set(items))
}
</script>
