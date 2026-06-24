import type { AgentAdapter, UsageInteractionFact, UsageSourceFile } from '#server/agents/shared/fact'
import type { IConfig } from '#shared/types/config'
import type { OpenCodeMessageRaw } from './types'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { discoverSourceFiles, readJsonFile } from '#server/agents/shared/io'
import { applyTotalUsageAsExtra, createInteractionUsage, usageHasTokens } from '#server/agents/shared/usage'
import { toIsoString } from '#shared/utils/platform'
import { glob } from 'glob'

interface OpenCodeMessageRow {
    data?: string
    id: string
    session_id: string
}

export class OpenCodeAdapter implements AgentAdapter {
    readonly platform = 'opencode' as const
    private readonly roots: string[]

    constructor(config: IConfig) {
        this.roots = [...config.openCodePaths]
    }

    async discoverSources() {
        const patterns: string[] = []

        for (const root of this.roots) {
            const databaseFile = await getOpenCodeDatabaseFile(root)

            if (databaseFile) {
                patterns.push(databaseFile)
            }

            patterns.push(join(root, 'storage', 'message', '**', '*.json'))
        }

        return discoverSourceFiles(this.platform, patterns)
    }

    async loadSource(source: UsageSourceFile) {
        return { facts: loadOpenCodeFacts(source), source }
    }

    watchSourcePatterns() {
        return this.roots.flatMap(root => [
            join(root, 'opencode.db'),
            join(root, 'opencode-*.db'),
            join(root, 'storage', 'message', '**', '*.json'),
        ])
    }
}

function loadOpenCodeFacts(source: UsageSourceFile): UsageInteractionFact[] {
    return source.path.endsWith('.db')
        ? loadOpenCodeDbFacts(source)
        : loadOpenCodeJsonFacts(source)
}

function loadOpenCodeDbFacts(source: UsageSourceFile): UsageInteractionFact[] {
    try {
        const database = new DatabaseSync(source.path, { readOnly: true })
        const rows = database.prepare('SELECT id, session_id, data FROM message').all() as unknown as OpenCodeMessageRow[]
        const facts: UsageInteractionFact[] = []

        for (const row of rows) {
            if (!row.data) {
                continue
            }

            try {
                const fact = openCodeMessageToFact(
                    JSON.parse(row.data) as OpenCodeMessageRaw,
                    row.id,
                    row.session_id,
                    source,
                    facts.length,
                )

                if (fact) {
                    facts.push(fact)
                }
            }
            catch {
            }
        }

        database.close()
        return facts
    }
    catch {
        return []
    }
}

function loadOpenCodeJsonFacts(source: UsageSourceFile): UsageInteractionFact[] {
    const message = readJsonFile<OpenCodeMessageRaw>(source.path)

    if (!message) {
        return []
    }

    const interactionId = message.id?.trim()

    if (interactionId && isDuplicatedByOpenCodeDatabase(source.path, interactionId)) {
        return []
    }

    const sessionId = message.sessionID?.trim()
    const fact = openCodeMessageToFact(message, interactionId, sessionId, source, 0)

    return fact ? [fact] : []
}

function openCodeMessageToFact(
    message: OpenCodeMessageRaw,
    interactionId: string | undefined,
    sessionId: string | undefined,
    source: UsageSourceFile,
    index: number,
): UsageInteractionFact | null {
    const tokens = message.tokens
    const model = message.modelID?.trim() ?? ''
    const provider = message.providerID?.trim() ?? null

    if (!tokens || !model || !provider) {
        return null
    }

    const usage = createInteractionUsage({
        ...applyTotalUsageAsExtra({
            cacheCreationTokens: tokens.cache?.write,
            cacheReadTokens: tokens.cache?.read,
            inputTokens: tokens.input,
            outputTokens: tokens.output,
            totalTokens: tokens.total,
        }),
    })

    if (!usageHasTokens(usage)) {
        return null
    }

    const timestamp = toIsoString(message.time?.created)

    if (!timestamp) {
        return null
    }

    const resolvedSessionId = sessionId || 'unknown'
    const rawCost = message.cost
    const directCost = typeof rawCost === 'number' && Number.isFinite(rawCost) ? rawCost : null

    return {
        dedupeKey: interactionId || message.id?.trim() || `${resolvedSessionId}:${timestamp}:${model}`,
        fallbackDedupeKey: null,
        interactionIndex: index,
        isSidechain: false,
        model,
        modelLookupCandidates: getOpenCodeModelCandidates(model, provider),
        platform: 'opencode',
        project: 'opencode',
        provider,
        rawCostUSD: directCost && directCost > 0 ? directCost : null,
        repository: 'local/opencode',
        role: 'assistant',
        sessionId: resolvedSessionId,
        sourceFile: source.path,
        sourceFileMtime: source.mtimeMs,
        speed: 'standard',
        threadName: `OpenCode ${resolvedSessionId}`,
        timestamp,
        type: 'message',
        usage,
    }
}

async function getOpenCodeDatabaseFile(root: string) {
    const defaultFiles = await glob(join(root, 'opencode.db'), { absolute: true }).catch(() => [])

    if (defaultFiles.length > 0) {
        return defaultFiles[0]!
    }

    const candidates = await glob(join(root, 'opencode-*.db'), { absolute: true }).catch(() => [])
    return candidates.sort((left, right) => left.localeCompare(right))[0] ?? null
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

    try {
        const database = new DatabaseSync(databaseFile, { readOnly: true })
        const row = database.prepare('SELECT id FROM message WHERE id = ? LIMIT 1').get(interactionId) as { id?: string } | undefined
        database.close()
        return Boolean(row?.id)
    }
    catch {
        return false
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
