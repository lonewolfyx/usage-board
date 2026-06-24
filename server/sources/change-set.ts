import type { UsageSourceFile } from '#server/agents/shared/fact'

interface UsageSourceChangeSet {
    changedSources: UsageSourceFile[]
    hasChanges: boolean
    removedSources: UsageSourceFile[]
}

export function buildSourceChangeSet(discoveredSources: UsageSourceFile[], cachedSources: UsageSourceFile[]): UsageSourceChangeSet {
    const cachedByPath = new Map(cachedSources.map(source => [source.path, source]))
    const discoveredPaths = new Set(discoveredSources.map(source => source.path))
    const changedSources = discoveredSources.filter((source) => {
        const cached = cachedByPath.get(source.path)

        return !cached
            || cached.platform !== source.platform
            || cached.cacheSignature !== source.cacheSignature
            || cached.size !== source.size
            || cached.mtimeMs !== source.mtimeMs
    })
    const removedSources = cachedSources.filter(source => !discoveredPaths.has(source.path))

    return {
        changedSources,
        hasChanges: changedSources.length > 0 || removedSources.length > 0,
        removedSources,
    }
}
