import type { TokensConsumptionResult } from '#shared/types/usage-dashboard'
import type { FSWatcher } from 'chokidar'
import type { WebSocketServer } from 'ws'

export interface CreateWebSocketServerResult {
    getData: () => Promise<TokensConsumptionResult>
    port: number
    watcher: FSWatcher
    wss: WebSocketServer
}
