import type { TokensConsumptionResult } from '#shared/types/usage-dashboard'
import type { FSWatcher } from 'chokidar'

export interface CreateWebSocketServerResult {
    close: () => Promise<void>
    getData: () => Promise<TokensConsumptionResult>
    port: number
    watcher: FSWatcher
    watchedPaths: string[]
    wsPort: number
    wss: WebSocketServer
}
