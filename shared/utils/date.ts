import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)

export type DateInput = Date | string | number | dayjs.Dayjs

/**
 * Centralized date formatting function.
 * All date operations in the codebase should go through this function.
 *
 * @param value - Date input (Date, string, number timestamp, or dayjs object)
 * @param format - Output format:
 *   - 'date-key' (default): 'YYYY-MM-DD' in local timezone
 *   - 'iso': ISO 8601 string
 *   - 'display': 'MMM DD, YYYY' in UTC
 *   - 'month-key': 'YYYY-MM'
 *   - 'month-label': 'MMM YYYY' in UTC
 *   - 'hour': hour number (0-23) in local timezone
 *   - Any custom dayjs format string
 * @returns Formatted string, or null if the input is invalid
 */
export function useDateFormat(value: DateInput, format: string = 'date-key'): string | null {
    if (value === null || value === undefined) {
        return null
    }

    const d = dayjs(value as dayjs.ConfigType)

    if (!d.isValid()) {
        return null
    }

    switch (format) {
        case 'date-key':
            return d.format('YYYY-MM-DD')
        case 'iso':
            return d.toISOString()
        case 'display':
            return d.utc().format('MMM DD, YYYY')
        case 'month-key':
            return d.format('YYYY-MM')
        case 'month-label':
            return d.utc().format('MMM YYYY')
        case 'hour':
            return String(d.hour())
        default:
            return d.format(format)
    }
}

/**
 * Returns today's date key in 'YYYY-MM-DD' format (local timezone).
 */
export function todayDateKey(): string {
    return dayjs().format('YYYY-MM-DD')
}

/**
 * Returns the previous day's date key in 'YYYY-MM-DD' format.
 */
export function previousDateKey(dateKey: string): string {
    return dayjs(dateKey).subtract(1, 'day').format('YYYY-MM-DD')
}

/**
 * Safely converts any value to an ISO string.
 * Returns null for invalid or empty input.
 */
export function toIsoStringSafe(value: unknown): string | null {
    if (value === null || value === undefined) {
        return null
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        const timestamp = value > 10_000_000_000 ? value : value * 1000
        return dayjs(timestamp).toISOString()
    }

    if (value instanceof Date) {
        return Number.isFinite(value.getTime()) ? value.toISOString() : null
    }

    if (typeof value !== 'string') {
        return null
    }

    const normalized = value.trim()
    if (!normalized) {
        return null
    }

    const d = dayjs(normalized)
    return d.isValid() ? d.toISOString() : null
}

/**
 * Converts any value to a Date object.
 * Returns null for invalid input.
 */
export function toDateSafe(value: unknown): Date | null {
    if (value === null || value === undefined) {
        return null
    }

    const d = dayjs(value as dayjs.ConfigType)
    return d.isValid() ? d.toDate() : null
}

/**
 * Returns a Date object representing the start of today (midnight).
 */
export function todayStartOfDay(): Date {
    return dayjs().startOf('day').toDate()
}

/**
 * Returns the week label for a date in 'YYYY-MM-DD - YYYY-MM-DD' format.
 * Weeks start on Monday and end on Sunday.
 */
export function getWeekLabel(date: DateInput): string {
    const d = dayjs(date).startOf('day')
    const day = d.day()
    const diff = day === 0 ? -6 : 1 - day
    const weekStart = d.add(diff, 'day')
    const weekEnd = weekStart.add(6, 'day')

    return `${weekStart.format('YYYY-MM-DD')} - ${weekEnd.format('YYYY-MM-DD')}`
}

/**
 * Formats a duration in minutes into a human-readable string.
 */
export function formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60

    if (hours === 0) {
        return `${remainingMinutes}m`
    }

    if (remainingMinutes === 0) {
        return `${hours}h`
    }

    return `${hours}h ${remainingMinutes}m`
}

/**
 * Creates a Date from a timestamp. Handles both seconds and milliseconds.
 */
export function fromDateTimestamp(value: number): Date | null {
    if (!Number.isFinite(value) || value <= 0) {
        return null
    }

    const milliseconds = value > 1e12 ? value : value * 1000
    return dayjs(milliseconds).toDate()
}
