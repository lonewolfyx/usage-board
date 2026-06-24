interface ModelLookupInput {
    addProviderPrefixes?: readonly string[]
    aliases?: readonly string[]
    model: string
    provider?: string | null
    removeFastSuffix?: boolean
    stripCustomPrefix?: boolean
    stripProviderPrefixes?: readonly string[]
}

export function createModelLookupCandidates(input: ModelLookupInput) {
    const normalized = (input.stripCustomPrefix ? input.model.replace(/^custom:/u, '') : input.model).trim()
    const candidates = [normalized]

    for (const prefix of input.stripProviderPrefixes ?? []) {
        candidates.push(normalized.replace(new RegExp(`^${prefix}/`, 'u'), ''))
    }

    if (input.provider) {
        candidates.push(`${input.provider}/${normalized}`)
    }

    for (const prefix of input.addProviderPrefixes ?? []) {
        candidates.push(`${prefix}/${normalized}`)
    }

    if (input.removeFastSuffix) {
        candidates.push(normalized.replace(/-fast$/u, ''))
    }

    candidates.push(...input.aliases ?? [])

    return Array.from(new Set(candidates.filter(Boolean)))
}
