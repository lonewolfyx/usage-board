import type { UsageCacheRepository } from '#server/repositories/sqlite/usage-cache.repository'
import type { UsageCleaningReporter } from '#server/services/usage-cleaning-reporter'
import type { DiscoveredUsageFile } from '#server/services/usage-indexer/platform-adapter'
import type {
    IncrementalUsageIndexResult,
    IndexedUsageInteraction,
    IndexedUsageSessionFragment,
    IndexedUsageSourceFile,
    IndexedUsageSourceFileMeta,
    UpdatedUsageSession,
} from '#server/types/usage-indexer'
import type { ProjectUsagePlatform, ProjectUsagePlatformRecord } from '#shared/types/ai'
import type { IConfig } from '#shared/types/config'
import type { ModelPricingResolver, UsageAggregateEvent } from '#shared/types/platform'
import type { ProjectSessionInteractionItem, ProjectSessionUsageItem } from '#shared/types/usage-dashboard'
import { usagePlatformAdapters } from '#server/services/usage-indexer/adapters'
import { resolveUsageCostFromCandidates } from '#shared/platform/pricing'
import { PROJECT_USAGE_PLATFORMS } from '#shared/types/ai'
import { formatDuration, nowIsoString, useDateFormat } from '#shared/utils/date'
import { normalizeTimestampValue } from '#shared/utils/normalize'
import {
    getDurationMinutes,
    getMonthKey,
    getWeekLabel,
} from '#shared/utils/platform'
import { formatDateLabelFromDateKey, getDateKey, roundCurrency, sumCurrency } from '#shared/utils/usage-dashboard'

interface MutableSessionDetail {
    cachedInputTokens: number
    costUSD: number
    durationEndAt: string
    durationMinutes: number
    key: string
    inputTokens: number
    interactions: IndexedUsageInteraction[]
    lastActivity: string
    modelTotals: Map<string, number>
    models: string[]
    outputTokens: number
    project: string
    reasoningOutputTokens: number
    repository: string
    sessionId: string
    startedAt: string
    threadName: string
    tokenTotal: number
    topModel: string
}

export async function buildIncrementalUsageIndex(
    config: IConfig,
    repository: UsageCacheRepository,
    reporter?: UsageCleaningReporter,
    options: {
        cachedFiles?: IndexedUsageSourceFile[]
        cachedPlatformSessions?: Partial<ProjectUsagePlatformRecord<ProjectSessionUsageItem[]>>
        discoveredFiles?: DiscoveredUsageFile[]
        forceLog?: boolean
        hydrateCachedPricing?: boolean
        reparseAllFiles?: boolean
        updatedPlatforms?: readonly ProjectUsagePlatform[]
    } = {},
): Promise<IncrementalUsageIndexResult> {
    const timing = {
        aggregateMs: 0,
        discoveryMs: 0,
        parseMs: 0,
    }
    const shouldStartReporter = Boolean(reporter && options.forceLog)

    if (shouldStartReporter) {
        reporter!.start()
    }
    const discoveryStartedAt = Date.now()
    const discoveredFiles = options.discoveredFiles ?? await discoverUsageFiles(config)
    const discoveryFinishedAt = Date.now()

    if (shouldStartReporter) {
        reporter!.discoveredFiles({
            discoveredFiles: discoveredFiles.length,
        })
    }
    const cachedFilesStartedAt = Date.now()
    const cachedFiles = options.cachedFiles ?? null
    const hydratedCachedFiles = cachedFiles
        ? (options.hydrateCachedPricing
                ? await hydrateIndexedUsageSourceFiles(cachedFiles)
                : cachedFiles)
        : null
    const cachedFileMetas = hydratedCachedFiles ?? repository.loadSourceFileMetas()
    const cachedFilesFinishedAt = Date.now()
    const compareStartedAt = Date.now()
    const { cachedFilesByPath, changedFiles, removedFiles } = getUsageFileChanges(discoveredFiles, cachedFileMetas)
    const compareFinishedAt = Date.now()

    timing.parseMs += cachedFilesFinishedAt - cachedFilesStartedAt
    const filesToParse = (!hydratedCachedFiles || options.reparseAllFiles) ? discoveredFiles : changedFiles
    timing.discoveryMs = (discoveryFinishedAt - discoveryStartedAt) + (compareFinishedAt - compareStartedAt)
    const affectedProjects = new Set<string>(removedFiles.flatMap(file => file.projectNames))
    const hasFileChanges = changedFiles.length > 0 || removedFiles.length > 0
    const shouldReport = Boolean(reporter && (options.forceLog || hasFileChanges))
    const updatedPlatforms = options.updatedPlatforms ?? getUpdatedPlatforms(filesToParse, removedFiles)

    if (shouldReport && !shouldStartReporter) {
        reporter!.start()
        reporter!.discoveredFiles({
            discoveredFiles: discoveredFiles.length,
        })
    }

    if (shouldReport) {
        reporter!.foundFiles({
            cachedFiles: hydratedCachedFiles?.length ?? 0,
            changedFiles: filesToParse.length,
            discoveredFiles: discoveredFiles.length,
            removedFiles: removedFiles.length,
            updatedPlatforms,
        })
    }
    const activeReporter = shouldReport ? reporter : undefined
    const discoveredFileCountsByPlatform = countFilesByPlatform(discoveredFiles)

    if (filesToParse.length === 0 && removedFiles.length === 0 && hydratedCachedFiles) {
        const indexedFiles = hydratedCachedFiles.sort((a, b) => a.path.localeCompare(b.path))

        const aggregateStartedAt = Date.now()
        const bootstrapByPlatform = buildPlatformSessionsByPlatform(indexedFiles, {
            cachedPlatformSessions: options.cachedPlatformSessions,
            updatedPlatforms: PROJECT_USAGE_PLATFORMS,
        })
        const eventsByPlatform = buildEventsByPlatformFromFiles(indexedFiles)
        timing.aggregateMs = Date.now() - aggregateStartedAt

        return {
            affectedProjects: [],
            bootstrapByPlatform,
            eventsByPlatform,
            hasChanges: false,
            indexedFiles,
            timing,
            removedProjects: [],
            updatedSessions: [],
            updatedPlatforms,
        }
    }

    const parsedFiles: IndexedUsageSourceFile[] = []
    const pricingResolvers = new Map<ProjectUsagePlatform, ModelPricingResolver>()
    const updatedPlatformSessions: Partial<ProjectUsagePlatformRecord<ProjectSessionUsageItem[]>> = {}
    const updatedPlatformEvents: Partial<ProjectUsagePlatformRecord<UsageAggregateEvent[]>> = {}
    const parsedByPath = new Map<string, IndexedUsageSourceFile>()

    for (const platform of updatedPlatforms) {
        const platformFilesToParse = filesToParse.filter(file => file.platform === platform)
        const discoveredFilesForPlatform = discoveredFileCountsByPlatform[platform]

        if (discoveredFilesForPlatform > 0) {
            activeReporter?.startPlatform(platform, {
                discoveredFiles: discoveredFilesForPlatform,
            })
        }

        const parseStartedAt = Date.now()
        if (!pricingResolvers.has(platform)) {
            pricingResolvers.set(platform, await usagePlatformAdapters[platform].createPricingResolver())
        }
        const parsedPlatformFiles = await Promise.all(platformFilesToParse.map(file => parseUsageFile(file, pricingResolvers)))
        const resolvedPlatformFiles = await hydrateIndexedUsageSourceFiles(parsedPlatformFiles)
        const parseDurationMs = Date.now() - parseStartedAt

        timing.parseMs += parseDurationMs

        for (const file of resolvedPlatformFiles) {
            parsedFiles.push(file)
            parsedByPath.set(file.path, file)
        }

        if (discoveredFilesForPlatform > 0) {
            activeReporter?.parsedPlatformFiles(platform, {
                durationMs: parseDurationMs,
                parsedFiles: resolvedPlatformFiles.length,
            })
        }

        const aggregateStartedAt = Date.now()
        const platformIndexedFiles = discoveredFiles
            .filter(file => file.platform === platform)
            .map(file => parsedByPath.get(file.path) ?? (hydratedCachedFiles ? cachedFilesByPath.get(file.path) : undefined) ?? null)
            .filter((file): file is IndexedUsageSourceFile => file !== null)
        const dedupedInteractions = selectDedupedInteractions(platformIndexedFiles, platform)

        repository.deleteSessionsBySourceFiles(platformIndexedFiles.map(file => file.path))
        repository.upsertInteractions(dedupedInteractions.map(({ fragment, interaction }, index) => ({
            sessionId: fragment.sessionId,
            interactionIndex: interaction.index ?? index,
            platform,
            projectName: fragment.project,
            repository: fragment.repository,
            threadName: fragment.threadName,
            sessionStartedAt: fragment.startedAt,
            timestamp: interaction.timestamp,
            role: interaction.role,
            type: interaction.type,
            model: interaction.model,
            inputToken: interaction.usage?.inputTokens ?? 0,
            outputToken: interaction.usage?.outputTokens ?? 0,
            cachedInputToken: interaction.usage?.cachedInputTokens ?? 0,
            cacheCreation: interaction.usage?.cacheCreationTokens ?? 0,
            cacheRead: interaction.usage?.cacheReadTokens ?? 0,
            reasoningToken: interaction.usage?.reasoningOutputTokens ?? 0,
            totalToken: interaction.usage?.totalTokens ?? 0,
            provider: interaction.provider ?? null,
            rawCostUsd: interaction.rawCostUSD ?? (interaction.costUSD > 0 ? interaction.costUSD : null),
            speed: interaction.speed ?? null,
            isFallbackModel: interaction.usage?.isFallbackModel ?? false,
            toolTokens: interaction.usage?.toolTokens ?? 0,
            extraTotalTokens: interaction.usage?.extraTotalTokens ?? 0,
            dedupeKey: interaction.dedupeKey ?? null,
            fallbackDedupeKey: interaction.fallbackDedupeKey ?? null,
            sourceFile: platformIndexedFiles.find(f => f.payload.includes(fragment))?.path ?? null,
            isSidechain: interaction.isSidechain ?? false,
        })))

        const platformSessions = buildPlatformSessionsFromFiles(platformIndexedFiles, platform)
        const platformEvents = buildPlatformEvents(platformIndexedFiles, platform)

        timing.aggregateMs += Date.now() - aggregateStartedAt
        updatedPlatformSessions[platform] = platformSessions
        updatedPlatformEvents[platform] = platformEvents

        if (discoveredFilesForPlatform > 0) {
            const deltaStats = getPlatformDeltaStats(platform, resolvedPlatformFiles, cachedFilesByPath)
            activeReporter?.finishPlatform(platform, {
                durationMs: Date.now() - parseStartedAt,
                interactions: dedupedInteractions.length,
                newInteractions: deltaStats.newInteractions,
                newSessions: deltaStats.newSessions,
                sessions: platformSessions.length,
                updatedSessionIds: deltaStats.updatedSessionIds,
                updatedSessions: deltaStats.updatedSessions,
            })
        }
    }

    const changedFilePaths = new Set(changedFiles.map(file => file.path))
    const parsedChangedFiles = parsedFiles.filter(file => changedFilePaths.has(file.path))

    for (const file of changedFiles) {
        const cached = cachedFilesByPath.get(file.path)

        if (cached) {
            for (const projectName of cached.projectNames) {
                affectedProjects.add(projectName)
            }
        }
    }

    for (const file of parsedChangedFiles) {
        for (const projectName of file.projectNames) {
            affectedProjects.add(projectName)
        }
    }

    const indexedFiles = discoveredFiles
        .map((file) => {
            const changed = parsedByPath.get(file.path)

            if (changed) {
                return changed
            }

            return hydratedCachedFiles ? (cachedFilesByPath.get(file.path) ?? null) : null
        })
        .filter((file): file is IndexedUsageSourceFile => file !== null)
        .sort((a, b) => a.path.localeCompare(b.path))

    if (removedFiles.length > 0) {
        repository.deleteSourceFiles(removedFiles.map(file => file.path))
        repository.deleteSessionsBySourceFiles(removedFiles.map(file => file.path))
    }

    if (parsedChangedFiles.length > 0) {
        repository.upsertSourceFiles(parsedChangedFiles.map(file => ({
            hash: file.cacheSignature,
            mtimeMs: file.mtimeMs,
            path: file.path,
            platform: file.platform,
            size: file.size,
        })))
    }

    for (const platform of updatedPlatforms) {
        const platformFiles = indexedFiles.filter(file => file.platform === platform)
        const dedupedInteractions = selectDedupedInteractions(platformFiles, platform)

        repository.deleteSessionsBySourceFiles(platformFiles.map(file => file.path))
        repository.upsertInteractions(dedupedInteractions.map(({ fragment, interaction }, index) => ({
            sessionId: fragment.sessionId,
            interactionIndex: interaction.index ?? index,
            platform,
            projectName: fragment.project,
            repository: fragment.repository,
            threadName: fragment.threadName,
            sessionStartedAt: fragment.startedAt,
            timestamp: interaction.timestamp,
            role: interaction.role,
            type: interaction.type,
            model: interaction.model,
            inputToken: interaction.usage?.inputTokens ?? 0,
            outputToken: interaction.usage?.outputTokens ?? 0,
            cachedInputToken: interaction.usage?.cachedInputTokens ?? 0,
            cacheCreation: interaction.usage?.cacheCreationTokens ?? 0,
            cacheRead: interaction.usage?.cacheReadTokens ?? 0,
            reasoningToken: interaction.usage?.reasoningOutputTokens ?? 0,
            totalToken: interaction.usage?.totalTokens ?? 0,
            provider: interaction.provider ?? null,
            rawCostUsd: interaction.rawCostUSD ?? (interaction.costUSD > 0 ? interaction.costUSD : null),
            speed: interaction.speed ?? null,
            isFallbackModel: interaction.usage?.isFallbackModel ?? false,
            toolTokens: interaction.usage?.toolTokens ?? 0,
            extraTotalTokens: interaction.usage?.extraTotalTokens ?? 0,
            dedupeKey: interaction.dedupeKey ?? null,
            fallbackDedupeKey: interaction.fallbackDedupeKey ?? null,
            sourceFile: platformFiles.find(f => f.payload.includes(fragment))?.path ?? null,
            isSidechain: interaction.isSidechain ?? false,
        })))
    }

    const aggregateStartedAt = Date.now()
    const bootstrapByPlatform = buildPlatformSessionsByPlatform(indexedFiles, {
        cachedPlatformSessions: options.cachedPlatformSessions,
        updatedPlatformSessions,
        updatedPlatforms,
    })
    const eventsByPlatform = buildEventsByPlatformFromFiles(indexedFiles, updatedPlatformEvents)
    timing.aggregateMs = Date.now() - aggregateStartedAt
    const currentProjectNames = new Set(
        Object.values(bootstrapByPlatform).flatMap(sessions => sessions.map(session => session.project)),
    )
    const removedProjects = Array.from(affectedProjects).filter(projectName => !currentProjectNames.has(projectName))

    return {
        affectedProjects: Array.from(affectedProjects).sort((a, b) => a.localeCompare(b)),
        bootstrapByPlatform,
        eventsByPlatform,
        hasChanges: hasFileChanges,
        indexedFiles,
        timing,
        removedProjects,
        updatedSessions: collectUpdatedSessions(parsedChangedFiles, removedFiles),
        updatedPlatforms,
    }
}

export async function hydrateIndexedUsageSourceFiles(files: IndexedUsageSourceFile[]) {
    if (files.length === 0) {
        return files
    }

    const pricingResolvers = await createPricingResolversForPlatforms(files.map(file => file.platform))

    return files.map((file) => {
        const resolvePricing = pricingResolvers.get(file.platform)

        if (!resolvePricing) {
            return file
        }

        return {
            ...file,
            payload: file.payload.map(fragment => ({
                ...fragment,
                interactions: fragment.interactions.map((interaction): IndexedUsageInteraction => {
                    const usage = interaction.usage

                    if (!usage || !interaction.model) {
                        const rawCostUSD = interaction.rawCostUSD ?? (interaction.costUSD > 0 ? interaction.costUSD : null)

                        return {
                            ...interaction,
                            costSource: rawCostUSD != null ? 'raw' : 'none',
                            costUSD: rawCostUSD ?? 0,
                            usage: usage
                                ? {
                                        ...usage,
                                        costUSD: rawCostUSD ?? 0,
                                    }
                                : usage,
                        }
                    }

                    const cacheCreationTokens = usage.cacheCreationTokens ?? 0
                    const cacheReadTokens = usage.cacheReadTokens ?? Math.max(usage.cachedInputTokens - cacheCreationTokens, 0)
                    const { costSource, costUSD } = resolveUsageCostFromCandidates({
                        cacheCreationTokens,
                        cachedInputTokens: cacheReadTokens,
                        inputTokens: usage.inputTokens,
                        model: interaction.model,
                        modelLookupCandidates: interaction.modelLookupCandidates,
                        outputTokens: usage.outputTokens + usage.reasoningOutputTokens + (usage.extraTotalTokens ?? 0) + (usage.toolTokens ?? 0),
                        rawCostUSD: interaction.rawCostUSD ?? (interaction.costUSD > 0 ? interaction.costUSD : null),
                        speed: interaction.speed
                            ?? (file.platform === 'codex'
                                ? (file.cacheSignature === 'codex-speed:fast' ? 'fast' : 'standard')
                                : (interaction.model.endsWith('-fast') ? 'fast' : undefined)),
                    }, resolvePricing, {
                        defaultFastMultiplier: file.platform === 'codex' ? 2 : undefined,
                    })

                    return {
                        ...interaction,
                        costSource,
                        costUSD,
                        usage: {
                            ...usage,
                            costUSD,
                        },
                    }
                }),
            })),
        }
    })
}

export async function getUsageCacheUpdateState(
    config: IConfig,
    repository: UsageCacheRepository,
    cacheUpdatedAt: number,
    cachedFiles: IndexedUsageSourceFileMeta[] | IndexedUsageSourceFile[] = repository.loadSourceFileMetas(),
) {
    if (cacheUpdatedAt <= 0) {
        const discoveredFiles = await discoverUsageFiles(config)

        return {
            discoveredFiles,
            hasChanges: true,
            updatedPlatforms: getUpdatedPlatforms(discoveredFiles, []),
        }
    }

    const discoveredFiles = await discoverUsageFiles(config)
    const { changedFiles, removedFiles } = getUsageFileChanges(discoveredFiles, cachedFiles)
    const staleFiles = discoveredFiles.filter(file => file.mtimeMs > cacheUpdatedAt)

    return {
        discoveredFiles,
        hasChanges: changedFiles.length > 0 || removedFiles.length > 0 || staleFiles.length > 0,
        updatedPlatforms: getUpdatedPlatforms([...changedFiles, ...staleFiles], removedFiles),
    }
}

function getUsageFileChanges<TFile extends IndexedUsageSourceFileMeta>(
    discoveredFiles: DiscoveredUsageFile[],
    cachedFiles: TFile[],
) {
    const cachedFilesByPath = new Map(cachedFiles.map(file => [file.path, file]))
    const discoveredFilePaths = new Set(discoveredFiles.map(file => file.path))
    const changedFiles = discoveredFiles.filter((file) => {
        const cached = cachedFilesByPath.get(file.path)

        return !cached
            || cached.platform !== file.platform
            || cached.cacheSignature !== file.cacheSignature
            || cached.size !== file.size
            || cached.mtimeMs !== file.mtimeMs
    })
    const removedFiles = cachedFiles.filter(file => !discoveredFilePaths.has(file.path))

    return {
        cachedFiles: cachedFiles.length,
        cachedFilesByPath,
        changedFiles,
        removedFiles,
    }
}

export async function createPricingResolversForPlatforms(platforms: readonly ProjectUsagePlatform[]): Promise<Map<ProjectUsagePlatform, ModelPricingResolver>> {
    const uniquePlatforms = PROJECT_USAGE_PLATFORMS.filter(platform => platforms.includes(platform))
    const entries = await Promise.all(uniquePlatforms.map(async platform => [
        platform,
        await usagePlatformAdapters[platform].createPricingResolver(),
    ] as const))

    return new Map(entries)
}

async function discoverUsageFiles(config: IConfig) {
    const fileGroups = await Promise.all(PROJECT_USAGE_PLATFORMS.map(platform => usagePlatformAdapters[platform].discoverFiles(config)))

    return fileGroups
        .flat()
        .sort((a, b) => a.path.localeCompare(b.path))
}

function parseUsageFile(
    file: DiscoveredUsageFile,
    pricingResolvers: Map<ProjectUsagePlatform, ModelPricingResolver>,
): IndexedUsageSourceFile {
    const adapter = usagePlatformAdapters[file.platform]
    const resolvePricing = pricingResolvers.get(file.platform)

    if (!resolvePricing) {
        throw new Error(`Missing pricing resolver for platform ${file.platform}.`)
    }

    const payload = adapter.parseFile(file.path, resolvePricing, file)

    return {
        cacheSignature: file.cacheSignature,
        mtimeMs: file.mtimeMs,
        path: file.path,
        payload,
        platform: file.platform,
        projectNames: Array.from(new Set(payload.map(fragment => fragment.project))).sort((a, b) => a.localeCompare(b)),
        size: file.size,
        updatedAt: nowIsoString(),
    }
}

function buildEventsByPlatformFromFiles(
    indexedFiles: IndexedUsageSourceFile[],
    updatedPlatformEvents: Partial<ProjectUsagePlatformRecord<UsageAggregateEvent[]>> = {},
) {
    return Object.fromEntries(
        PROJECT_USAGE_PLATFORMS.map((platform) => {
            const updated = updatedPlatformEvents[platform]

            if (updated) {
                return [platform, updated]
            }

            return [platform, buildPlatformEvents(indexedFiles, platform)]
        }),
    ) as ProjectUsagePlatformRecord<UsageAggregateEvent[]>
}

export function buildPlatformEventsByPlatform(indexedFiles: IndexedUsageSourceFile[]) {
    return buildEventsByPlatformFromFiles(indexedFiles)
}

export function buildPlatformSessionsByPlatform(
    indexedFiles: IndexedUsageSourceFile[],
    options: {
        cachedPlatformSessions?: Partial<ProjectUsagePlatformRecord<ProjectSessionUsageItem[]>>
        updatedPlatformSessions?: Partial<ProjectUsagePlatformRecord<ProjectSessionUsageItem[]>>
        updatedPlatforms: readonly ProjectUsagePlatform[]
    },
) {
    return Object.fromEntries(
        PROJECT_USAGE_PLATFORMS.map((platform) => {
            const updatedSessions = options.updatedPlatformSessions?.[platform]

            if (updatedSessions) {
                return [platform, updatedSessions]
            }

            if (!options.updatedPlatforms.includes(platform) && options.cachedPlatformSessions?.[platform]) {
                return [platform, options.cachedPlatformSessions[platform]!]
            }

            const sessions = buildPlatformSessionsFromFiles(indexedFiles, platform)

            return [platform, sessions]
        }),
    ) as ProjectUsagePlatformRecord<ProjectSessionUsageItem[]>
}

function getPlatformDeltaStats(
    platform: ProjectUsagePlatform,
    parsedFiles: IndexedUsageSourceFile[],
    cachedFilesByPath: Map<string, IndexedUsageSourceFileMeta>,
) {
    const updatedSessions = new Set<string>()
    let newInteractions = 0
    let newSessions = 0

    for (const file of parsedFiles) {
        if (file.platform !== platform) {
            continue
        }

        const cachedFile = cachedFilesByPath.get(file.path)
        const cachedPayload = 'payload' in (cachedFile ?? {}) ? (cachedFile as IndexedUsageSourceFile).payload : []
        const cachedFragmentsByKey = new Map(cachedPayload.map(fragment => [fragment.key, fragment]))

        for (const fragment of file.payload) {
            const cachedFragment = cachedFragmentsByKey.get(fragment.key)

            if (!cachedFragment) {
                newSessions += 1
                newInteractions += fragment.interactions.length

                if (fragment.sessionId.trim()) {
                    updatedSessions.add(fragment.sessionId.trim())
                }
                continue
            }

            const cachedInteractionKeys = new Set(cachedFragment.interactions.map(createInteractionIdentityKey))
            const interactionDelta = fragment.interactions.reduce((sum, interaction) => {
                return sum + (cachedInteractionKeys.has(createInteractionIdentityKey(interaction)) ? 0 : 1)
            }, 0)

            if (interactionDelta > 0) {
                newInteractions += interactionDelta

                if (fragment.sessionId.trim()) {
                    updatedSessions.add(fragment.sessionId.trim())
                }
            }
        }
    }

    return {
        newInteractions,
        newSessions,
        updatedSessionIds: Array.from(updatedSessions).sort((a, b) => a.localeCompare(b)),
        updatedSessions: updatedSessions.size,
    }
}

function createInteractionIdentityKey(interaction: IndexedUsageInteraction) {
    return interaction.dedupeKey
        ?? interaction.fallbackDedupeKey
        ?? [
            interaction.index,
            interaction.timestamp ?? '',
            interaction.role,
            interaction.model ?? '',
            interaction.type,
            interaction.usage?.totalTokens ?? 0,
        ].join(':')
}

function countFilesByPlatform(files: Array<{ platform: ProjectUsagePlatform }>) {
    const counts = Object.fromEntries(PROJECT_USAGE_PLATFORMS.map(platform => [platform, 0])) as ProjectUsagePlatformRecord<number>

    for (const file of files) {
        counts[file.platform] += 1
    }

    return counts
}

function collectUpdatedSessions(
    parsedChangedFiles: IndexedUsageSourceFile[],
    _removedFiles: IndexedUsageSourceFileMeta[],
) {
    const sessions = new Map<string, UpdatedUsageSession>()

    for (const file of parsedChangedFiles) {
        for (const fragment of file.payload) {
            const sessionId = fragment.sessionId.trim()

            if (!sessionId) {
                continue
            }

            const key = `${file.platform}:${sessionId}`

            if (!sessions.has(key)) {
                sessions.set(key, {
                    platform: file.platform,
                    sessionId,
                })
            }
        }
    }

    return Array.from(sessions.values()).sort((a, b) => {
        if (a.platform !== b.platform) {
            return a.platform.localeCompare(b.platform)
        }

        return a.sessionId.localeCompare(b.sessionId)
    })
}

function getUpdatedPlatforms(
    changedFiles: Array<{ platform: ProjectUsagePlatform }>,
    removedFiles: Array<{ platform: ProjectUsagePlatform }>,
) {
    const platforms = new Set<ProjectUsagePlatform>([
        ...changedFiles.map(file => file.platform),
        ...removedFiles.map(file => file.platform),
    ])

    return PROJECT_USAGE_PLATFORMS.filter(platform => platforms.has(platform))
}

function buildPlatformSessionsFromFiles(
    indexedFiles: IndexedUsageSourceFile[],
    platform: ProjectUsagePlatform,
) {
    const details = new Map<string, MutableSessionDetail>()
    const selectedInteractions = selectDedupedInteractions(indexedFiles, platform)

    for (const { fragment, interaction } of selectedInteractions) {
        const detail = details.get(fragment.key) ?? createSessionDetail(fragment)

        if (fragment.durationEndAt && (!detail.durationEndAt || Date.parse(fragment.durationEndAt) > Date.parse(detail.durationEndAt))) {
            detail.durationEndAt = fragment.durationEndAt
        }

        addInteraction(detail, interaction)
        details.set(fragment.key, detail)
    }

    return Array.from(details.values())
        .map(finalizeSessionDetail)
        .filter(hasBillableSessionDetail)
        .map(toProjectSessionUsageItem)
        .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
}

function selectDedupedInteractions(indexedFiles: IndexedUsageSourceFile[], platform: ProjectUsagePlatform) {
    const seen = new Map<string, {
        fragment: IndexedUsageSessionFragment
        interaction: IndexedUsageInteraction
    }>()
    const result: Array<{
        fragment: IndexedUsageSessionFragment
        interaction: IndexedUsageInteraction
    }> = []

    function lookupEntry(interaction: IndexedUsageInteraction) {
        if (interaction.dedupeKey) {
            const entry = seen.get(interaction.dedupeKey)

            if (entry) {
                return entry
            }
        }

        if (interaction.fallbackDedupeKey) {
            return seen.get(interaction.fallbackDedupeKey)
        }

        return undefined
    }

    function storeEntry(interaction: IndexedUsageInteraction, entry: { fragment: IndexedUsageSessionFragment, interaction: IndexedUsageInteraction }) {
        if (interaction.dedupeKey) {
            seen.set(interaction.dedupeKey, entry)
        }

        if (interaction.fallbackDedupeKey) {
            seen.set(interaction.fallbackDedupeKey, entry)
        }
    }

    for (const file of indexedFiles) {
        if (file.platform !== platform) {
            continue
        }

        for (const fragment of file.payload) {
            for (const interaction of fragment.interactions) {
                if (!interaction.dedupeKey && !interaction.fallbackDedupeKey) {
                    result.push({ fragment, interaction })
                    continue
                }

                const existing = lookupEntry(interaction)

                if (!existing) {
                    storeEntry(interaction, { fragment, interaction })
                }
                else if (shouldReplaceDedupedInteraction(interaction, existing.interaction)) {
                    storeEntry(interaction, { fragment: existing.fragment, interaction })
                }
            }
        }
    }

    // Deduplicate entries (same entry can be referenced by multiple keys)
    const unique = new Set(seen.values())

    return [
        ...result,
        ...unique,
    ]
}

function shouldReplaceDedupedInteraction(candidate: IndexedUsageInteraction, existing: IndexedUsageInteraction) {
    if ((candidate.isSidechain ?? false) !== (existing.isSidechain ?? false)) {
        return existing.isSidechain === true
    }

    const candidateTotal = candidate.usage?.totalTokens ?? 0
    const existingTotal = existing.usage?.totalTokens ?? 0

    if (candidateTotal !== existingTotal) {
        return candidateTotal > existingTotal
    }

    const candidateIsFast = isFastModel(candidate.model)
    const existingIsFast = isFastModel(existing.model)

    if (candidateIsFast !== existingIsFast) {
        return candidateIsFast
    }

    return (candidate.rawCostUSD ?? candidate.costUSD) > (existing.rawCostUSD ?? existing.costUSD)
}

function isFastModel(model: string | null) {
    return model?.endsWith('-fast') ?? false
}

function createSessionDetail(fragment: IndexedUsageSessionFragment): MutableSessionDetail {
    return {
        cachedInputTokens: 0,
        costUSD: 0,
        durationEndAt: fragment.durationEndAt,
        durationMinutes: 0,
        key: fragment.key,
        inputTokens: 0,
        interactions: [],
        lastActivity: fragment.startedAt ?? '',
        modelTotals: new Map<string, number>(),
        models: [],
        outputTokens: 0,
        project: fragment.project,
        reasoningOutputTokens: 0,
        repository: fragment.repository,
        sessionId: fragment.sessionId,
        startedAt: fragment.startedAt ?? '',
        threadName: fragment.threadName,
        tokenTotal: 0,
        topModel: 'unknown',
    }
}

function addInteraction(detail: MutableSessionDetail, interaction: IndexedUsageInteraction) {
    detail.interactions.push(interaction)

    if (interaction.timestamp) {
        if (!detail.startedAt || Date.parse(interaction.timestamp) < Date.parse(detail.startedAt)) {
            detail.startedAt = interaction.timestamp
        }

        if (!detail.lastActivity || Date.parse(interaction.timestamp) > Date.parse(detail.lastActivity)) {
            detail.lastActivity = interaction.timestamp
        }
    }

    if (!interaction.usage) {
        return
    }

    detail.inputTokens += interaction.usage.inputTokens
    detail.cachedInputTokens += interaction.usage.cachedInputTokens
    detail.outputTokens += interaction.usage.outputTokens
    detail.reasoningOutputTokens += interaction.usage.reasoningOutputTokens
    detail.tokenTotal += interaction.usage.totalTokens
    detail.costUSD = sumCurrency(detail.costUSD, interaction.usage.costUSD)

    if (interaction.model) {
        detail.models = Array.from(new Set([...detail.models, interaction.model]))
        detail.modelTotals.set(
            interaction.model,
            (detail.modelTotals.get(interaction.model) ?? 0) + interaction.usage.totalTokens,
        )
    }
}

function finalizeSessionDetail(detail: MutableSessionDetail) {
    detail.costUSD = roundCurrency(detail.costUSD)
    detail.durationMinutes = getDurationMinutes(detail.startedAt, detail.durationEndAt || detail.lastActivity)
    detail.interactions = detail.interactions.sort((a, b) => {
        if (a.timestamp && b.timestamp) {
            return Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.index - b.index
        }

        return a.index - b.index
    })
    detail.topModel = Array.from(detail.modelTotals.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? 'unknown'
    detail.models = detail.models.sort((a, b) => a.localeCompare(b))

    return detail
}

function hasBillableSessionDetail(detail: MutableSessionDetail) {
    return detail.tokenTotal > 0 || detail.costUSD > 0
}

function toProjectSessionUsageItem(detail: MutableSessionDetail): ProjectSessionUsageItem {
    const startedAt = normalizeTimestampValue(detail.startedAt) ?? normalizeTimestampValue(detail.lastActivity) ?? '1970-01-01T00:00:00.000Z'
    const lastActivity = normalizeTimestampValue(detail.lastActivity) ?? startedAt
    const hasValidStartedAtDate = useDateFormat(startedAt) !== null
    const dateKey = hasValidStartedAtDate ? getDateKey(startedAt) : ''

    return {
        cachedInputTokens: detail.cachedInputTokens,
        costUSD: detail.costUSD,
        date: dateKey ? formatDateLabelFromDateKey(dateKey) : '',
        duration: formatDuration(detail.durationMinutes),
        durationMinutes: detail.durationMinutes,
        id: detail.key,
        inputTokens: detail.inputTokens,
        interactions: detail.interactions.map(({ dedupeKey: _dedupeKey, fallbackDedupeKey: _fallbackDedupeKey, isSidechain: _isSidechain, ...interaction }) => ({
            ...interaction,
            raw: null,
        })) as ProjectSessionInteractionItem[],
        lastActivity,
        model: detail.topModel,
        models: detail.models,
        month: hasValidStartedAtDate ? getMonthKey(startedAt) : '',
        outputTokens: detail.outputTokens,
        project: detail.project,
        reasoningOutputTokens: detail.reasoningOutputTokens,
        repository: detail.repository,
        sessionId: detail.sessionId,
        startedAt,
        topModel: detail.topModel,
        threadName: detail.threadName,
        tokenTotal: detail.tokenTotal,
        week: hasValidStartedAtDate ? getWeekLabel(startedAt) : '',
    }
}

function buildPlatformEvents(
    indexedFiles: IndexedUsageSourceFile[],
    platform: ProjectUsagePlatform,
): UsageAggregateEvent[] {
    return selectDedupedInteractions(indexedFiles, platform)
        .filter(({ interaction }) => interaction.usage && interaction.usage.totalTokens > 0 && interaction.timestamp)
        .map(({ fragment, interaction }) => ({
            cacheCreationTokens: interaction.usage!.cacheCreationTokens,
            cachedInputTokens: interaction.usage!.cachedInputTokens,
            costUSD: interaction.usage!.costUSD,
            inputTokens: interaction.usage!.inputTokens,
            isFallbackModel: interaction.usage!.isFallbackModel ?? false,
            model: interaction.model || 'unknown',
            modelLookupCandidates: interaction.modelLookupCandidates,
            outputTokens: interaction.usage!.outputTokens,
            project: fragment.project,
            provider: interaction.provider ?? null,
            rawCostUSD: interaction.rawCostUSD ?? null,
            reasoningOutputTokens: interaction.usage!.reasoningOutputTokens,
            repository: fragment.repository,
            sessionId: fragment.sessionId,
            speed: interaction.speed ?? null,
            timestamp: interaction.timestamp!,
            toolTokens: interaction.usage!.toolTokens,
            totalTokens: interaction.usage!.totalTokens,
        }))
}
