import type { UsagePlatformAdapter } from '#server/services/usage-indexer/platform-adapter'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { openSqliteDatabase } from '#server/utils/sqlite'
import { createLiteLLMPricingResolver } from '#shared/platform/pricing'
import { normalizeFiniteNumberOrNull, normalizeStringValue, normalizeUnknownRecord } from '#shared/utils/normalize'
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
    calculateUsageCostFromCandidates,
    isZeroInteractionUsage,
    normalizeUsageNumber,
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
    parseFile(filePath, resolvePricing) {
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
                    const record = parse(row.data) as Record<string, unknown> | null
                    const entry = record
                        ? getOpenCodeMessageEntry(record, resolvePricing, {
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
                        content: '',
                        costUSD: entry.usage.costUSD,
                        dedupeKey: entry.interactionId,
                        index: fragment.interactions.length,
                        model: entry.model,
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

        const value = parseJsonFile(filePath)
        const record = normalizeUnknownRecord(value)
        const interactionId = normalizeStringValue(record?.id)

        if (interactionId && isDuplicatedByOpenCodeDatabase(filePath, interactionId)) {
            return []
        }

        const entry = record
            ? getOpenCodeMessageEntry(record, resolvePricing, {
                    interactionId,
                    sessionId: normalizeStringValue(record.sessionID),
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
            content: '',
            costUSD: entry.usage.costUSD,
            dedupeKey: entry.interactionId,
            index: 0,
            model: entry.model,
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
    value: Record<string, unknown>,
    resolvePricing: Parameters<UsagePlatformAdapter['parseFile']>[1],
    options: {
        interactionId?: string | null
        sessionId?: string | null
    } = {},
) {
    const tokens = normalizeUnknownRecord(value.tokens)
    const model = normalizeStringValue(value.modelID)
    const provider = normalizeStringValue(value.providerID) ?? null

    if (!tokens || !model || !provider) {
        return null
    }

    const usage = toInteractionUsage({
        ...applyTotalUsageAsExtra({
            cacheCreationTokens: normalizeUsageNumber(normalizeUnknownRecord(tokens.cache)?.write as number | undefined),
            cacheReadTokens: normalizeUsageNumber(normalizeUnknownRecord(tokens.cache)?.read as number | undefined),
            inputTokens: normalizeUsageNumber(tokens.input as number | undefined),
            outputTokens: normalizeUsageNumber(tokens.output as number | undefined),
            totalTokens: normalizeUsageNumber(tokens.total as number | undefined),
        }),
    })

    if (isZeroInteractionUsage(usage)) {
        return null
    }

    const timestamp = toIsoString(normalizeUnknownRecord(value.time)?.created)

    if (!timestamp) {
        return null
    }

    const sessionId = options.sessionId || 'unknown'
    const directCost = normalizeFiniteNumberOrNull(value.cost)
    const costUSD = directCost && directCost > 0
        ? directCost
        : calculateUsageCostFromCandidates(usage, getOpenCodeModelCandidates(model, provider), resolvePricing, {
                includeExtraTotalAsOutput: true,
                includeReasoningAsOutput: false,
            })

    return {
        interactionId: options.interactionId || normalizeStringValue(value.id) || `${sessionId}:${timestamp}:${model}`,
        model,
        sessionId,
        timestamp,
        usage: toInteractionUsage({
            ...usage,
            costUSD,
        }),
    }
}

function getOpenCodeLookupCandidates(model: string) {
    const normalizedModel = normalizeOpenCodeModelName(resolveOpenCodeModelName(model.trim()))
    return [model.trim(), normalizedModel]
}

function isDuplicatedByOpenCodeDatabase(filePath: string, interactionId: string) {
    const root = getOpenCodeRootFromMessageFile(filePath)

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
    const normalizedModel = normalizeOpenCodeModelName(resolveOpenCodeModelName(model))
    const candidates = [model, normalizedModel]

    if (provider !== 'unknown') {
        const normalizedProvider = provider.replaceAll('-', '_')
        candidates.push(`${normalizedProvider}/${model}`, `${normalizedProvider}/${normalizedModel}`)
    }

    return candidates
}

function resolveOpenCodeModelName(model: string) {
    return model === 'gemini-3-pro-high' ? 'gemini-3-pro-preview' : model
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
        .filter(entry => entry.isFile() && isOpenCodeChannelDatabase(entry.name))
        .map(entry => join(root, entry.name))
        .sort((left, right) => left.localeCompare(right))[0] ?? null
}

function getOpenCodeRootFromMessageFile(filePath: string) {
    const marker = `${join('storage', 'message')}/`
    const index = filePath.lastIndexOf(marker)
    return index >= 0 ? filePath.slice(0, index) : null
}

function isOpenCodeChannelDatabase(name: string) {
    return /^opencode-[\w-]+\.db$/u.test(name)
}
