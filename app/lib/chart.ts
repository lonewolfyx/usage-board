import { formatCompactNumber } from '#shared/utils/usage-dashboard'

export function clampNumber(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max)
}

export function escapeHtml(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

export function formatCompactAxisTick(value: number | Date) {
    return value instanceof Date ? '' : formatCompactNumber(value)
}

export function createStackedAreaChartColors<T>(
    getSeries: () => T[],
    options: {
        fallbackColor?: string
        getColor: (item: T) => string
        getKey: (item: T) => string
        gradientPrefix: string
    },
) {
    const fallbackColor = options.fallbackColor ?? '#2563eb'

    function getGradientId(value: string) {
        return `${options.gradientPrefix}-${value.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`
    }

    function getAreaColor(_: unknown, index: number) {
        const series = getSeries()[index]

        return series ? `url(#${getGradientId(options.getKey(series))})` : fallbackColor
    }

    function getLineColor(_: unknown, index: number) {
        const series = getSeries()[index]

        return series ? options.getColor(series) : fallbackColor
    }

    function getCrosshairColor(_: unknown, index: number) {
        return getLineColor(undefined, index)
    }

    return {
        getAreaColor,
        getCrosshairColor,
        getGradientId,
        getLineColor,
    }
}
