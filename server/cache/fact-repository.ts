import type { UsageInteractionFact, UsageSourceFile } from '#server/agents/shared/fact'
import type { ProjectUsagePlatform } from '#shared/types/ai'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createUsageInteractionIdentity } from '#shared/utils/usage-identity'

const SCHEMA_VERSION = 18

const SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS source_files (
        path TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        cache_signature TEXT NOT NULL,
        size INTEGER NOT NULL,
        mtime_ms REAL NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS usage_facts (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        project TEXT NOT NULL,
        repository TEXT NOT NULL DEFAULT '',
        session_id TEXT NOT NULL,
        thread_name TEXT NOT NULL DEFAULT '',
        interaction_index INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        role TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT '',
        model TEXT,
        model_lookup_candidates TEXT NOT NULL DEFAULT '[]',
        provider TEXT,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        cache_creation_5m_tokens INTEGER NOT NULL DEFAULT 0,
        cache_creation_1h_tokens INTEGER NOT NULL DEFAULT 0,
        reasoning_output_tokens INTEGER NOT NULL DEFAULT 0,
        tool_tokens INTEGER NOT NULL DEFAULT 0,
        extra_total_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        raw_cost_usd REAL,
        speed TEXT NOT NULL DEFAULT 'standard',
        has_speed INTEGER NOT NULL DEFAULT 1,
        is_sidechain INTEGER NOT NULL DEFAULT 0,
        dedupe_key TEXT,
        fallback_dedupe_key TEXT,
        source_file TEXT NOT NULL,
        source_file_mtime REAL NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_usage_facts_platform ON usage_facts(platform);
    CREATE INDEX IF NOT EXISTS idx_usage_facts_project ON usage_facts(project);
    CREATE INDEX IF NOT EXISTS idx_usage_facts_source_file ON usage_facts(source_file);

    CREATE TABLE IF NOT EXISTS schema_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        schema_version INTEGER NOT NULL
    );
`

interface SourceFileRow {
    cache_signature: string
    mtime_ms: number
    path: string
    platform: string
    size: number
}

interface FactRow {
    cache_creation_1h_tokens: number
    cache_creation_5m_tokens: number
    cache_creation_tokens: number
    cache_read_tokens: number
    dedupe_key: string | null
    extra_total_tokens: number
    fallback_dedupe_key: string | null
    has_speed: number
    input_tokens: number
    interaction_index: number
    is_sidechain: number
    model: string | null
    model_lookup_candidates: string
    output_tokens: number
    platform: string
    project: string
    provider: string | null
    raw_cost_usd: number | null
    reasoning_output_tokens: number
    repository: string
    role: string
    session_id: string
    source_file: string
    source_file_mtime: number
    speed: string
    thread_name: string
    timestamp: string
    tool_tokens: number
    total_tokens: number
    type: string
}

export class UsageFactRepository {
    private database: DatabaseSync

    constructor(private readonly databasePath: string) {
        const directoryPath = dirname(databasePath)

        if (!existsSync(directoryPath)) {
            mkdirSync(directoryPath, { recursive: true })
        }

        this.database = new DatabaseSync(databasePath)
        this.initializeSchema()
    }

    close() {
        this.database.close()
    }

    loadSourceFiles(): UsageSourceFile[] {
        return this.database.prepare('SELECT path, platform, cache_signature, size, mtime_ms FROM source_files ORDER BY path ASC')
            .all()
            .map((row) => {
                const source = row as unknown as SourceFileRow

                return {
                    cacheSignature: source.cache_signature,
                    mtimeMs: source.mtime_ms,
                    path: source.path,
                    platform: source.platform as ProjectUsagePlatform,
                    size: source.size,
                }
            })
    }

    loadFacts(): UsageInteractionFact[] {
        return this.database.prepare(`
            SELECT
                platform, project, repository, session_id, thread_name, interaction_index,
                timestamp, role, type, model, model_lookup_candidates, provider,
                input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
                cache_creation_5m_tokens, cache_creation_1h_tokens,
                reasoning_output_tokens, tool_tokens, extra_total_tokens, total_tokens,
                raw_cost_usd, speed, has_speed, is_sidechain, dedupe_key, fallback_dedupe_key,
                source_file, source_file_mtime
            FROM usage_facts
            ORDER BY platform ASC, source_file ASC, interaction_index ASC
        `).all().map(row => rowToFact(row as unknown as FactRow))
    }

    replaceSourceFacts(input: {
        changedSources: UsageSourceFile[]
        facts: UsageInteractionFact[]
        removedSourcePaths: string[]
    }) {
        const sourcePaths = Array.from(new Set([
            ...input.changedSources.map(source => source.path),
            ...input.removedSourcePaths,
        ]))
        const now = new Date().toISOString()

        this.database.exec('BEGIN')

        try {
            const deleteFacts = this.database.prepare('DELETE FROM usage_facts WHERE source_file = ?')
            const deleteSource = this.database.prepare('DELETE FROM source_files WHERE path = ?')

            for (const sourcePath of sourcePaths) {
                deleteFacts.run(sourcePath)
                deleteSource.run(sourcePath)
            }

            const upsertSource = this.database.prepare(`
                INSERT OR REPLACE INTO source_files (path, platform, cache_signature, size, mtime_ms, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            `)

            for (const source of input.changedSources) {
                upsertSource.run(source.path, source.platform, source.cacheSignature, source.size, source.mtimeMs, now)
            }

            const insertFact = this.database.prepare(`
                INSERT OR REPLACE INTO usage_facts (
                    id, platform, project, repository, session_id, thread_name, interaction_index,
                    timestamp, role, type, model, model_lookup_candidates, provider,
                    input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
                    cache_creation_5m_tokens, cache_creation_1h_tokens,
                    reasoning_output_tokens, tool_tokens, extra_total_tokens, total_tokens,
                    raw_cost_usd, speed, has_speed, is_sidechain, dedupe_key, fallback_dedupe_key,
                    source_file, source_file_mtime
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)

            for (const fact of input.facts) {
                insertFact.run(
                    createUsageInteractionIdentity({
                        interactionIndex: fact.interactionIndex,
                        platform: fact.platform,
                        repository: fact.repository,
                        sessionId: fact.sessionId,
                        sourceFile: fact.sourceFile,
                    }),
                    fact.platform,
                    fact.project,
                    fact.repository,
                    fact.sessionId,
                    fact.threadName,
                    fact.interactionIndex,
                    fact.timestamp,
                    fact.role,
                    fact.type,
                    fact.model,
                    JSON.stringify(fact.modelLookupCandidates),
                    fact.provider,
                    fact.usage.inputTokens,
                    fact.usage.outputTokens,
                    fact.usage.cacheCreationTokens,
                    fact.usage.cacheReadTokens,
                    fact.usage.cacheCreation5mTokens,
                    fact.usage.cacheCreation1hTokens,
                    fact.usage.reasoningOutputTokens,
                    fact.usage.toolTokens,
                    fact.usage.extraTotalTokens,
                    fact.usage.totalTokens,
                    fact.rawCostUSD,
                    fact.speed,
                    fact.hasSpeed === false ? 0 : 1,
                    fact.isSidechain ? 1 : 0,
                    fact.dedupeKey,
                    fact.fallbackDedupeKey,
                    fact.sourceFile,
                    fact.sourceFileMtime,
                )
            }

            this.database.exec('COMMIT')
        }
        catch (error) {
            this.database.exec('ROLLBACK')
            throw error
        }
    }

    private initializeSchema() {
        this.database.exec(SCHEMA_SQL)

        const row = this.database.prepare('SELECT schema_version FROM schema_meta WHERE id = 1').get() as { schema_version?: number } | undefined

        if (row?.schema_version && row.schema_version !== SCHEMA_VERSION) {
            this.resetDatabase()
            this.database.exec(SCHEMA_SQL)
        }

        this.database.prepare(`
            INSERT INTO schema_meta (id, schema_version)
            VALUES (1, ?)
            ON CONFLICT(id) DO UPDATE SET schema_version = excluded.schema_version
        `).run(SCHEMA_VERSION)
    }

    private resetDatabase() {
        this.database.close()

        for (const path of [this.databasePath, `${this.databasePath}-shm`, `${this.databasePath}-wal`]) {
            rmSync(path, { force: true })
        }

        this.database = new DatabaseSync(this.databasePath)
    }
}

function rowToFact(row: FactRow): UsageInteractionFact {
    return {
        dedupeKey: row.dedupe_key,
        fallbackDedupeKey: row.fallback_dedupe_key,
        hasSpeed: row.has_speed === 1,
        interactionIndex: row.interaction_index,
        isSidechain: row.is_sidechain === 1,
        model: row.model,
        modelLookupCandidates: parseModelCandidates(row.model_lookup_candidates),
        platform: row.platform as ProjectUsagePlatform,
        project: row.project,
        provider: row.provider,
        rawCostUSD: row.raw_cost_usd,
        repository: row.repository,
        role: row.role,
        sessionId: row.session_id,
        sourceFile: row.source_file,
        sourceFileMtime: row.source_file_mtime,
        speed: row.speed === 'fast' ? 'fast' : 'standard',
        threadName: row.thread_name,
        timestamp: row.timestamp,
        type: row.type,
        usage: {
            cacheCreation1hTokens: row.cache_creation_1h_tokens,
            cacheCreation5mTokens: row.cache_creation_5m_tokens,
            cacheCreationTokens: row.cache_creation_tokens,
            cacheReadTokens: row.cache_read_tokens,
            extraTotalTokens: row.extra_total_tokens,
            inputTokens: row.input_tokens,
            outputTokens: row.output_tokens,
            reasoningOutputTokens: row.reasoning_output_tokens,
            toolTokens: row.tool_tokens,
            totalTokens: row.total_tokens,
        },
    }
}

function parseModelCandidates(value: string) {
    try {
        const parsed = JSON.parse(value)

        if (Array.isArray(parsed)) {
            return parsed.filter((item): item is string => typeof item === 'string')
        }
    }
    catch {
    }

    return []
}
