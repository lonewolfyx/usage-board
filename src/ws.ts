import type { CreateWebSocketServerResult } from '#shared/types/ws'
import type { WebSocket } from 'ws'
import type { IConfig } from '~~/src/types'
import { watch } from 'chokidar'
import { getPort } from 'get-port-please'
import { WebSocketServer } from 'ws'
import { resolveTokensConsumption } from '~~/src/data-loader'
import { resolveWatchedPaths } from '~~/src/paths'

export async function createWebSocketServer(config: IConfig): Promise<CreateWebSocketServerResult> {
    const wsPort = await getPort({
        host: config.host,
        port: config.port,
    })

    const wss = new WebSocketServer({
        host: config.host,
        port: wsPort,
    })

    const watcher = watch(resolveWatchedPaths(config), {
        ignoreInitial: true,
    })

    const getData = async () => await resolveTokensConsumption(config)

    const wsClients = new Set<WebSocket>()
    wss.on('connection', (ws) => {
        wsClients.add(ws)
        console.log('Websocket client connected')
        ws.on('close', () => wsClients.delete(ws))
    })

    watcher.on('change', (event, path) => {
        console.log('Config change detected')
        wsClients.forEach((ws) => {
            ws.send(JSON.stringify({
                type: 'config-change',
                path,
            }))
        })
    })

    const close = async () => {
        await watcher.close()

        await new Promise<void>((resolve, reject) => {
            wss.close((error) => {
                if (error) {
                    reject(error)
                    return
                }

                resolve()
            })
        })
    }

    return {
        getData,
        port: wsPort,
        watcher,
        wss,
    }
}
