import type { ProjectUsagePlatform, ProjectUsagePlatformRecord } from '#shared/types/ai'
import type {
    UsageAggregateEvent,
} from '#shared/types/platform'
import type { ProjectDashboardScope } from '#shared/types/project-dashboard'
import type {
    LoadUsageResult,
    ProjectPlatformUsage,
    ProjectSessionUsageItem,
    ProjectUsageDetail,
} from '#shared/types/usage-dashboard'
import type {
    ProjectUsageDataModule,
    ProjectUsageDataModulePayloadMap,
    ProjectUsageDataModuleResponse,
    ProjectUsageDataModulesResponse,
} from '#shared/types/ws'
import type { PaginationInput } from '#shared/utils/pagination'
import {
    createEmptyProjectPlatformUsage,
    normalizeProjectUsageDetail,
} from '#shared/platform/defaults'
import { PROJECT_USAGE_PLATFORMS } from '#shared/types/ai'
import { PROJECT_USAGE_DATA_MODULES } from '#shared/types/ws'
import { paginateItems } from '#shared/utils/pagination'
import { buildLoadUsageResult } from '#shared/utils/platform'
import { mergeDailyTokenUsage, mergeMonthlyModelUsage, uniqueItems } from '#shared/utils/usage-dashboard'

const DEFAULT_PROJECT_USAGE_DATA_MODULE = 'session_list' satisfies ProjectUsageDataModule

export function buildProjectUsageDataModuleFromDetail(
    detail: ProjectUsageDetail,
    options: {
        module?: ProjectUsageDataModule
        modules?: ProjectUsageDataModule[]
        page?: number
        pageSize?: number
        platform?: ProjectDashboardScope
    },
): ProjectUsageDataModuleResponse | ProjectUsageDataModulesResponse {
    const normalizedDetail = normalizeProjectUsageDetail(detail)
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
        const data = buildProjectPlatformModule(normalizedDetail, module, options.platform ?? 'all', options) as ProjectUsageDataModulePayloadMap[typeof module]

        return {
            data,
            label: normalizedDetail.label,
            module,
        } as ProjectUsageDataModuleResponse
    }

    return {
        label: normalizedDetail.label,
        modules: Object.fromEntries(modules.map(module => [
            module,
            buildProjectPlatformModule(normalizedDetail, module, options.platform ?? 'all', options),
        ])),
    }
}

export function buildProjectUsageDetailFromPlatformSessions(
    projectName: string,
    platformSessions: ProjectUsagePlatformRecord<ProjectSessionUsageItem[]>,
    eventsByPlatform: ProjectUsagePlatformRecord<UsageAggregateEvent[]>,
): ProjectUsageDetail {
    const analyzing = Object.fromEntries(
        PROJECT_USAGE_PLATFORMS.map(platform => [
            platform,
            {
                ...buildProjectLoadUsageResult(platformSessions[platform], platform, eventsByPlatform[platform]),
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
        sessionCount: sessions.length,
    }
}

function buildProjectPlatformModule(
    detail: ProjectUsageDetail,
    module: ProjectUsageDataModule,
    platform: ProjectDashboardScope,
    pagination: PaginationInput,
) {
    if (platform !== 'all') {
        return buildPlatformModulePayload(detail.analyzing[platform] ?? createEmptyProjectPlatformUsage(), module, pagination)
    }

    const platformUsages = PROJECT_USAGE_PLATFORMS.map(platform => detail.analyzing[platform] ?? createEmptyProjectPlatformUsage())

    if (module === 'session_list') {
        const sessions = platformUsages.flatMap(usage => usage.sessions)
        const sessionRows = platformUsages.flatMap(usage => usage.sessionRows)
        const platformPayloads = buildProjectPlatformPayloadMap(detail, module, pagination)

        return {
            all: buildSessionListModulePayload(sessionRows, sessions, pagination),
            ...platformPayloads,
        }
    }

    const mergedUsage: LoadUsageResult = {
        dailyRows: platformUsages.flatMap(usage => usage.dailyRows).sort((a, b) => a.id.localeCompare(b.id)),
        dailyTokenUsage: mergeDailyTokenUsage(platformUsages.flatMap(usage => usage.dailyTokenUsage)),
        monthlyModelUsage: mergeMonthlyModelUsage(platformUsages.flatMap(usage => usage.monthlyModelUsage)),
        monthlyRows: platformUsages.flatMap(usage => usage.monthlyRows).sort((a, b) => a.id.localeCompare(b.id)),
        overviewCards: [],
        projectUsage: [],
        sessionRows: platformUsages.flatMap(usage => usage.sessionRows),
        sessionUsage: platformUsages.flatMap(usage => usage.sessionUsage),
        todayTopModel: null,
        todayTopProject: null,
        todayTotalCost: 0,
        todayTotalTokens: 0,
        weeklyRows: platformUsages.flatMap(usage => usage.weeklyRows).sort((a, b) => a.id.localeCompare(b.id)),
    }
    const platformPayloads = buildProjectPlatformPayloadMap(detail, module, pagination)

    return {
        all: buildLoadUsageModulePayload(mergedUsage, module, pagination),
        ...platformPayloads,
    }
}

function buildPlatformModulePayload(
    usage: ProjectPlatformUsage,
    module: ProjectUsageDataModule,
    pagination: PaginationInput,
) {
    if (module === 'session_list') {
        return buildSessionListModulePayload(usage.sessionRows, usage.sessions, pagination)
    }

    return buildLoadUsageModulePayload(usage, module, pagination)
}

function buildLoadUsageModulePayload(
    usage: LoadUsageResult,
    module: Exclude<ProjectUsageDataModule, 'session_list'>,
    pagination: PaginationInput,
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
            dailyRows: paginateItems(usage.dailyRows, pagination),
            monthlyRows: paginateItems(usage.monthlyRows, pagination),
            sessionRows: paginateItems(usage.sessionRows, pagination),
            weeklyRows: paginateItems(usage.weeklyRows, pagination),
        }),
    } satisfies Record<typeof module, () => unknown>

    return modulePayloadBuilders[module]()
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

function buildSessionListModulePayload(
    sessionRows: LoadUsageResult['sessionRows'],
    sessions: ProjectSessionUsageItem[],
    pagination: PaginationInput,
) {
    const sessionList = sessions.map(({ interactions: _interactions, ...session }) => session)

    return {
        sessionRows: paginateItems(sessionRows, pagination),
        sessionUsage: paginateItems(sessionList, pagination),
        sessions: sessionList,
    }
}

function buildProjectPlatformPayloadMap(
    detail: ProjectUsageDetail,
    module: ProjectUsageDataModule,
    pagination: PaginationInput,
) {
    return Object.fromEntries(
        PROJECT_USAGE_PLATFORMS.map(platform => [
            platform,
            buildPlatformModulePayload(detail.analyzing[platform] ?? createEmptyProjectPlatformUsage(), module, pagination),
        ]),
    ) as ProjectUsagePlatformRecord<ReturnType<typeof buildPlatformModulePayload>>
}

export function buildProjectLoadUsageResult(
    sessions: ProjectSessionUsageItem[],
    platform: ProjectUsagePlatform | 'all' = 'all',
    precomputedEvents: UsageAggregateEvent[] = [],
): Omit<LoadUsageResult, 'sessionUsage'> & { sessionUsage: ProjectSessionUsageItem[] } {
    const usage = buildLoadUsageResult(precomputedEvents, sessions, {
        aggregateOptions: {
            includeModel: event => platform !== 'claudeCode' || event.model !== '<synthetic>',
        },
    })

    return {
        ...usage,
        sessionUsage: sessions,
    }
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
