import type {
    ProjectDailyTrendModulePayload,
    ProjectDashboardScope,
    ProjectModelUsageModulePayload,
    ProjectPlatformModulePayload,
    ProjectSessionListModulePayload,
    ProjectTokenUsageModulePayload,
    ProjectUsageCatalogType,
} from '#shared/types/project-dashboard'

export interface ProjectUsageCatalogItem {
    label: string
    type: ProjectUsageCatalogType
}

export type ProjectUsageDataModule
    = | 'daily_trend'
        | 'model_usage'
        | 'session_list'
        | 'token_usage'

export type ProjectUsageDataPlatformScope = ProjectDashboardScope

export interface ProjectUsageDataModulePayloadMap {
    daily_trend: ProjectPlatformModulePayload<ProjectDailyTrendModulePayload>
    model_usage: ProjectPlatformModulePayload<ProjectModelUsageModulePayload>
    session_list: ProjectPlatformModulePayload<ProjectSessionListModulePayload>
    token_usage: ProjectPlatformModulePayload<ProjectTokenUsageModulePayload>
}

export type ProjectUsageDataModuleResponse<T extends ProjectUsageDataModule = ProjectUsageDataModule>
    = T extends ProjectUsageDataModule ? {
        data: ProjectUsageDataModulePayloadMap[T]
        label: string
        module: T
    }
        : never

export interface ProjectUsageDataModulesResponse {
    label: string
    modules: Partial<ProjectUsageDataModulePayloadMap>
}

export interface ProjectWebSocketResponse<T = unknown> {
    data: T
    requestId: string
}

export type ProjectWebSocketRequest
    = | {
        requestId?: string
        type: 'project'
    }
    | {
        type: 'project_data'
        module?: ProjectUsageDataModule
        modules?: ProjectUsageDataModule[]
        project?: string
        requestId?: string
        platform?: ProjectUsageDataPlatformScope
    }
