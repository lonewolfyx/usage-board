import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import cac from 'cac'
import { createRuntimeServer } from 'nuxt-devkit-server'
import open from 'open'
import { name, version } from '../package.json' with { type: 'json' }

const cli = cac(name)

export interface IOptions {
    '--': any
    'host': string
    'port': number
    'open': boolean
}

cli.command('', 'Start tokens usage analysis')
    .option('--host <host>', 'Host', { default: '127.0.0.1' })
    .option('--port <port>', 'Port', { default: 7777 })
    .option('--open', 'Open browser', { default: true })
    .action(async (option: IOptions) => {
        const root = dirname(fileURLToPath(import.meta.url))
        const outputDir = resolve(root, './')

        await createRuntimeServer({
            path: outputDir,
            host: option.host,
            port: option.port,
            onReady: async ({ app }) => {
                if (option.open) {
                    console.log(`Usage board is running at ${app.url}`)
                    await open(app.url)
                }
            },
        })
    })

cli.help()
cli.version(version)
cli.parse()
