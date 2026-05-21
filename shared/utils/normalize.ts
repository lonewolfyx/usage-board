export function normalizeStringValue<T extends string>(value: unknown): T | undefined {
    return typeof value === 'string' ? value.trim() as T : undefined
}

export function normalizeStringList<T extends string>(value: unknown): T[] | undefined {
    if (Array.isArray(value)) {
        return value.flatMap(item => typeof item === 'string' ? splitCommaValues(item) : []) as T[]
    }

    if (typeof value === 'string') {
        return splitCommaValues(value) as T[]
    }

    return undefined
}

export function normalizeUnknownRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null
}

export function normalizeFiniteNumberOrNull(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function normalizeTimestampValue(value: unknown) {
    const normalizedValue = normalizeStringValue(value)

    return normalizedValue && Number.isFinite(Date.parse(normalizedValue)) ? normalizedValue : null
}

function splitCommaValues(value: string) {
    return value.split(',')
        .map(item => item.trim())
        .filter(Boolean)
}
