import type { IConfig, IOptions } from '~~/src/types'
import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { H3, serveStatic } from 'h3'
import { toNodeHandler } from 'h3/node'
import { distDir } from '~~/src/dirs'

type HostServerOptions = IOptions | IConfig

export function createHostServer(_options: HostServerOptions) {
    const app = new H3()

    const fileMap = new Map<string, Promise<string | undefined>>()
    const readCachedFile = (id: string) => {
        if (!fileMap.has(id)) {
            fileMap.set(
                id,
                readFile(id, 'utf-8').catch(() => undefined),
            )
        }
        return fileMap.get(id)
    }

    app.get('/api/payload.json', () => {
        return {
            data: null,
            meta: {
                status: 'TODO',
            },
        }
    })

    app.get('/**', async (event) => {
        const result = await serveStatic(event, {
            fallthrough: true,
            getContents: id => readCachedFile(join(distDir, id)),
            getMeta: async (id) => {
                const stats = await stat(join(distDir, id)).catch(() => undefined)

                if (!stats?.isFile()) {
                    return
                }

                return {
                    size: stats.size,
                    mtime: stats.mtimeMs,
                }
            },
        })

        if (result) {
            return result
        }

        event.res.headers.set('content-type', 'text/html; charset=utf-8')

        return readCachedFile(join(distDir, 'index.html'))
    })

    return createServer(toNodeHandler(app))
}
