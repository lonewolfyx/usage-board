export function parse(value: string | null | undefined) {
    if (typeof value !== 'string') {
        return null
    }

    try {
        return JSON.parse(value) as unknown
    }
    catch {
        return null
    }
}
