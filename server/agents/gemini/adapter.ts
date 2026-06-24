import type { AgentAdapter, UsageInteractionFact, UsageSourceFile } from '#server/agents/shared/fact'
import type { IConfig } from '#shared/types/config'
import type { GeminiSessionFileRaw, GeminiTokensRaw } from './types'
import { basename } from 'node:path'
import { discoverSourceFiles, readJsonFile } from '#server/agents/shared/io'
import { createInteractionUsage, normalizeRole, usageHasTokens } from '#server/agents/shared/usage'
import { GEMINI_FALLBACK_MODEL } from '#shared/platform/constant'
import {
    convertGeminiTokenUsage,
    getGeminiLookupCandidates,
    getGeminiProjectKeyFromPath,
    getGeminiProjectRoot,
    getProjectName,
    getRepositoryNameFromProjectRoot,
    isZeroUsage,
    toIsoString,
} from '#shared/utils/platform'

export class GeminiAdapter implements AgentAdapter {
    readonly platform = 'gemini' as const
    private readonly patterns: string[]

    constructor(config: IConfig) {
        const root = config.geminiPath.replace(/\/$/u, '')
        this.patterns = [
            `${root}/tmp/*/chats/session-*.json`,
            `${root}/tmp/*/chats/sessions-*.json`,
        ]
    }

    discoverSources() {
        return discoverSourceFiles(this.platform, this.patterns)
    }

    async loadSource(source: UsageSourceFile) {
        return { facts: loadGeminiFacts(source), source }
    }

    watchSourcePatterns() {
        return this.patterns
    }
}

function loadGeminiFacts(source: UsageSourceFile): UsageInteractionFact[] {
    const data = readJsonFile<GeminiSessionFileRaw>(source.path)

    if (!data || !Array.isArray(data.messages)) {
        return []
    }

    const projectRoot = getGeminiProjectRoot(source.path)
    const project = getProjectName(projectRoot, '') || getGeminiProjectKeyFromPath(source.path)
    const repository = getRepositoryNameFromProjectRoot(projectRoot) || `local/${project}`
    const sessionId = data.sessionId?.trim() || basename(source.path, '.json')
    const threadName = getGeminiThreadName(data, project)
    const facts: UsageInteractionFact[] = []

    for (let index = 0; index < data.messages.length; index += 1) {
        const message = data.messages[index]!
        const timestamp = toIsoString(message.timestamp)

        if (!timestamp) {
            continue
        }

        const model = message.model?.trim() || (message.tokens ? GEMINI_FALLBACK_MODEL : null)

        if (!model) {
            continue
        }

        const usage = message.tokens ? geminiUsage(message.tokens) : null

        if (!usage || !usageHasTokens(usage)) {
            continue
        }

        facts.push({
            dedupeKey: null,
            fallbackDedupeKey: null,
            interactionIndex: index,
            isSidechain: false,
            model,
            modelLookupCandidates: getGeminiLookupCandidates(model),
            platform: 'gemini',
            project,
            provider: 'google',
            rawCostUSD: null,
            repository,
            role: message.type === 'gemini' ? 'assistant' : normalizeRole(message.type ?? ''),
            sessionId,
            sourceFile: source.path,
            sourceFileMtime: source.mtimeMs,
            speed: 'standard',
            threadName,
            timestamp,
            type: message.type ?? 'message',
            usage,
        })
    }

    return facts
}

function geminiUsage(tokens: GeminiTokensRaw): UsageInteractionFact['usage'] | null {
    const baseUsage = convertGeminiTokenUsage(tokens)
    const modifiedUsage = {
        ...baseUsage,
        inputTokens: baseUsage.inputTokens + (tokens.tool ?? 0),
        reasoningOutputTokens: 0,
    }

    if (isZeroUsage(modifiedUsage)) {
        return null
    }

    return createInteractionUsage({
        ...modifiedUsage,
        extraTotalTokens: tokens.thoughts ?? 0,
    })
}

function getGeminiThreadName(data: GeminiSessionFileRaw, project: string): string {
    const summary = data.summary?.trim()
    const name = summary

    if (!name) {
        return `Session for ${project}`
    }

    return name.length > 96 ? `${name.slice(0, 93)}...` : name
}
