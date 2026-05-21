import type { ProjectUsagePlatform, ProjectUsagePlatformRecord } from '#shared/types/ai'
import type {
    UsageAggregateEvent,
} from '#shared/types/platform'
import type { ProjectDashboardScope, ProjectUsageCatalogType } from '#shared/types/project-dashboard'
import type {
    LoadUsageResult,
    ProjectInteractionUsage,
    ProjectPlatformUsage,
    ProjectSessionUsageItem,
    ProjectUsageDetail,
} from '#shared/types/usage-dashboard'
import type {
    ProjectUsageCatalogItem,
    ProjectUsageDataModule,
    ProjectUsageDataModulePayloadMap,
    ProjectUsageDataModuleResponse,
    ProjectUsageDataModulesResponse,
} from '#shared/types/ws'
import { PROJECT_USAGE_PLATFORMS } from '#shared/types/ai'
import { PROJECT_USAGE_DATA_MODULES } from '#shared/types/ws'
import { buildLoadUsageResult } from '#shared/utils/platform'
import { uniqueItems } from '#shared/utils/usage-dashboard'

const DEFAULT_PROJECT_USAGE_DATA_MODULE = 'session_list' satisfies ProjectUsageDataModule

export function buildProjectUsageDataModuleFromDetail(
    detail: ProjectUsageDetail,
    options: {
        module?: ProjectUsageDataModule
        modules?: ProjectUsageDataModule[]
        platform?: ProjectDashboardScope
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
        const data = buildProjectPlatformModule(detail, module, options.platform ?? 'all') as ProjectUsageDataModulePayloadMap[typeof module]

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
            buildProjectPlatformModule(detail, module, options.platform ?? 'all'),
        ])),
    }
}

export function buildProjectUsageDetailFromPlatformSessions(
    projectName: string,
    platformSessions: ProjectUsagePlatformRecord<ProjectSessionUsageItem[]>,
): ProjectUsageDetail {
    const analyzing = Object.fromEntries(
        PROJECT_USAGE_PLATFORMS.map(platform => [
            platform,
            {
                ...buildProjectLoadUsageResult(platformSessions[platform], platform),
                sessions: platformSessions[platform],
            },
        ]),
    ) as ProjectUsagePlatformRecord<ProjectPlatformUsage>
    const sessions = PROJECT_USAGE_PLATFORMS.flatMap(platform => platformSessions[platform])

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

function buildProjectPlatformModule(
    detail: ProjectUsageDetail,
    module: ProjectUsageDataModule,
    platform: ProjectDashboardScope,
) {
    if (platform !== 'all') {
        return buildPlatformModulePayload(detail.analyzing[platform], module)
    }

    if (module === 'session_list') {
        const sessions = getProjectDetailSessions(detail)
        const allUsage = buildProjectLoadUsageResult(sessions)
        const platformPayloads = buildProjectPlatformPayloadMap(detail, module)

        return {
            all: buildSessionListModulePayload(allUsage.sessionRows, sessions),
            ...platformPayloads,
        }
    }

    const allUsage = buildProjectLoadUsageResult(getProjectDetailSessions(detail))
    const platformPayloads = buildProjectPlatformPayloadMap(detail, module)

    return {
        all: buildLoadUsageModulePayload(allUsage, module),
        ...platformPayloads,
    }
}

function buildPlatformModulePayload(
    usage: ProjectPlatformUsage,
    module: ProjectUsageDataModule,
) {
    if (module === 'session_list') {
        return buildSessionListModulePayload(usage.sessionRows, usage.sessions)
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
    platform: ProjectDashboardScope = 'all',
) {
    if (platform !== 'all') {
        return detail.analyzing[platform].sessions
    }

    return PROJECT_USAGE_PLATFORMS
        .flatMap(currentPlatform => detail.analyzing[currentPlatform].sessions)
        .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
}

function assertProjectUsageDataModule(module: string): asserts module is ProjectUsageDataModule {
    if (!PROJECT_USAGE_DATA_MODULES.includes(module as ProjectUsageDataModule)) {
        throw new Error(`Unsupported project data module: ${module}.`)
    }
}

function assertProjectUsagePlatformScope(platform: string): asserts platform is ProjectDashboardScope {
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

function buildSessionListModulePayload(
    sessionRows: LoadUsageResult['sessionRows'],
    sessions: ProjectSessionUsageItem[],
) {
    const sessionList = sessions.map(({ interactions: _interactions, ...session }) => session)

    return {
        sessionRows,
        sessionUsage: sessionList,
        sessions: sessionList,
    }
}

function buildProjectPlatformPayloadMap(
    detail: ProjectUsageDetail,
    module: ProjectUsageDataModule,
) {
    return Object.fromEntries(
        PROJECT_USAGE_PLATFORMS.map(platform => [
            platform,
            buildPlatformModulePayload(detail.analyzing[platform], module),
        ]),
    ) as ProjectUsagePlatformRecord<ReturnType<typeof buildPlatformModulePayload>>
}

export function buildProjectLoadUsageResult(
    sessions: ProjectSessionUsageItem[],
    platform: ProjectUsagePlatform | 'all' = 'all',
): Omit<LoadUsageResult, 'sessionUsage'> & { sessionUsage: ProjectSessionUsageItem[] } {
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
