import type { CalendarApiResponse } from '#shared/types/calendar'
import { buildCalendarResponse } from '#server/aggregate/calendar'
import { defineScopedAnalysisHandler } from '#server/runtime/analysis-handlers'
import { todayDateKey, useDateFormat } from '#shared/utils/date'

export default defineScopedAnalysisHandler<CalendarApiResponse>({
    home: (modules, event) => buildCalendarResponse(modules.dailyTokenUsage, readMonth(event), null),
    agent: (dashboard, event, platform) => buildCalendarResponse(dashboard.dailyTokenUsage, readMonth(event), platform),
})

function readMonth(event: Parameters<typeof getQuery>[0]): string {
    const raw = getQuery(event).month
    const month = typeof raw === 'string' ? raw.trim() : ''
    if (/^\d{4}-\d{2}$/.test(month)) {
        return month
    }

    return useDateFormat(todayDateKey(), 'month-key') ?? todayDateKey().slice(0, 7)
}
