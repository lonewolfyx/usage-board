import type { IncomingMessage, ServerResponse } from 'node:http'
import type { IOptions } from '~~/src/types'
import { createServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import cac from 'cac'
import { getPort } from 'get-port-please'
import open from 'open'
import { name, version } from '../package.json' with { type: 'json' }

type NodeListener = (
    req: IncomingMessage,
    res: ServerResponse,
) => void | Promise<void>

interface NitroEntrypoint {
    listener?: unknown
    middleware?: unknown
    handler?: unknown
    default?: unknown
    websocket?: unknown
}

interface LoadedNitroEntrypoint {
    listener: NodeListener
    websocket?: unknown
}

const cli = cac(name)

function isNodeListener(value: unknown): value is NodeListener {
    return typeof value === 'function'
}

async function loadNitroEntrypoint(outputDir: string): Promise<LoadedNitroEntrypoint> {
    const entryPath = resolve(outputDir, 'server/index.mjs')

    const mod = await import(entryPath)
    const listener
        = mod.listener
            ?? mod.middleware
            ?? mod.handler
            ?? mod.default

    return {
        listener,
        websocket: mod.websocket,
    }
}

cli.command('', 'Start tokens usage analysis')
    .option('--host <host>', 'Host', { default: '127.0.0.1' })
    .option('--port <port>', 'Port', { default: 7777 })
    .option('--open', 'Open browser', { default: true })
    .action(async (option: IOptions) => {
        const port = await getPort({
            port: option.port,
            portRange: [7777, 9000],
        })

        const root = dirname(fileURLToPath(import.meta.url))
        const outputDir = resolve(root, './')
        const nitro = await loadNitroEntrypoint(outputDir)

        const app = createServer(async (req, res) => {
            await nitro.listener(req, res)
        })

        if (nitro.websocket) {
            const { default: wsAdapter } = await import('crossws/adapters/node')
            const { handleUpgrade } = wsAdapter(nitro.websocket as never)
            app.on('upgrade', handleUpgrade)
        }

        app.listen(port, option.host, async () => {
            if (option.open) {
                const url = `http://${option.host}:${port}`
                console.log(`Usage board is running at ${url}`)
                await open(url)
            }
        })
    })

cli.help()
cli.version(version)
cli.parse()
