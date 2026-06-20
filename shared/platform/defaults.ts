import type { ProjectUsagePlatformRecord } from '#shared/types/ai'
import type {
    LoadUsageResult,
    ProjectPlatformUsage,
    ProjectUsageDetail,
} from '#shared/types/usage-dashboard'
import { PROJECT_USAGE_PLATFORMS } from '#shared/types/ai'

export function createEmptyLoadUsageResult(): LoadUsageResult {
    return {
        dailyRows: [],
        dailyTokenUsage: [],
        monthlyModelUsage: [],
        monthlyRows: [],
        overviewCards: [],
        projectUsage: [],
        sessionRows: [],
        sessionUsage: [],
        todayTopModel: null,
        todayTopProject: null,
        todayTotalCost: 0,
        todayTotalTokens: 0,
        weeklyRows: [],
    }
}

export function createEmptyProjectPlatformUsage(): ProjectPlatformUsage {
    return {
        ...createEmptyLoadUsageResult(),
        sessionUsage: [],
        sessions: [],
    }
}

export function normalizeProjectPlatformUsage(value: Partial<ProjectPlatformUsage> | null | undefined): ProjectPlatformUsage {
    const empty = createEmptyProjectPlatformUsage()

    if (!value) {
        return empty
    }

    return {
        ...empty,
        ...value,
        sessionUsage: Array.isArray(value.sessionUsage) ? value.sessionUsage : [],
        sessions: Array.isArray(value.sessions) ? value.sessions : [],
    }
}

export function normalizeProjectUsageDetail(detail: ProjectUsageDetail): ProjectUsageDetail {
    const analyzing = PROJECT_USAGE_PLATFORMS.reduce<ProjectUsagePlatformRecord<ProjectPlatformUsage>>((result, platform) => {
        result[platform] = normalizeProjectPlatformUsage(detail.analyzing?.[platform])
        return result
    }, {} as ProjectUsagePlatformRecord<ProjectPlatformUsage>)

    return {
        ...detail,
        all: normalizeProjectPlatformUsage(detail.all),
        analyzing,
        models: Array.isArray(detail.models) ? detail.models : [],
    }
}
