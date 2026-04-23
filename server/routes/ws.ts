import type { ProjectUsageDataModule, ProjectUsageDataPlatformScope, ProjectWebSocketRequest } from '#shared/types/ws'
import { loadProjectUsageCatalog, loadProjectUsageDataModule } from '#shared/platform/project'
import { resolveConfig } from '#shared/utils/configs'

export default defineWebSocketHandler({
    open(peer) {
        console.log(`[ws] opened: ${peer.id}`)
        peer.send('Welcome use WebSocket server！')
    },
    async message(peer, message) {
        try {
            const request = parseProjectRequest(message)
            const runtimeConfig = useRuntimeConfig()
            const config = resolveConfig(runtimeConfig.public)

            if (request.type === 'project') {
                sendData(peer, request, await loadProjectUsageCatalog(config))
            }
            else if (request.type === 'project_data') {
                sendData(peer, request, await loadProjectUsageDataModule(config, request))
            }
        }
        catch (error) {
            sendError(peer, error instanceof Error ? error.message : 'Failed to handle websocket request.')
        }
    },

    close(peer, details) {
        console.log(`[ws] close connection: ${peer.id}`, details)
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
        label: params.get('label') ?? undefined,
        module: params.get('module') ?? undefined,
        modules: params.getAll('modules').flatMap(splitValueList),
        path: params.getAll('path').flatMap(splitPathList),
        platform: params.get('platform') ?? undefined,
        project: params.get('project') ?? undefined,
        requestId: params.get('requestId') ?? undefined,
        sessionId: params.get('sessionId') ?? undefined,
        type,
    }
}

function normalizeProjectRequest(value: unknown): ProjectWebSocketRequest {
    if (typeof value === 'string') {
        return normalizeProjectRequest(parseTextRequest(value.trim()))
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Websocket message must include a supported type.')
    }

    const record = value as Record<string, unknown>
    const type = getString(record.type)

    if (type === 'project') {
        return {
            requestId: getString(record.requestId) || undefined,
            type,
        }
    }

    if (type === 'project_data') {
        return {
            label: getString(record.label) || undefined,
            module: normalizeProjectDataModule(record.module),
            modules: normalizeProjectDataModules(record.modules),
            path: normalizePathList(record.path),
            platform: normalizePlatform(record.platform),
            project: getString(record.project) || undefined,
            requestId: getString(record.requestId) || undefined,
            sessionId: getString(record.sessionId) || undefined,
            type,
        }
    }

    throw new Error(`Unsupported websocket request type: ${type || 'unknown'}.`)
}

function normalizePathList(value: unknown) {
    if (Array.isArray(value)) {
        return value.flatMap(item => typeof item === 'string' ? splitPathList(item) : [])
    }

    if (typeof value === 'string') {
        return splitPathList(value)
    }

    return undefined
}

function normalizeProjectDataModule(value: unknown): ProjectUsageDataModule | undefined {
    const module = getString(value)

    return module ? module as ProjectUsageDataModule : undefined
}

function normalizeProjectDataModules(value: unknown): ProjectUsageDataModule[] | undefined {
    if (Array.isArray(value)) {
        return value.flatMap(item => typeof item === 'string' ? splitValueList(item) : []) as ProjectUsageDataModule[]
    }

    if (typeof value === 'string') {
        return splitValueList(value) as ProjectUsageDataModule[]
    }

    return undefined
}

function normalizePlatform(value: unknown): ProjectUsageDataPlatformScope | undefined {
    const platform = getString(value)

    return platform ? platform as ProjectUsageDataPlatformScope : undefined
}

function splitPathList(value: string) {
    return splitValueList(value)
}

function splitValueList(value: string) {
    return value.split(',')
        .map(item => item.trim())
        .filter(Boolean)
}

function getString(value: unknown) {
    return typeof value === 'string' ? value.trim() : ''
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
