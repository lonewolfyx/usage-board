import type { ProjectUsagePlatform } from '#shared/types/ai'
import type {
    UsageAggregateEvent,
} from '#shared/types/platform'
import type { ProjectUsageCatalogType } from '#shared/types/project-dashboard'
import type {
    LoadUsageResult,
    ProjectInteractionUsage,
    ProjectPlatformUsage,
    ProjectSessionUsageItem,
    ProjectUsageAnalyzing,
    ProjectUsageDetail,
} from '#shared/types/usage-dashboard'
import type {
    ProjectUsageCatalogItem,
    ProjectUsageDataModule,
    ProjectUsageDataModulePayloadMap,
    ProjectUsageDataModuleResponse,
    ProjectUsageDataModulesResponse,
    ProjectUsageDataPlatformScope,
} from '#shared/types/ws'
import { buildLoadUsageResult } from '#shared/utils/platform'

const PROJECT_USAGE_PLATFORMS = ['claudeCode', 'codex', 'gemini'] satisfies ProjectUsagePlatform[]

const DEFAULT_PROJECT_USAGE_DATA_MODULE = 'session_list' satisfies ProjectUsageDataModule

const PROJECT_USAGE_DATA_MODULES = [
    'daily_trend',
    'model_usage',
    'session_list',
    'token_usage',
] satisfies ProjectUsageDataModule[]

type ProjectLoadUsageResult = Omit<LoadUsageResult, 'sessionUsage'> & {
    sessionUsage: ProjectSessionUsageItem[]
}

export function buildProjectUsageDataModuleFromDetail(
    detail: ProjectUsageDetail,
    options: {
        module?: ProjectUsageDataModule
        modules?: ProjectUsageDataModule[]
        platform?: ProjectUsageDataPlatformScope
    },
): ProjectUsageDataModuleResponse | ProjectUsageDataModulesResponse {
    const modules = uniqueItems(options.modules?.length
        ? options.modules
        : [options.module ?? DEFAULT_PROJECT_USAGE_DATA_MODULE])

    for (const module of modules) {
        assertProjectUsageDataModule(module)
    }

    if (options.platform) {
        assertProjectUsagePlatformScope(options.platform)
    }

    if (modules.length === 1) {
        const module = modules[0]!
        const data = buildProjectUsageDataModule(detail, module, options) as ProjectUsageDataModulePayloadMap[typeof module]

        return {
            data,
            label: detail.label,
            module,
        } as ProjectUsageDataModuleResponse
    }

    return {
        label: detail.label,
        modules: Object.fromEntries(modules.map(module => [
            module,
            buildProjectUsageDataModule(detail, module, options),
        ])),
    }
}

export function buildPlatformLoadUsageResult(
    sessions: ProjectSessionUsageItem[],
    platform: ProjectUsagePlatform,
): LoadUsageResult {
    return buildProjectLoadUsageResult(sessions, platform)
}

export function buildProjectUsageDetailFromPlatformSessions(
    projectName: string,
    platformSessions: Record<ProjectUsagePlatform, ProjectSessionUsageItem[]>,
): ProjectUsageDetail {
    const analyzing: ProjectUsageAnalyzing = {
        claudeCode: {
            ...buildProjectLoadUsageResult(platformSessions.claudeCode, 'claudeCode'),
            sessions: platformSessions.claudeCode,
        },
        codex: {
            ...buildProjectLoadUsageResult(platformSessions.codex, 'codex'),
            sessions: platformSessions.codex,
        },
        gemini: {
            ...buildProjectLoadUsageResult(platformSessions.gemini, 'gemini'),
            sessions: platformSessions.gemini,
        },
    }
    const sessions = [
        ...platformSessions.claudeCode,
        ...platformSessions.codex,
        ...platformSessions.gemini,
    ]

    return {
        analyzing,
        createTime: getEarliestStartedAt(sessions),
        label: projectName,
        models: collectSessionModels(sessions),
        sessionCound: sessions.length,
    }
}

export function buildProjectUsageCatalogItemsFromDetails(
    details: Iterable<[string, ProjectUsageDetail]>,
): ProjectUsageCatalogItem[] {
    return Array.from(details)
        .map(([label, detail]) => {
            return {
                label,
                type: getProjectCatalogType(getProjectDetailPlatforms(detail)),
            }
        })
        .sort((a, b) => a.label.localeCompare(b.label))
}

function buildProjectUsageDataModule(
    detail: ProjectUsageDetail,
    module: ProjectUsageDataModule,
    options: {
        platform?: ProjectUsageDataPlatformScope
    },
) {
    return buildProjectPlatformModule(detail, module, options.platform ?? 'all')
}

function buildProjectPlatformModule(
    detail: ProjectUsageDetail,
    module: ProjectUsageDataModule,
    platform: ProjectUsageDataPlatformScope,
) {
    if (platform !== 'all') {
        return buildPlatformModulePayload(detail.analyzing[platform], module)
    }

    if (module === 'session_list') {
        const sessions = getProjectDetailSessions(detail)
        const allUsage = buildProjectLoadUsageResult(sessions)

        return {
            all: {
                sessionRows: allUsage.sessionRows,
                sessionUsage: sessions.map(toProjectSessionListItem),
                sessions: sessions.map(toProjectSessionListItem),
            },
            claudeCode: buildPlatformModulePayload(detail.analyzing.claudeCode, module),
            codex: buildPlatformModulePayload(detail.analyzing.codex, module),
            gemini: buildPlatformModulePayload(detail.analyzing.gemini, module),
        }
    }

    const allUsage = buildProjectLoadUsageResult(getProjectDetailSessions(detail))

    return {
        all: buildLoadUsageModulePayload(allUsage, module),
        claudeCode: buildPlatformModulePayload(detail.analyzing.claudeCode, module),
        codex: buildPlatformModulePayload(detail.analyzing.codex, module),
        gemini: buildPlatformModulePayload(detail.analyzing.gemini, module),
    }
}

function buildPlatformModulePayload(
    usage: ProjectPlatformUsage,
    module: ProjectUsageDataModule,
) {
    if (module === 'session_list') {
        return {
            sessionRows: usage.sessionRows,
            sessionUsage: usage.sessions.map(toProjectSessionListItem),
            sessions: usage.sessions.map(toProjectSessionListItem),
        }
    }

    return buildLoadUsageModulePayload(usage, module)
}

function buildLoadUsageModulePayload(
    usage: LoadUsageResult,
    module: Exclude<ProjectUsageDataModule, 'session_list'>,
) {
    const modulePayloadBuilders = {
        daily_trend: () => ({
            dailyRows: usage.dailyRows,
            dailyTokenUsage: usage.dailyTokenUsage,
        }),
        model_usage: () => ({
            dailyTokenUsage: usage.dailyTokenUsage,
            monthlyModelUsage: usage.monthlyModelUsage,
        }),
        token_usage: () => ({
            dailyRows: usage.dailyRows,
            monthlyRows: usage.monthlyRows,
            sessionRows: usage.sessionRows,
            weeklyRows: usage.weeklyRows,
        }),
    } satisfies Record<typeof module, () => unknown>

    return modulePayloadBuilders[module]()
}

function getProjectDetailSessions(
    detail: ProjectUsageDetail,
    platform: ProjectUsageDataPlatformScope = 'all',
) {
    if (platform !== 'all') {
        return detail.analyzing[platform].sessions
    }

    return [
        ...detail.analyzing.claudeCode.sessions,
        ...detail.analyzing.codex.sessions,
        ...detail.analyzing.gemini.sessions,
    ].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
}

function toProjectSessionListItem(session: ProjectSessionUsageItem) {
    const { interactions: _interactions, ...item } = session

    return item
}

function assertProjectUsageDataModule(module: string): asserts module is ProjectUsageDataModule {
    if (!PROJECT_USAGE_DATA_MODULES.includes(module as ProjectUsageDataModule)) {
        throw new Error(`Unsupported project data module: ${module}.`)
    }
}

function assertProjectUsagePlatformScope(platform: string): asserts platform is ProjectUsageDataPlatformScope {
    if (platform !== 'all' && !PROJECT_USAGE_PLATFORMS.includes(platform as ProjectUsagePlatform)) {
        throw new Error(`Unsupported project data platform: ${platform}.`)
    }
}

function getProjectDetailPlatforms(detail: ProjectUsageDetail): ProjectUsagePlatform[] {
    return PROJECT_USAGE_PLATFORMS.filter(platform => detail.analyzing[platform].sessions.length > 0)
}

function getProjectCatalogType(platforms: ProjectUsagePlatform[]): ProjectUsageCatalogType {
    return platforms.length === 1 ? platforms[0]! : 'mixed'
}

function buildProjectLoadUsageResult(
    sessions: ProjectSessionUsageItem[],
    platform: ProjectUsagePlatform | 'all' = 'all',
): ProjectLoadUsageResult {
    const usage = buildLoadUsageResult(getProjectAggregateEvents(sessions), sessions, {
        aggregateOptions: {
            includeModel: event => platform !== 'claudeCode' || event.model !== '<synthetic>',
        },
    })

    return {
        ...usage,
        sessionUsage: sessions,
    }
}

interface ProjectAggregateEvent extends UsageAggregateEvent {
    costUSD: number
}

function getProjectAggregateEvents(sessions: ProjectSessionUsageItem[]): ProjectAggregateEvent[] {
    return sessions
        .flatMap(session => session.interactions
            .filter(interaction => interaction.usage && interaction.timestamp && hasBillableUsage(interaction.usage))
            .map((interaction): ProjectAggregateEvent => ({
                cachedInputTokens: interaction.usage!.cachedInputTokens,
                costUSD: interaction.usage!.costUSD,
                inputTokens: interaction.usage!.inputTokens,
                isFallbackModel: interaction.usage!.isFallbackModel ?? false,
                model: interaction.model ?? session.model,
                outputTokens: interaction.usage!.outputTokens,
                project: session.project,
                reasoningOutputTokens: interaction.usage!.reasoningOutputTokens,
                repository: session.repository,
                sessionId: session.sessionId,
                timestamp: interaction.timestamp!,
                totalTokens: interaction.usage!.totalTokens,
            })))
        .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
}

function hasBillableUsage(usage: ProjectInteractionUsage) {
    return usage.totalTokens > 0 || usage.costUSD > 0
}

function collectSessionModels(sessions: ProjectSessionUsageItem[]) {
    return uniqueItems(sessions.flatMap(session => session.models)).sort((a, b) => a.localeCompare(b))
}

function getEarliestStartedAt(sessions: Array<{ startedAt: string }>) {
    return sessions
        .map(session => session.startedAt)
        .filter(timestamp => Number.isFinite(Date.parse(timestamp)))
        .sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null
}

function uniqueItems<T>(items: T[]) {
    return Array.from(new Set(items))
}
