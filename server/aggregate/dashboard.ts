import type { UsageInteractionFact } from '#server/agents/shared/fact'
import type { ResolvedUsageCost } from '#server/pricing/cost'
import type { ProjectUsagePlatform, ProjectUsagePlatformRecord } from '#shared/types/ai'
import type { UsageAggregateEvent } from '#shared/types/platform'
import type { ProjectSessionInteractionItem, ProjectSessionUsageItem, TokensConsumptionResult } from '#shared/types/usage-dashboard'
import type { ProjectUsageCatalogItem } from '#shared/types/ws'
import { resolveUsageFactCost } from '#server/pricing/cost'
import { createEmptyLoadUsageResult } from '#shared/platform/defaults'
import { buildProjectLoadUsageResult, buildProjectUsageDataModuleFromDetail, buildProjectUsageDetailFromPlatformSessions } from '#shared/platform/project'
import { PROJECT_USAGE_PLATFORMS } from '#shared/types/ai'
import { buildHomeDashboardModules } from '#shared/utils/analysis-dashboard'
import { formatDuration, getWeekLabel, useDateFormat } from '#shared/utils/date'
import { formatDateLabelFromDateKey, getDateKey, roundCurrency } from '#shared/utils/usage-dashboard'
import { createUsageSessionIdentity } from '#shared/utils/usage-identity'

interface CostedUsageFact extends UsageInteractionFact {
    cost: ResolvedUsageCost
}

interface DashboardState {
    bootstrap: TokensConsumptionResult
    eventsByPlatform: ProjectUsagePlatformRecord<UsageAggregateEvent[]>
    missingPricingModels: string[]
    platformSessions: ProjectUsagePlatformRecord<ProjectSessionUsageItem[]>
    projectCatalog: ProjectUsageCatalogItem[]
}

export function buildDashboardState(
    version: string,
    facts: UsageInteractionFact[],
    resolvePricing: Parameters<typeof resolveUsageFactCost>[1],
): DashboardState {
    const costedFacts = dedupeFacts(facts).map(fact => ({
        ...fact,
        cost: resolveUsageFactCost(fact, resolvePricing, {
            defaultFastMultiplier: fact.platform === 'codex' ? 2 : undefined,
        }),
    }))
    const platformSessions = Object.fromEntries(
        PROJECT_USAGE_PLATFORMS.map(platform => [
            platform,
            buildPlatformSessions(costedFacts.filter(fact => fact.platform === platform)),
        ]),
    ) as ProjectUsagePlatformRecord<ProjectSessionUsageItem[]>
    const eventsByPlatform = Object.fromEntries(
        PROJECT_USAGE_PLATFORMS.map(platform => [
            platform,
            buildPlatformEvents(costedFacts.filter(fact => fact.platform === platform)),
        ]),
    ) as ProjectUsagePlatformRecord<UsageAggregateEvent[]>
    const bootstrap = {
        ...Object.fromEntries(PROJECT_USAGE_PLATFORMS.map(platform => [
            platform,
            buildProjectLoadUsageResult(platformSessions[platform], platform, eventsByPlatform[platform]) ?? createEmptyLoadUsageResult(),
        ])),
        version,
    } as TokensConsumptionResult

    return {
        bootstrap,
        eventsByPlatform,
        missingPricingModels: Array.from(new Set(costedFacts.flatMap(fact => fact.cost.missingPricingModel ? [fact.cost.missingPricingModel] : []))).sort((left, right) => left.localeCompare(right)),
        platformSessions,
        projectCatalog: buildProjectCatalog(platformSessions),
    }
}

export function buildHomeModules(state: DashboardState) {
    return buildHomeDashboardModules(state.bootstrap)
}

export function buildProjectModules(
    state: DashboardState,
    request: Parameters<typeof buildProjectUsageDataModuleFromDetail>[1] & { project: string },
) {
    const projectLabel = request.project.trim()

    if (!projectLabel) {
        throw new Error('Missing project name for project data request.')
    }

    const platformSessions = Object.fromEntries(
        PROJECT_USAGE_PLATFORMS.map(platform => [
            platform,
            state.platformSessions[platform].filter(session => session.project === projectLabel),
        ]),
    ) as ProjectUsagePlatformRecord<ProjectSessionUsageItem[]>

    if (!PROJECT_USAGE_PLATFORMS.some(platform => platformSessions[platform].length > 0)) {
        return null
    }

    const eventsByPlatform = Object.fromEntries(
        PROJECT_USAGE_PLATFORMS.map(platform => [
            platform,
            state.eventsByPlatform[platform].filter(event => event.project === projectLabel),
        ]),
    ) as ProjectUsagePlatformRecord<UsageAggregateEvent[]>

    return buildProjectUsageDataModuleFromDetail(
        buildProjectUsageDetailFromPlatformSessions(projectLabel, platformSessions, eventsByPlatform),
        request,
    )
}

function dedupeFacts(facts: UsageInteractionFact[]) {
    // Port of ccusage's `push_deduped_entry` (rust/crates/ccusage/src/adapter/claude/mod.rs).
    // Each fact is indexed under its exact dedupeKey AND its fallbackDedupeKey (ccusage's
    // `(message_id, None)` hash). Lookup tries the exact key first, then the fallback key
    // which only matches across request-id variants when either side is a sidechain entry
    // (sidechain logs replay parent messages with new request IDs). Conflict resolution
    // mirrors ccusage's `should_replace_deduped_entry` exactly so daily totals match.
    const deduped: UsageInteractionFact[] = []
    const exactByKey = new Map<string, number[]>()
    const fallbackByKey = new Map<string, number[]>()

    const pushIndex = (map: Map<string, number[]>, key: string, index: number) => {
        const indexes = map.get(key)

        if (indexes) {
            if (!indexes.includes(index)) {
                indexes.push(index)
            }
        }
        else {
            map.set(key, [index])
        }
    }

    for (const fact of facts) {
        const exactKey = fact.dedupeKey
        const fallbackKey = fact.fallbackDedupeKey

        if (!exactKey && !fallbackKey) {
            deduped.push(fact)
            continue
        }

        let foundIndex = -1

        if (exactKey) {
            const indexes = exactByKey.get(exactKey)

            if (indexes) {
                for (const index of indexes) {
                    if (deduped[index]!.dedupeKey === exactKey) {
                        foundIndex = index
                        break
                    }
                }
            }
        }

        if (foundIndex === -1 && fallbackKey) {
            const indexes = fallbackByKey.get(fallbackKey)

            if (indexes) {
                for (const index of indexes) {
                    const existing = deduped[index]!

                    if (existing.fallbackDedupeKey === fallbackKey && (fact.isSidechain || existing.isSidechain)) {
                        foundIndex = index
                        break
                    }
                }
            }
        }

        if (foundIndex !== -1) {
            const index = foundIndex

            if (shouldReplaceFact(fact, deduped[index]!)) {
                deduped[index] = fact

                if (fact.dedupeKey) {
                    pushIndex(exactByKey, fact.dedupeKey, index)
                }

                if (fact.fallbackDedupeKey) {
                    pushIndex(fallbackByKey, fact.fallbackDedupeKey, index)
                }
            }
        }
        else {
            const index = deduped.length

            deduped.push(fact)

            if (fact.dedupeKey) {
                pushIndex(exactByKey, fact.dedupeKey, index)
            }

            if (fact.fallbackDedupeKey) {
                pushIndex(fallbackByKey, fact.fallbackDedupeKey, index)
            }
        }
    }

    return deduped.sort((left, right) =>
        left.platform.localeCompare(right.platform)
        || left.sourceFile.localeCompare(right.sourceFile)
        || left.interactionIndex - right.interactionIndex,
    )
}

function shouldReplaceFact(candidate: UsageInteractionFact, existing: UsageInteractionFact) {
    // Mirrors ccusage `should_replace_deduped_entry`:
    // 1. non-sidechain always wins over sidechain (a zero-usage main placeholder beats a
    //    nonzero-usage sidechain row sharing the same message id);
    // 2. otherwise keep the larger token total;
    // 3. otherwise keep the entry that carries a speed field.
    if (candidate.isSidechain !== existing.isSidechain) {
        return existing.isSidechain
    }

    if (candidate.usage.totalTokens !== existing.usage.totalTokens) {
        return candidate.usage.totalTokens > existing.usage.totalTokens
    }

    const candidateCost = candidate.rawCostUSD ?? 0
    const existingCost = existing.rawCostUSD ?? 0

    if (candidateCost !== existingCost) {
        return candidateCost > existingCost
    }

    return hasSpeed(candidate) && !hasSpeed(existing)
}

function hasSpeed(fact: UsageInteractionFact) {
    return fact.hasSpeed !== false
}

function buildPlatformSessions(facts: CostedUsageFact[]) {
    const sessions = new Map<string, CostedUsageFact[]>()

    for (const fact of facts) {
        const key = createUsageSessionIdentity({
            platform: fact.platform,
            repository: fact.repository,
            sessionId: fact.sessionId,
        })
        const list = sessions.get(key) ?? []
        list.push(fact)
        sessions.set(key, list)
    }

    return Array.from(sessions.values())
        .map(toSessionUsageItem)
        .filter(session => session.tokenTotal > 0 || session.costUSD > 0)
        .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))
}

function toSessionUsageItem(facts: CostedUsageFact[]): ProjectSessionUsageItem {
    const sortedFacts = [...facts].sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp) || left.interactionIndex - right.interactionIndex)
    const first = sortedFacts[0]!
    const startedAt = sortedFacts[0]?.timestamp ?? ''
    const lastActivity = sortedFacts.at(-1)?.timestamp ?? startedAt
    const models = Array.from(new Set(sortedFacts.flatMap(fact => fact.model ? [fact.model] : []))).sort((left, right) => left.localeCompare(right))
    const modelTotals = new Map<string, number>()
    let inputTokens = 0
    let cachedInputTokens = 0
    let outputTokens = 0
    let reasoningOutputTokens = 0
    let tokenTotal = 0
    let costUSD = 0

    for (const fact of sortedFacts) {
        inputTokens += fact.usage.inputTokens
        cachedInputTokens += fact.usage.cacheCreationTokens + fact.usage.cacheReadTokens
        outputTokens += fact.usage.outputTokens
        reasoningOutputTokens += fact.usage.reasoningOutputTokens
        tokenTotal += fact.usage.totalTokens
        costUSD += fact.cost.costUSD

        if (fact.model) {
            modelTotals.set(fact.model, (modelTotals.get(fact.model) ?? 0) + fact.usage.totalTokens)
        }
    }

    const topModel = Array.from(modelTotals.entries())
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? 'unknown'
    const durationMinutes = Math.max(Math.round((Date.parse(lastActivity) - Date.parse(startedAt)) / 60_000), 0)
    const dateKey = getDateKey(startedAt)
    const id = createUsageSessionIdentity({
        platform: first.platform,
        repository: first.repository,
        sessionId: first.sessionId,
    })

    return {
        cachedInputTokens,
        costUSD: roundCurrency(costUSD),
        date: formatDateLabelFromDateKey(dateKey),
        duration: formatDuration(durationMinutes),
        durationMinutes,
        id,
        inputTokens,
        interactions: sortedFacts.map(toSessionInteractionItem),
        lastActivity,
        model: topModel,
        models,
        month: useDateFormat(startedAt, 'month-key') ?? '',
        outputTokens,
        project: first.project,
        reasoningOutputTokens,
        repository: first.repository,
        sessionId: first.sessionId,
        startedAt,
        threadName: first.threadName,
        tokenTotal,
        topModel,
        week: getWeekLabel(startedAt),
    }
}

function toSessionInteractionItem(fact: CostedUsageFact): ProjectSessionInteractionItem {
    return {
        content: '',
        costSource: fact.cost.costSource,
        costUSD: fact.cost.costUSD,
        index: fact.interactionIndex,
        model: fact.model,
        provider: fact.provider,
        raw: null,
        rawCostUSD: fact.rawCostUSD,
        role: toProjectInteractionRole(fact.role),
        speed: fact.speed,
        timestamp: fact.timestamp,
        type: fact.type,
        usage: {
            cachedInputTokens: fact.usage.cacheCreationTokens + fact.usage.cacheReadTokens,
            cacheCreationTokens: fact.usage.cacheCreationTokens,
            cacheReadTokens: fact.usage.cacheReadTokens,
            costUSD: fact.cost.costUSD,
            extraTotalTokens: fact.usage.extraTotalTokens,
            inputTokens: fact.usage.inputTokens,
            isFallbackModel: fact.cost.costSource === 'none',
            outputTokens: fact.usage.outputTokens,
            reasoningOutputTokens: fact.usage.reasoningOutputTokens,
            toolTokens: fact.usage.toolTokens,
            totalTokens: fact.usage.totalTokens,
        },
    }
}

function buildPlatformEvents(facts: CostedUsageFact[]): UsageAggregateEvent[] {
    return facts
        .filter(fact => fact.usage.totalTokens > 0)
        .map(fact => ({
            cachedInputTokens: fact.usage.cacheCreationTokens + fact.usage.cacheReadTokens,
            cacheCreationTokens: fact.usage.cacheCreationTokens,
            costUSD: fact.cost.costUSD,
            inputTokens: fact.usage.inputTokens,
            isFallbackModel: fact.cost.costSource === 'none',
            model: fact.model ?? 'unknown',
            modelLookupCandidates: fact.modelLookupCandidates,
            outputTokens: fact.usage.outputTokens,
            project: fact.project,
            provider: fact.provider,
            rawCostUSD: fact.rawCostUSD,
            reasoningOutputTokens: fact.usage.reasoningOutputTokens,
            repository: fact.repository,
            sessionId: createUsageSessionIdentity({
                platform: fact.platform,
                repository: fact.repository,
                sessionId: fact.sessionId,
            }),
            speed: fact.speed,
            timestamp: fact.timestamp,
            toolTokens: fact.usage.toolTokens,
            totalTokens: fact.usage.totalTokens,
        }))
}

function buildProjectCatalog(platformSessions: ProjectUsagePlatformRecord<ProjectSessionUsageItem[]>): ProjectUsageCatalogItem[] {
    const projects = new Map<string, {
        platforms: Set<ProjectUsagePlatform>
        totalTokens: number
    }>()

    for (const platform of PROJECT_USAGE_PLATFORMS) {
        for (const session of platformSessions[platform]) {
            const project = projects.get(session.project) ?? {
                platforms: new Set<ProjectUsagePlatform>(),
                totalTokens: 0,
            }

            project.platforms.add(platform)
            project.totalTokens += session.tokenTotal
            projects.set(session.project, project)
        }
    }

    return Array.from(projects.entries())
        .map(([label, project]) => ({
            label,
            platforms: Array.from(project.platforms).sort((left, right) => left.localeCompare(right)),
            totalTokens: project.totalTokens,
        }))
        .sort((left, right) => left.label.localeCompare(right.label))
}

function toProjectInteractionRole(role: string) {
    return role === 'assistant'
        || role === 'system'
        || role === 'tool'
        || role === 'usage'
        || role === 'user'
        ? role
        : 'unknown'
}
