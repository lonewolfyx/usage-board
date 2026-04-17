import type { IOptions } from '~~/src/types'
import cac from 'cac'
import { getPort } from 'get-port-please'
import open from 'open'
import { resolveConfig } from '~~/src/config'
import { createHostServer } from '~~/src/server'
import { name, version } from '../package.json' with { type: 'json' }

const cli = cac(name)

function resolveUrl(host: string, port: number) {
    const urlHost = host === '0.0.0.0' || host === '::'
        ? 'localhost'
        : host.includes(':')
            ? `[${host}]`
            : host

    return `http://${urlHost}:${port}`
}

cli.command('', 'Start tokens usage analysis')
    .option('--host <host>', 'Host', { default: '127.0.0.1' })
    .option('--port <port>', 'Port', { default: 7777 })
    .option('--open', 'Open browser', { default: true })
    .action(async (options: IOptions) => {
        const config = resolveConfig(options)
        const port = await getPort({
            host: config.host,
            port: config.port,
        })

        const app = await createHostServer({
            ...config,
            port,
        })

        app.listen(port, config.host, async () => {
            const url = resolveUrl(config.host, port)
            console.log(`Usage board is running at ${url}`)

            if (config.open) {
                try {
                    await open(url)
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : String(error)
                    console.warn(`Unable to open the browser automatically: ${message}`)
                    console.warn(`Open ${url} manually.`)
                }
            }
        })
    })

cli.help()
cli.version(version)
cli.parse()
