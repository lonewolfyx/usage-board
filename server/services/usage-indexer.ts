import type { UsageCacheRepository } from '#server/repositories/sqlite/usage-cache.repository'
import type { UsageCleaningReporter } from '#server/services/usage-cleaning-reporter'
import type { DiscoveredUsageFile } from '#server/services/usage-indexer/platform-adapter'
import type {
    IncrementalUsageIndexResult,
    IndexedUsageInteraction,
    IndexedUsageSessionFragment,
    IndexedUsageSourceFile,
    UpdatedUsageSession,
} from '#server/types/usage-indexer'
import type { ProjectUsagePlatform, ProjectUsagePlatformRecord } from '#shared/types/ai'
import type { IConfig } from '#shared/types/config'
import type { ModelPricingResolver } from '#shared/types/platform'
import type { ProjectSessionInteractionItem, ProjectSessionUsageItem } from '#shared/types/usage-dashboard'
import { usagePlatformAdapters } from '#server/services/usage-indexer/adapters'
import { calculateUsageCostUSD } from '#shared/platform/pricing'
import { PROJECT_USAGE_PLATFORMS } from '#shared/types/ai'
import { normalizeTimestampValue } from '#shared/utils/normalize'
import {
    formatDuration,
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

    if (shouldStartReporter) {
        reporter!.discoveredFiles({
            discoveredFiles: discoveredFiles.length,
        })
    }
    const cachedFiles = options.cachedFiles ?? repository.loadIndexedSourceFiles()
    const cachedFilesStartedAt = Date.now()
    const hydratedCachedFiles = options.hydrateCachedPricing
        ? await hydrateIndexedUsageSourceFiles(cachedFiles)
        : cachedFiles

    timing.parseMs += Date.now() - cachedFilesStartedAt
    const { cachedFilesByPath, changedFiles, removedFiles } = getUsageFileChanges(discoveredFiles, hydratedCachedFiles)
    const filesToParse = options.reparseAllFiles ? discoveredFiles : changedFiles
    timing.discoveryMs = Date.now() - discoveryStartedAt
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
            cachedFiles: hydratedCachedFiles.length,
            changedFiles: filesToParse.length,
            discoveredFiles: discoveredFiles.length,
            removedFiles: removedFiles.length,
            updatedPlatforms,
        })
    }
    const activeReporter = shouldReport ? reporter : undefined
    const discoveredFileCountsByPlatform = countFilesByPlatform(discoveredFiles)
    // const changedFileCountsByPlatform = countFilesByPlatform(filesToParse)

    if (filesToParse.length === 0 && removedFiles.length === 0) {
        const indexedFiles = hydratedCachedFiles.sort((a, b) => a.path.localeCompare(b.path))

        const aggregateStartedAt = Date.now()
        const bootstrapByPlatform = buildPlatformSessionsByPlatform(indexedFiles, {
            cachedPlatformSessions: options.hydrateCachedPricing ? undefined : options.cachedPlatformSessions,
            updatedPlatforms,
        })
        timing.aggregateMs = Date.now() - aggregateStartedAt

        return {
            affectedProjects: [],
            bootstrapByPlatform,
            hasChanges: false,
            indexedFiles,
            timing,
            removedProjects: [],
            updatedSessions: [],
            updatedPlatforms,
        }
    }

    const parsedFiles: IndexedUsageSourceFile[] = []
    const updatedPlatformSessions: Partial<ProjectUsagePlatformRecord<ProjectSessionUsageItem[]>> = {}
    const pricingResolvers = await createPricingResolversForPlatforms(filesToParse.map(file => file.platform))
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
        const parsedPlatformFiles = await Promise.all(platformFilesToParse.map(file => parseUsageFile(file, pricingResolvers)))

        timing.parseMs += Date.now() - parseStartedAt

        for (const file of parsedPlatformFiles) {
            parsedFiles.push(file)
            parsedByPath.set(file.path, file)
        }

        if (discoveredFilesForPlatform > 0) {
            activeReporter?.parsedPlatformFiles(platform, {
                parsedFiles: parsedPlatformFiles.length,
            })
        }

        const aggregateStartedAt = Date.now()
        const platformIndexedFiles = discoveredFiles
            .filter(file => file.platform === platform)
            .map(file => parsedByPath.get(file.path) ?? cachedFilesByPath.get(file.path) ?? null)
            .filter((file): file is IndexedUsageSourceFile => file !== null)
        const platformSessions = buildPlatformSessionsFromFiles(platformIndexedFiles, platform)

        timing.aggregateMs += Date.now() - aggregateStartedAt
        updatedPlatformSessions[platform] = platformSessions

        if (discoveredFilesForPlatform > 0) {
            const deltaStats = getPlatformDeltaStats(platform, parsedPlatformFiles, cachedFilesByPath)
            activeReporter?.finishPlatform(platform, {
                interactions: platformSessions.reduce((sum, session) => sum + session.interactions.length, 0),
                newInteractions: deltaStats.newInteractions,
                newSessions: deltaStats.newSessions,
                sessions: platformSessions.length,
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

            return cachedFilesByPath.get(file.path) ?? null
        })
        .filter((file): file is IndexedUsageSourceFile => file !== null)
        .sort((a, b) => a.path.localeCompare(b.path))

    if (removedFiles.length > 0) {
        repository.deleteIndexedSourceFiles(removedFiles.map(file => file.path))
    }

    if (parsedChangedFiles.length > 0) {
        repository.upsertIndexedSourceFiles(parsedChangedFiles)
    }

    const bootstrapByPlatform = buildPlatformSessionsByPlatform(indexedFiles, {
        cachedPlatformSessions: options.hydrateCachedPricing ? undefined : options.cachedPlatformSessions,
        updatedPlatformSessions,
        updatedPlatforms,
    })
    const currentProjectNames = new Set(
        Object.values(bootstrapByPlatform).flatMap(sessions => sessions.map(session => session.project)),
    )
    const removedProjects = Array.from(affectedProjects).filter(projectName => !currentProjectNames.has(projectName))

    return {
        affectedProjects: Array.from(affectedProjects).sort((a, b) => a.localeCompare(b)),
        bootstrapByPlatform,
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
                interactions: fragment.interactions.map((interaction) => {
                    const usage = interaction.usage

                    if (!usage || !interaction.model) {
                        return {
                            ...interaction,
                            costUSD: 0,
                            usage,
                        }
                    }

                    const cacheCreationTokens = usage.cacheCreationTokens ?? 0
                    const cacheReadTokens = usage.cacheReadTokens ?? Math.max(usage.cachedInputTokens - cacheCreationTokens, 0)
                    const outputTokens = usage.outputTokens + usage.reasoningOutputTokens + (usage.extraTotalTokens ?? 0) + (usage.toolTokens ?? 0)
                    const costUSD = calculateUsageCostUSD({
                        cacheCreationTokens,
                        cachedInputTokens: cacheReadTokens,
                        inputTokens: usage.inputTokens,
                        outputTokens,
                    }, resolvePricing(interaction.model), {
                        defaultFastMultiplier: file.platform === 'codex' ? 2 : undefined,
                        speed: file.platform === 'codex'
                            ? (file.cacheSignature === 'codex-speed:fast' ? 'fast' : 'standard')
                            : (interaction.model.endsWith('-fast') ? 'fast' : undefined),
                    })

                    return {
                        ...interaction,
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
    const cachedFiles = repository.loadIndexedSourceFiles()
    const { changedFiles, removedFiles } = getUsageFileChanges(discoveredFiles, cachedFiles)
    const staleFiles = discoveredFiles.filter(file => file.mtimeMs > cacheUpdatedAt)

    return {
        discoveredFiles,
        hasChanges: changedFiles.length > 0 || removedFiles.length > 0 || staleFiles.length > 0,
        updatedPlatforms: getUpdatedPlatforms([...changedFiles, ...staleFiles], removedFiles),
    }
}

function getUsageFileChanges(
    discoveredFiles: DiscoveredUsageFile[],
    cachedFiles: IndexedUsageSourceFile[],
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

async function createPricingResolversForPlatforms(platforms: ProjectUsagePlatform[]): Promise<Map<ProjectUsagePlatform, ModelPricingResolver>> {
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
        updatedAt: new Date().toISOString(),
    }
}

function buildPlatformSessionsByPlatform(
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
    cachedFilesByPath: Map<string, IndexedUsageSourceFile>,
) {
    const updatedSessions = new Set<string>()
    let newInteractions = 0
    let newSessions = 0

    for (const file of parsedFiles) {
        if (file.platform !== platform) {
            continue
        }

        const cachedFile = cachedFilesByPath.get(file.path)
        const cachedFragmentsByKey = new Map((cachedFile?.payload ?? []).map(fragment => [fragment.key, fragment]))

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
    removedFiles: IndexedUsageSourceFile[],
) {
    const sessions = new Map<string, UpdatedUsageSession>()

    for (const file of [...parsedChangedFiles, ...removedFiles]) {
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
    const interactionsWithoutDedupeKey: Array<{
        fragment: IndexedUsageSessionFragment
        interaction: IndexedUsageInteraction
    }> = []
    const interactionsByDedupeKey = new Map<string, {
        fragment: IndexedUsageSessionFragment
        interaction: IndexedUsageInteraction
    }>()
    const interactionsByFallbackDedupeKey = new Map<string, {
        fragment: IndexedUsageSessionFragment
        interaction: IndexedUsageInteraction
    }>()

    for (const file of indexedFiles) {
        if (file.platform !== platform) {
            continue
        }

        for (const fragment of file.payload) {
            for (const interaction of fragment.interactions) {
                if (!interaction.dedupeKey && !interaction.fallbackDedupeKey) {
                    interactionsWithoutDedupeKey.push({ fragment, interaction })
                    continue
                }

                const existing = (interaction.dedupeKey
                    ? interactionsByDedupeKey.get(interaction.dedupeKey)
                    : undefined)
                ?? (interaction.fallbackDedupeKey
                    ? interactionsByFallbackDedupeKey.get(interaction.fallbackDedupeKey)
                    : undefined)

                if (!existing) {
                    if (interaction.dedupeKey) {
                        interactionsByDedupeKey.set(interaction.dedupeKey, { fragment, interaction })
                    }
                    if (interaction.fallbackDedupeKey) {
                        interactionsByFallbackDedupeKey.set(interaction.fallbackDedupeKey, { fragment, interaction })
                    }
                }
                else if (shouldReplaceDedupedInteraction(interaction, existing.interaction)) {
                    // Pin attribution to the first-seen fragment so the winning interaction
                    // doesn't migrate across sessions and silently empty the loser.
                    const next = { fragment: existing.fragment, interaction }

                    if (existing.interaction.dedupeKey) {
                        interactionsByDedupeKey.set(existing.interaction.dedupeKey, next)
                    }
                    if (existing.interaction.fallbackDedupeKey) {
                        interactionsByFallbackDedupeKey.set(existing.interaction.fallbackDedupeKey, next)
                    }
                    if (interaction.dedupeKey) {
                        interactionsByDedupeKey.set(interaction.dedupeKey, next)
                    }
                    if (interaction.fallbackDedupeKey) {
                        interactionsByFallbackDedupeKey.set(interaction.fallbackDedupeKey, next)
                    }
                }
            }
        }
    }

    return [
        ...interactionsWithoutDedupeKey,
        ...new Set(interactionsByDedupeKey.values()),
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

    return candidate.costUSD > existing.costUSD
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
    const startedAt = normalizeTimestampValue(detail.startedAt) ?? normalizeTimestampValue(detail.lastActivity) ?? new Date(0).toISOString()
    const lastActivity = normalizeTimestampValue(detail.lastActivity) ?? startedAt
    const startedAtDate = new Date(startedAt)
    const hasValidStartedAtDate = Number.isFinite(startedAtDate.getTime())
    const dateKey = hasValidStartedAtDate ? getDateKey(startedAtDate) : ''

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
        month: hasValidStartedAtDate ? getMonthKey(startedAtDate) : '',
        outputTokens: detail.outputTokens,
        project: detail.project,
        reasoningOutputTokens: detail.reasoningOutputTokens,
        repository: detail.repository,
        sessionId: detail.sessionId,
        startedAt,
        topModel: detail.topModel,
        threadName: detail.threadName,
        tokenTotal: detail.tokenTotal,
        week: hasValidStartedAtDate ? getWeekLabel(startedAtDate) : '',
    }
}
