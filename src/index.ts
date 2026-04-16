import type { IOptions } from '~~/src/types'
import cac from 'cac'
import { getPort } from 'get-port-please'
import { resolveConfig } from '~~/src/config'
import { createHostServer } from '~~/src/server'
import { name, version } from '../package.json' with { type: 'json' }

const cli = cac(name)

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

        const app = createHostServer({
            ...config,
            port,
        })

        app.listen(port, config.host, () => {
            console.log(`Usage board is running at http://${config.host}:${port}`)
        })
    })

cli.help()
cli.version(version)
cli.parse()
