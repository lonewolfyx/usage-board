import type { ProjectUsagePlatform } from '#shared/types/ai'
import type { TokensConsumptionResult } from '#shared/types/usage-dashboard'
import type { FSWatcher } from 'chokidar'
import type { WebSocketServer } from 'ws'

export interface CreateWebSocketServerResult {
    getData: () => Promise<TokensConsumptionResult>
    port: number
    watcher: FSWatcher
    wss: WebSocketServer
}

export type ProjectUsageCatalogType = ProjectUsagePlatform | 'mixed'

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

export type ProjectUsageDataPlatformScope = ProjectUsagePlatform | 'all'

export interface ProjectUsageDataModuleResponse {
    data: unknown
    label: string
    module: ProjectUsageDataModule
}

export interface ProjectUsageDataModulesResponse {
    label: string
    modules: Partial<Record<ProjectUsageDataModule, unknown>>
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
