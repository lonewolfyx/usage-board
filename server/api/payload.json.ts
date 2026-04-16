import { resolveConfig } from '~~/src/config'
import { createWebSocketServer } from '~~/src/ws'

export default lazyEventHandler(() => {
    const ws = createWebSocketServer(resolveConfig({
        'host': '127.0.0.1',
        'port': 7777,
        '--': undefined,
        'open': false,
    }))

    return defineEventHandler(async () => {
        return await (await ws).getData()
    })
})
