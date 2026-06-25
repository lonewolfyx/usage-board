<template>
    <div class="bg-background border border-input rounded-xl shadow-xs min-h-0 flex-1 overflow-y-auto">
        <div class="flex flex-col gap-6 p-6">
            <Skeleton v-if="showSkeleton" class="h-24 w-full rounded-md" />
            <DashboardOverviewCards v-else :cards="kpiCards" />

            <p v-if="errorText" class="text-sm text-destructive">
                {{ errorText }}
            </p>

            <StatisticalAnalysisPanel
                title="Usage Calendar"
                description="Daily AI coding token consumption overview"
                icon="lucide:calendar-days"
            >
                <CalendarControls
                    :selected-month="selectedMonth"
                    :available-months="availableMonths"
                    @prev="goToPrevMonth"
                    @next="goToNextMonth"
                    @today="goToToday"
                    @select="goToMonth"
                >
                    <template #filter>
                        <CalendarPlatformFilter
                            :selected-agent="selectedAgent"
                            @select-agent="selectAgent"
                        />
                    </template>
                </CalendarControls>

                <CalendarMonthGrid
                    class="mt-4"
                    :cells="calendarCells"
                />
            </StatisticalAnalysisPanel>
        </div>
    </div>
</template>

<script lang="ts" setup>
const {
    selectedMonth,
    selectedAgent,
    availableMonths,
    kpiCards,
    calendarCells,
    goToPrevMonth,
    goToNextMonth,
    goToToday,
    goToMonth,
    selectAgent,
    showSkeleton,
    errorText,
} = useCalendarDashboard()

useHead({ title: 'Usage Calendar' })
</script>
