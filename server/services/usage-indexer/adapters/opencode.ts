import type { UsagePlatformAdapter } from '#server/services/usage-indexer/platform-adapter'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { openSqliteDatabase } from '#server/utils/sqlite'
import { createLiteLLMPricingResolver } from '#shared/platform/pricing'
import { parse } from '#shared/utils/parse'
import { parseJsonFile, toIsoString } from '#shared/utils/platform'
import { glob } from 'glob'
import {
    addFragmentInteraction,
    createSessionFragment,
    toDiscoveredUsageFile,
} from '../session-fragment'
import {
    applyTotalUsageAsExtra,
    isZeroInteractionUsage,
    toInteractionUsage,
} from './shared'

export const openCodeUsageAdapter = {
    async createPricingResolver() {
        return createLiteLLMPricingResolver({
            getLookupCandidates: getOpenCodeLookupCandidates,
        })
    },
    async discoverFiles(config) {
        const discovered: string[] = []

        for (const root of config.openCodePaths) {
            const databaseFile = await getOpenCodeDatabaseFile(root)

            if (databaseFile) {
                discovered.push(databaseFile)
            }

            const messageFiles = await glob(join(root, 'storage', 'message', '**', '*.json'), {
                absolute: true,
            }).catch(() => [])
            discovered.push(...messageFiles)
        }

        return Array.from(new Set(discovered))
            .flatMap(filePath => toDiscoveredUsageFile(filePath, 'opencode'))
    },
    parseFile(filePath) {
        if (filePath.endsWith('.db')) {
            const database = openSqliteDatabase(filePath, { readOnly: true })

            try {
                const rows = database.prepare<{
                    data: string
                    id: string
                    session_id: string
                }>('SELECT id, session_id, data FROM message').all()
                const fragments = new Map<string, ReturnType<typeof createSessionFragment>>()

                for (const row of rows) {
                    const record = parse(row.data) as Record<string, any> | null
                    const entry = record
                        ? getOpenCodeMessageEntry(record, {
                                interactionId: row.id,
                                sessionId: row.session_id,
                            })
                        : null

                    if (!entry) {
                        continue
                    }

                    const fragment = fragments.get(entry.sessionId) ?? createSessionFragment({
                        project: 'opencode',
                        repository: 'local/opencode',
                        sessionId: entry.sessionId,
                        startedAt: entry.timestamp,
                        threadName: `OpenCode ${entry.sessionId}`,
                    })

                    addFragmentInteraction(fragment, {
                        costUSD: entry.usage.costUSD,
                        dedupeKey: entry.interactionId,
                        index: fragment.interactions.length,
                        model: entry.model,
                        modelLookupCandidates: entry.modelLookupCandidates,
                        provider: entry.provider,
                        rawCostUSD: entry.rawCostUSD,
                        role: 'assistant',
                        timestamp: entry.timestamp,
                        type: 'message',
                        usage: entry.usage,
                    })
                    fragments.set(entry.sessionId, fragment)
                }

                return Array.from(fragments.values())
            }
            finally {
                database.close()
            }
        }

        const value = parseJsonFile<Record<string, any>>(filePath)
        const record = value
        const interactionId = record?.id.trim()

        if (interactionId && isDuplicatedByOpenCodeDatabase(filePath, interactionId)) {
            return []
        }

        const entry = record
            ? getOpenCodeMessageEntry(record, {
                    interactionId,
                    sessionId: record.sessionID.trim(),
                })
            : null

        if (!entry) {
            return []
        }

        const fragment = createSessionFragment({
            project: 'opencode',
            repository: 'local/opencode',
            sessionId: entry.sessionId,
            startedAt: entry.timestamp,
            threadName: `OpenCode ${entry.sessionId}`,
        })

        addFragmentInteraction(fragment, {
            costUSD: entry.usage.costUSD,
            dedupeKey: entry.interactionId,
            index: 0,
            model: entry.model,
            modelLookupCandidates: entry.modelLookupCandidates,
            provider: entry.provider,
            rawCostUSD: entry.rawCostUSD,
            role: 'assistant',
            timestamp: entry.timestamp,
            type: 'message',
            usage: entry.usage,
        })

        return [fragment]
    },
    watchPatterns(config) {
        return config.openCodePaths.flatMap(path => [
            join(path, 'opencode.db'),
            join(path, 'opencode-*.db'),
            join(path, 'storage', 'message', '**', '*.json'),
        ])
    },
} satisfies UsagePlatformAdapter

async function getOpenCodeDatabaseFile(root: string) {
    const defaultPath = join(root, 'opencode.db')
    const defaultFiles = await glob(defaultPath, { absolute: true }).catch(() => [])

    if (defaultFiles.length > 0) {
        return defaultFiles[0]!
    }

    const candidates = await glob(join(root, 'opencode-*.db'), { absolute: true }).catch(() => [])
    return candidates.sort((a, b) => a.localeCompare(b))[0] ?? null
}

function getOpenCodeMessageEntry(
    value: Record<string, any>,
    options: {
        interactionId?: string | null
        sessionId?: string | null
    } = {},
) {
    const tokens = value.tokens
    const model = value.modelID.trim()
    const provider = value.providerID.trim() ?? null

    if (!tokens || !model || !provider) {
        return null
    }

    const usage = toInteractionUsage({
        ...applyTotalUsageAsExtra({
            cacheCreationTokens: tokens.cache?.write as number | undefined,
            cacheReadTokens: tokens.cache?.read as number | undefined,
            inputTokens: tokens.input as number | undefined,
            outputTokens: tokens.output as number | undefined,
            totalTokens: tokens.total as number | undefined,
        }),
    })

    if (isZeroInteractionUsage(usage)) {
        return null
    }

    const timestamp = toIsoString(value.time?.created)

    if (!timestamp) {
        return null
    }

    const sessionId = options.sessionId || 'unknown'
    const rawCost = value.cost
    const directCost = typeof rawCost === 'number' && Number.isFinite(rawCost) ? rawCost : null
    const modelLookupCandidates = getOpenCodeModelCandidates(model, provider)

    return {
        interactionId: options.interactionId || value.id.trim() || `${sessionId}:${timestamp}:${model}`,
        model,
        modelLookupCandidates,
        provider,
        rawCostUSD: directCost && directCost > 0 ? directCost : null,
        sessionId,
        timestamp,
        usage: toInteractionUsage({
            ...usage,
            costUSD: directCost && directCost > 0 ? directCost : 0,
        }),
    }
}

function getOpenCodeLookupCandidates(model: string) {
    const resolvedModel = resolveOpenCodeModelName(model.trim())
    const normalizedModel = normalizeOpenCodeModelName(resolvedModel)
    return Array.from(new Set([resolvedModel, normalizedModel]))
}

function isDuplicatedByOpenCodeDatabase(filePath: string, interactionId: string) {
    const marker = `${join('storage', 'message')}/`
    const markerIndex = filePath.lastIndexOf(marker)
    const root = markerIndex >= 0 ? filePath.slice(0, markerIndex) : null

    if (!root) {
        return false
    }

    const databaseFile = getOpenCodeDatabaseFileSync(root)

    if (!databaseFile) {
        return false
    }

    const database = openSqliteDatabase(databaseFile, { readOnly: true })

    try {
        const row = database.prepare<{ id: string }>('SELECT id FROM message WHERE id = ? LIMIT 1').get(interactionId)
        return Boolean(row?.id)
    }
    catch {
        return false
    }
    finally {
        database.close()
    }
}

function getOpenCodeModelCandidates(model: string, provider: string) {
    const resolvedModel = resolveOpenCodeModelName(model)
    const normalizedModel = normalizeOpenCodeModelName(resolvedModel)
    const candidates = Array.from(new Set([resolvedModel, normalizedModel]))

    if (provider !== 'unknown') {
        const normalizedProvider = provider.replaceAll('-', '_')
        candidates.push(...Array.from(new Set([
            `${normalizedProvider}/${resolvedModel}`,
            `${normalizedProvider}/${normalizedModel}`,
        ])))
    }

    return candidates
}

function resolveOpenCodeModelName(model: string) {
    if (model === 'gemini-3-pro-high') {
        return 'gemini-3-pro-preview'
    }

    if (model === 'k2p6') {
        return 'kimi-k2.6'
    }

    return model
}

function normalizeOpenCodeModelName(model: string) {
    for (const family of ['claude-haiku-', 'claude-opus-', 'claude-sonnet-']) {
        if (!model.startsWith(family)) {
            continue
        }

        const rest = model.slice(family.length)
        const dotMatch = /^(\d+)\.(\d.*)$/u.exec(rest)

        if (dotMatch) {
            return `${family}${dotMatch[1]}-${dotMatch[2]}`
        }

        if (rest.length >= 2 && /\d/u.test(rest[0]!) && /\d/u.test(rest[1]!)) {
            return `${family}${rest[0]}-${rest.slice(1)}`
        }
    }

    return model
}

function getOpenCodeDatabaseFileSync(root: string) {
    const defaultPath = join(root, 'opencode.db')

    if (existsSync(defaultPath)) {
        return defaultPath
    }

    return readdirSync(root, { withFileTypes: true })
        .filter(entry => entry.isFile() && /^opencode-[\w-]+\.db$/u.test(entry.name))
        .map(entry => join(root, entry.name))
        .sort((left, right) => left.localeCompare(right))[0] ?? null
}
