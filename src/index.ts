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

const cli = cac(name)

async function loadNitroListener(outputDir: string): Promise<NodeListener> {
    const entryPath = resolve(outputDir, 'server/index.mjs')

    const mod = await import(entryPath)
    return mod.listener
        ?? mod.middleware
        ?? mod.handler
        ?? mod.default
        ?? mod
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
        const lister = await loadNitroListener(outputDir)

        const app = createServer(async (req, res) => {
            await lister(req, res)
        })

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
