import type { UsageRuntimeUpdate } from '#server/services/usage-data-runtime'
import type { ProjectDashboardScope } from '#shared/types/project-dashboard'
import type { ProjectUsageDataModule, ProjectWebSocketRequest, UsageUpdateMessage } from '#shared/types/ws'
import { getUsageDataRuntime } from '#server/services/usage-data-runtime'
import { resolveConfig } from '#shared/utils/configs'
import {
    normalizeStringList,
    normalizeStringValue,
    normalizeUnknownRecord,
} from '#shared/utils/normalize'

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
            const request = parseProjectRequest(message)
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
            sendError(peer, error instanceof Error ? error.message : 'Failed to handle websocket request.')
        }
    },

    close(peer) {
        unsubscribePeer(peer.id)
    },

    error(peer, error) {
        console.error(`[ws] error: ${peer.id}`, error)
    },
})

function parseProjectRequest(message: { json: <T>() => T, text: () => string }): ProjectWebSocketRequest {
    const text = message.text().trim()

    try {
        return normalizeProjectRequest(message.json<unknown>())
    }
    catch {
        return normalizeProjectRequest(parseTextRequest(text))
    }
}

function sendError(peer: { send: (data: string) => void }, message: string) {
    peer.send(JSON.stringify({
        message,
        type: 'error',
    }))
}

function parseTextRequest(text: string): unknown {
    if (text === 'project' || text === 'project_data') {
        return { type: text }
    }

    const params = new URLSearchParams(text.startsWith('?') ? text.slice(1) : text)
    const type = params.get('type')

    if (!type) {
        return null
    }

    return {
        module: params.get('module') ?? undefined,
        modules: params.getAll('modules').flatMap(item => normalizeStringList<ProjectUsageDataModule>(item) ?? []),
        page: normalizeNumberValue(params.get('page')),
        pageSize: clampPageSize(normalizeNumberValue(params.get('pageSize'))),
        platform: params.get('platform') ?? undefined,
        project: params.get('project') ?? undefined,
        requestId: params.get('requestId') ?? undefined,
        type,
    }
}

function normalizeProjectRequest(value: unknown): ProjectWebSocketRequest {
    if (typeof value === 'string') {
        return normalizeProjectRequest(parseTextRequest(value.trim()))
    }

    const record = normalizeUnknownRecord(value)

    if (!record) {
        throw new Error('Websocket message must include a supported type.')
    }
    const type = normalizeStringValue<string>(record.type) ?? ''

    if (type === 'project') {
        return {
            requestId: normalizeStringValue<string>(record.requestId),
            type,
        }
    }

    if (type === 'project_data') {
        return {
            module: normalizeStringValue<ProjectUsageDataModule>(record.module),
            modules: normalizeStringList<ProjectUsageDataModule>(record.modules),
            page: normalizeNumberValue(record.page),
            pageSize: clampPageSize(normalizeNumberValue(record.pageSize)),
            platform: normalizeStringValue<ProjectDashboardScope>(record.platform),
            project: normalizeStringValue<string>(record.project),
            requestId: normalizeStringValue<string>(record.requestId),
            type,
        }
    }

    throw new Error(`Unsupported websocket request type: ${type || 'unknown'}.`)
}

function normalizeNumberValue(value: unknown) {
    const stringValue = normalizeStringValue<string>(value)

    if (!stringValue) {
        return undefined
    }

    const numberValue = Number(stringValue)

    return Number.isFinite(numberValue) ? numberValue : undefined
}

function clampPageSize(value: number | undefined) {
    if (value === undefined) {
        return undefined
    }

    return Math.min(Math.max(value, 1), MAX_PAGE_SIZE)
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
        peer.send(JSON.stringify(toUsageUpdateMessage(update)))
    })

    peerSubscriptions.set(peer.id, unsubscribe)
}

function unsubscribePeer(peerId: string) {
    peerSubscriptions.get(peerId)?.()
    peerSubscriptions.delete(peerId)
}

function toUsageUpdateMessage(update: UsageRuntimeUpdate): UsageUpdateMessage {
    return {
        payload: {
            affectedProjects: update.affectedProjects,
            updatedAt: update.updatedAt,
            updatedPlatforms: [...update.updatedPlatforms],
            updatedSessions: update.updatedSessions,
        },
        type: 'usage_update',
    }
}
