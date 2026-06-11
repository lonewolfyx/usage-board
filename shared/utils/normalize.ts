export function normalizeStringList<T extends string>(value: unknown): T[] | undefined {
    if (Array.isArray(value)) {
        return value.flatMap(item => typeof item === 'string' ? splitCommaValues(item) : []) as T[]
    }

    if (typeof value === 'string') {
        return splitCommaValues(value) as T[]
    }

    return undefined
}

function splitCommaValues(value: string) {
    return value.split(',')
        .map(item => item.trim())
        .filter(Boolean)
}
