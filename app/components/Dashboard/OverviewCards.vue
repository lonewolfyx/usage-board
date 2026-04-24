<template>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatisticalAnalysisTotalCard
            v-for="card in cards"
            :key="card.name"
            :detail="card.detail"
            :icon="card.icon"
            :name="card.name"
            :trend="card.trend"
            :trend-tone="card.trendTone"
            :value="card.value"
        />
    </div>
</template>

<script setup lang="ts">
defineOptions({
    name: 'DashboardOverviewCards',
})

defineProps<{
    cards: DashboardOverviewCard[]
}>()
</script>
