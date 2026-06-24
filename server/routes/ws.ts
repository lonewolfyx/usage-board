import type { ProjectDashboardScope } from '#shared/types/project-dashboard'
import type { ProjectUsageDataModule, ProjectWebSocketRequest } from '#shared/types/ws'
import { getUsageDataRuntime } from '#server/runtime/usage-runtime'
import { PROJECT_USAGE_PLATFORMS } from '#shared/types/ai'
import { PROJECT_USAGE_DATA_MODULES } from '#shared/types/ws'
import { resolveConfig } from '#shared/utils/configs'
import { normalizeStringList } from '#shared/utils/normalize'

const MAX_PAGE_SIZE = 100
const MAX_CONNECTIONS = 50

const peerSubscriptions = new Map<string, () => void>()

export default defineWebSocketHandler({
    open(peer) {
        if (peerSubscriptions.size >= MAX_CONNECTIONS) {
            peer.send(JSON.stringify({ message: 'Too many connections.', type: 'error' }))
            peer.close()
            return
        }

        subscribePeerToUsageUpdates(peer)
    },
    async message(peer, message) {
        try {
            const request = parseProjectRequest(message.json<unknown>())
            const runtimeConfig = useRuntimeConfig()
            const config = resolveConfig(runtimeConfig.public)
            const runtime = getUsageDataRuntime(config)

            if (request.type === 'project') {
                sendData(peer, request, await runtime.getProjectCatalog())
            }
            else if (request.type === 'project_data') {
                sendData(peer, request, await runtime.getProjectDataModules(request))
            }
        }
        catch (error) {
            peer.send(JSON.stringify({ message: error instanceof Error ? error.message : 'Failed to handle websocket request.', type: 'error' }))
        }
    },

    close(peer) {
        unsubscribePeer(peer.id)
    },

    error(peer, error) {
        console.error(`[ws] error: ${peer.id}`, error)
    },
})

function parseProjectRequest(value: unknown): ProjectWebSocketRequest {
    const record = value && typeof value === 'object' ? value as Record<string, unknown> : null

    if (!record) {
        throw new Error('Websocket message must be a JSON object with a "type" field.')
    }

    const type = typeof record.type === 'string' ? record.type.trim() : ''

    if (type === 'project') {
        return {
            requestId: typeof record.requestId === 'string' ? record.requestId.trim() : '',
            type,
        }
    }

    if (type === 'project_data') {
        const rawPageSize = typeof record.pageSize === 'number' && Number.isFinite(record.pageSize)
            ? record.pageSize
            : undefined
        const pageSize = rawPageSize === undefined ? undefined : Math.min(Math.max(rawPageSize, 1), MAX_PAGE_SIZE)
        const module = typeof record.module === 'string' && PROJECT_USAGE_DATA_MODULES.includes(record.module as ProjectUsageDataModule)
            ? record.module as ProjectUsageDataModule
            : undefined
        const platform = typeof record.platform === 'string'
            && (record.platform === 'all' || PROJECT_USAGE_PLATFORMS.includes(record.platform as typeof PROJECT_USAGE_PLATFORMS[number]))
            ? record.platform as ProjectDashboardScope
            : undefined

        return {
            module,
            modules: normalizeStringList<ProjectUsageDataModule>(record.modules),
            page: typeof record.page === 'number' && Number.isFinite(record.page) ? record.page : undefined,
            pageSize,
            platform,
            project: typeof record.project === 'string' ? record.project.trim() : '',
            requestId: typeof record.requestId === 'string' ? record.requestId.trim() : '',
            type,
        }
    }

    throw new Error(`Unsupported websocket request type: ${type || 'unknown'}.`)
}

function sendData(
    peer: { send: (data: string) => void },
    request: ProjectWebSocketRequest,
    data: unknown,
) {
    if (!request.requestId) {
        peer.send(JSON.stringify(data))
        return
    }

    peer.send(JSON.stringify({
        data,
        requestId: request.requestId,
    }))
}

function subscribePeerToUsageUpdates(peer: { id: string, send: (data: string) => void }) {
    unsubscribePeer(peer.id)

    const runtimeConfig = useRuntimeConfig()
    const config = resolveConfig(runtimeConfig.public)
    const runtime = getUsageDataRuntime(config)
    const unsubscribe = runtime.subscribeToUpdates((update) => {
        peer.send(JSON.stringify({
            payload: {
                affectedProjects: update.affectedProjects,
                updatedAt: update.updatedAt,
                updatedPlatforms: [...update.updatedPlatforms],
                updatedSessions: update.updatedSessions,
            },
            type: 'usage_update',
        }))
    })

    peerSubscriptions.set(peer.id, unsubscribe)
}

function unsubscribePeer(peerId: string) {
    peerSubscriptions.get(peerId)?.()
    peerSubscriptions.delete(peerId)
}
