import type { IOptions } from '~~/src/types'
import cac from 'cac'
import { resolveConfig } from '~~/src/config'
import { name, version } from '../package.json' with { type: 'json' }

const cli = cac(name)

cli.command('', 'Start tokens usage analysis')
    .option('--host <host>', 'Host', { default: '127.0.0.1' })
    .option('--port <port>', 'Port', { default: 7777 })
    .option('--open', 'Open browser', { default: true })
    .action((options: IOptions) => {
        const config = resolveConfig(options)
        console.log(config)
    })

cli.help()
cli.version(version)
cli.parse()
