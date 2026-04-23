import type {
    ProjectDailyTrendModulePayload,
    ProjectDashboardScope,
    ProjectMetaModule,
    ProjectModelUsageModulePayload,
    ProjectOverviewCardsModulePayload,
    ProjectPlatformModulePayload,
    ProjectSessionInteractionsModulePayload,
    ProjectSessionListModulePayload,
    ProjectTokenUsageModulePayload,
    ProjectUsageCatalogType,
} from '#shared/types/project-dashboard'
import type { TokensConsumptionResult } from '#shared/types/usage-dashboard'
import type { FSWatcher } from 'chokidar'
import type { WebSocketServer } from 'ws'

export interface CreateWebSocketServerResult {
    getData: () => Promise<TokensConsumptionResult>
    port: number
    watcher: FSWatcher
    wss: WebSocketServer
}

export interface ProjectUsageCatalogItem {
    label: string
    type: ProjectUsageCatalogType
    path: string[]
}

export type ProjectUsageDataModule
    = | 'daily_trend'
        | 'meta'
        | 'model_usage'
        | 'overview_cards'
        | 'session_interactions'
        | 'session_list'
        | 'token_usage'

export type ProjectUsageDataPlatformScope = ProjectDashboardScope

export interface ProjectUsageDataModulePayloadMap {
    daily_trend: ProjectPlatformModulePayload<ProjectDailyTrendModulePayload>
    meta: ProjectMetaModule
    model_usage: ProjectPlatformModulePayload<ProjectModelUsageModulePayload>
    overview_cards: ProjectPlatformModulePayload<ProjectOverviewCardsModulePayload>
    session_interactions: ProjectSessionInteractionsModulePayload | null
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
        label?: string
        module?: ProjectUsageDataModule
        modules?: ProjectUsageDataModule[]
        path?: string[]
        project?: string
        requestId?: string
        sessionId?: string
        platform?: ProjectUsageDataPlatformScope
    }
