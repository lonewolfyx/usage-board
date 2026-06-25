import type { ProjectUsagePlatform } from '#shared/types/ai'
import type { CalendarApiResponse, CalendarCell, CalendarCellEvent, CalendarDayData, CalendarMonthSummary } from '#shared/types/calendar'
import { PROJECT_USAGE_PLATFORM_META } from '#shared/platform/metadata'
import { todayDateKey, useDateFormat } from '#shared/utils/date'
import dayjs from 'dayjs'
import { fetchCalendarData } from '~/lib/analysis-repository'

function createEmptyCalendarResponse(month: string): CalendarApiResponse {
    return {
        kpiCards: [],
        month: {
            month,
            totalTokens: 0,
            totalCostUSD: 0,
            activeDays: 0,
            avgDailyCostUSD: 0,
            topPlatform: null,
            topModel: null,
            days: [],
        },
        availableMonths: [],
        scopedPlatform: null,
    }
}

export function useCalendarDashboard() {
    const currentMonth = useDateFormat(todayDateKey(), 'month-key') ?? todayDateKey().slice(0, 7)
    const selectedMonth = ref(currentMonth)
    const selectedAgent = ref<ProjectUsagePlatform | null>(null)

    const { data, status, error, refresh } = useAsyncData<CalendarApiResponse>(
        () => `analysis:calendar:${selectedMonth.value}:${selectedAgent.value ?? 'all'}`,
        () => fetchCalendarData(selectedMonth.value, selectedAgent.value ?? undefined),
        {
            watch: [selectedMonth, selectedAgent],
            default: () => createEmptyCalendarResponse(selectedMonth.value),
        },
    )

    const { showSkeleton, errorText } = useDashboardAsyncState(status, error)

    // Live update: only refresh when viewing the current month, and gate by selected agent.
    useUsageLiveUpdate((update) => {
        if (selectedMonth.value !== currentMonth) {
            return
        }
        if (selectedAgent.value && !update.updatedPlatforms.includes(selectedAgent.value)) {
            return
        }
        return refresh()
    })

    const kpiCards = computed(() => data.value?.kpiCards ?? [])
    const monthData = computed(() => data.value?.month)
    const availableMonths = computed(() => data.value?.availableMonths ?? [])
    const scopedPlatform = computed(() => data.value?.scopedPlatform ?? null)
    const calendarCells = computed(() => buildCalendarGrid(monthData.value))

    const goToMonth = (m: string) => {
        selectedMonth.value = m
    }
    const goToPrevMonth = () => {
        selectedMonth.value = dayjs(`${selectedMonth.value}-01`).subtract(1, 'month').format('YYYY-MM')
    }
    const goToNextMonth = () => {
        selectedMonth.value = dayjs(`${selectedMonth.value}-01`).add(1, 'month').format('YYYY-MM')
    }
    const goToToday = () => {
        selectedMonth.value = currentMonth
    }
    const selectAgent = (p: ProjectUsagePlatform | null) => {
        selectedAgent.value = p
    }

    return {
        selectedMonth,
        selectedAgent,
        scopedPlatform,
        kpiCards,
        monthData,
        availableMonths,
        calendarCells,
        goToMonth,
        goToPrevMonth,
        goToNextMonth,
        goToToday,
        selectAgent,
        showSkeleton,
        errorText,
        status,
        refresh,
    }
}

function buildCalendarGrid(month?: CalendarMonthSummary): CalendarCell[] {
    if (!month || month.days.length === 0) {
        return []
    }

    const first = dayjs(`${month.month}-01`)
    const startOffset = (first.day() + 6) % 7 // Monday-first
    const daysInMonth = first.daysInMonth()
    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7
    const todayKey = todayDateKey()
    const byDate = new Map(month.days.map(d => [d.dateKey, d]))

    const cells: CalendarCell[] = []
    for (let i = 0; i < totalCells; i++) {
        const date = first.startOf('month').subtract(startOffset, 'day').add(i, 'day')
        const dateKey = date.format('YYYY-MM-DD')
        const dayData = byDate.get(dateKey)
        cells.push({
            day: date.date(),
            dateKey,
            isCurrentMonth: date.isSame(first, 'month'),
            isToday: dateKey === todayKey,
            totalTokens: dayData?.totalTokens ?? 0,
            totalCostUSD: dayData?.costUSD ?? 0,
            events: toEvents(dayData),
        })
    }
    return cells
}

function toEvents(day?: CalendarDayData): CalendarCellEvent[] {
    if (!day?.platforms) {
        return []
    }

    const events: CalendarCellEvent[] = []
    for (const [, p] of Object.entries(day.platforms ?? {})) {
        if (!p) {
            continue
        }
        const meta = PROJECT_USAGE_PLATFORM_META[p.platform]
        events.push({
            platform: p.platform,
            label: meta.label,
            icon: meta.aiIcon,
            color: meta.color,
            costUSD: p.costUSD,
            inputTokens: p.inputTokens,
            outputTokens: p.outputTokens,
            reasoningOutputTokens: p.reasoningOutputTokens,
            cachedInputTokens: p.cachedInputTokens,
            totalTokens: p.totalTokens,
            models: p.models,
        })
    }
    return events.sort((a, b) => b.totalTokens - a.totalTokens)
}
