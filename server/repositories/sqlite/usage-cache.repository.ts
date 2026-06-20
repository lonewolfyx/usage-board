import type { IndexedUsageSourceFileMeta } from '#server/types/usage-indexer'
import type { SqliteDatabase } from '#server/utils/sqlite'
import type { ProjectUsagePlatform } from '#shared/types/ai'
import type {
    DailyTokenUsage,
    MonthlyModelUsage,
    ProjectSessionUsageItem,
} from '#shared/types/usage-dashboard'
import type { ProjectUsageCatalogItem } from '#shared/types/ws'
import type { SchemaMetaRow, SourceFileRow } from './usage-cache.types'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import { openSqliteDatabase } from '#server/utils/sqlite'
import { PROJECT_USAGE_PLATFORMS } from '#shared/types/ai'
import { getLocalDayQueryBoundaries, previousDateKey, todayDateKey, todayStartOfDay, useDateFormat } from '#shared/utils/date'
import { getMonthKey } from '#shared/utils/platform'
import { formatDateLabelFromDateKey } from '#shared/utils/usage-dashboard'
import { createUsageInteractionIdentity, createUsageSessionIdentity } from '#shared/utils/usage-identity'
import dayjs from 'dayjs'

const SCHEMA_VERSION = 5

const SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS sessions (
        id                  TEXT PRIMARY KEY,
        session_id          TEXT NOT NULL,
        interaction_index   INTEGER NOT NULL,
        platform            TEXT NOT NULL,
        project_name        TEXT NOT NULL,
        repository          TEXT NOT NULL DEFAULT '',
        thread_name         TEXT NOT NULL DEFAULT '',
        session_started_at  TEXT,
        timestamp           TEXT,
        role                TEXT NOT NULL DEFAULT 'unknown',
        type                TEXT NOT NULL DEFAULT '',
        model               TEXT,
        input_token         INTEGER NOT NULL DEFAULT 0,
        output_token        INTEGER NOT NULL DEFAULT 0,
        cached_input_token  INTEGER NOT NULL DEFAULT 0,
        cache_creation      INTEGER NOT NULL DEFAULT 0,
        cache_read          INTEGER NOT NULL DEFAULT 0,
        reasoning_token     INTEGER NOT NULL DEFAULT 0,
        total_token         INTEGER NOT NULL DEFAULT 0,
        raw_cost_usd        REAL,
        speed               TEXT,
        provider            TEXT,
        is_fallback_model   INTEGER NOT NULL DEFAULT 0,
        tool_tokens         INTEGER NOT NULL DEFAULT 0,
        extra_total_tokens  INTEGER NOT NULL DEFAULT 0,
        dedupe_key          TEXT,
        fallback_dedupe_key TEXT,
        source_file         TEXT,
        is_sidechain        INTEGER NOT NULL DEFAULT 0,
        create_time         TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_platform ON sessions(platform);
    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_name);
    CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON sessions(session_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(session_started_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_timestamp ON sessions(timestamp);
    CREATE INDEX IF NOT EXISTS idx_sessions_model ON sessions(model);
    CREATE INDEX IF NOT EXISTS idx_sessions_total_token ON sessions(total_token DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_platform_project ON sessions(platform, project_name);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_platform_repository_dedupe_key ON sessions(platform, repository, dedupe_key) WHERE dedupe_key IS NOT NULL;

    CREATE TABLE IF NOT EXISTS source_files (
        path            TEXT PRIMARY KEY,
        platform        TEXT NOT NULL,
        hash            TEXT NOT NULL,
        size            INTEGER NOT NULL,
        mtime_ms        INTEGER NOT NULL,
        updated_at      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schema_meta (
        id              INTEGER PRIMARY KEY CHECK (id = 1),
        schema_version  INTEGER NOT NULL,
        package_version TEXT NOT NULL
    );
`

interface SessionSummaryRow {
    session_id: string
    platform: string
    project_name: string
    repository: string
    thread_name: string
    session_started_at: string | null
    started_at: string | null
    last_activity: string | null
    input_token: number
    output_token: number
    cached_input_token: number
    reasoning_token: number
    total_token: number
    raw_cost_usd: number | null
    models_csv: string | null
}

interface InteractionInput {
    sessionId: string
    interactionIndex: number
    platform: string
    projectName: string
    repository: string
    threadName: string
    sessionStartedAt: string | null
    timestamp: string | null
    role: string
    type: string
    model: string | null
    inputToken: number
    outputToken: number
    cachedInputToken: number
    cacheCreation: number
    cacheRead: number
    reasoningToken: number
    totalToken: number
    provider?: string | null
    rawCostUsd?: number | null
    speed?: string | null
    isFallbackModel: boolean
    toolTokens: number
    extraTotalTokens: number
    dedupeKey: string | null
    fallbackDedupeKey: string | null
    sourceFile: string | null
    isSidechain: boolean
}

export class UsageCacheRepository {
    private database: SqliteDatabase
    private readonly databasePath: string

    constructor(databasePath: string) {
        mkdirParentDirectory(databasePath)
        this.databasePath = databasePath
        this.database = this.openDatabase()
        this.initializeSchema()
    }

    close() {
        this.database.close()
    }

    upsertInteractions(items: InteractionInput[]) {
        if (items.length === 0) {
            return
        }

        const statement = this.database.prepare(`
            INSERT OR REPLACE INTO sessions (
                id, session_id, interaction_index, platform, project_name,
                repository, thread_name, session_started_at,
                timestamp, role, type, model,
                input_token, output_token, cached_input_token,
                cache_creation, cache_read, reasoning_token, total_token,
                raw_cost_usd, speed, provider,
                is_fallback_model, tool_tokens, extra_total_tokens,
                dedupe_key, fallback_dedupe_key, source_file, is_sidechain,
                create_time
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        const now = dayjs().toISOString()

        this.database.exec('BEGIN')

        try {
            for (const item of items) {
                const id = createUsageInteractionIdentity({
                    interactionIndex: item.interactionIndex,
                    platform: item.platform,
                    repository: item.repository,
                    sessionId: item.sessionId,
                })

                statement.run(
                    id,
                    item.sessionId,
                    item.interactionIndex,
                    item.platform,
                    item.projectName,
                    item.repository,
                    item.threadName,
                    item.sessionStartedAt,
                    item.timestamp,
                    item.role,
                    item.type,
                    item.model,
                    item.inputToken,
                    item.outputToken,
                    item.cachedInputToken,
                    item.cacheCreation,
                    item.cacheRead,
                    item.reasoningToken,
                    item.totalToken,
                    item.rawCostUsd ?? null,
                    item.speed ?? null,
                    item.provider ?? null,
                    item.isFallbackModel ? 1 : 0,
                    item.toolTokens,
                    item.extraTotalTokens,
                    item.dedupeKey,
                    item.fallbackDedupeKey,
                    item.sourceFile,
                    item.isSidechain ? 1 : 0,
                    now,
                )
            }

            this.database.exec('COMMIT')
        }
        catch (error) {
            this.database.exec('ROLLBACK')
            throw error
        }
    }

    deleteSessionsBySourceFiles(paths: string[]) {
        if (paths.length === 0) {
            return
        }

        const placeholders = paths.map(() => '?').join(', ')
        this.database.prepare(`DELETE FROM sessions WHERE source_file IN (${placeholders})`).run(...paths)
    }

    deleteSessionsByPlatform(platform: string) {
        this.database.prepare('DELETE FROM sessions WHERE platform = ?').run(platform)
    }

    upsertSourceFiles(files: Array<{ hash: string, mtimeMs: number, path: string, platform: string, size: number }>) {
        if (files.length === 0) {
            return
        }

        const statement = this.database.prepare(`
            INSERT OR REPLACE INTO source_files (path, platform, hash, size, mtime_ms, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `)
        const now = dayjs().toISOString()
        this.database.exec('BEGIN')

        try {
            for (const file of files) {
                statement.run(file.path, file.platform, file.hash, file.size, file.mtimeMs, now)
            }

            this.database.exec('COMMIT')
        }
        catch (error) {
            this.database.exec('ROLLBACK')
            throw error
        }
    }

    deleteSourceFiles(paths: string[]) {
        if (paths.length === 0) {
            return
        }

        const placeholders = paths.map(() => '?').join(', ')
        this.database.prepare(`DELETE FROM source_files WHERE path IN (${placeholders})`).run(...paths)
    }

    loadSourceFileMetas(): IndexedUsageSourceFileMeta[] {
        const rows = this.database.prepare<SourceFileRow>(
            'SELECT path, platform, hash, size, mtime_ms, updated_at FROM source_files ORDER BY path ASC',
        ).all()

        return rows.map(row => ({
            cacheSignature: row.hash,
            mtimeMs: row.mtime_ms,
            path: row.path,
            platform: row.platform as ProjectUsagePlatform,
            projectNames: [],
            size: row.size,
            updatedAt: row.updated_at,
        }))
    }

    querySessionSummariesByPlatform(platforms: readonly ProjectUsagePlatform[]): Map<string, ProjectSessionUsageItem[]> {
        const result = new Map<string, ProjectSessionUsageItem[]>()

        for (const platform of platforms) {
            const rows = this.database.prepare<SessionSummaryRow>(`
                SELECT
                    session_id,
                    platform,
                    MIN(project_name) AS project_name,
                    repository,
                    MAX(thread_name) AS thread_name,
                    MIN(session_started_at) AS session_started_at,
                    MIN(timestamp) AS started_at,
                    MAX(timestamp) AS last_activity,
                    SUM(input_token) AS input_token,
                    SUM(output_token) AS output_token,
                    SUM(cached_input_token) AS cached_input_token,
                    SUM(reasoning_token) AS reasoning_token,
                    SUM(total_token) AS total_token,
                    SUM(COALESCE(raw_cost_usd, 0)) AS raw_cost_usd,
                    GROUP_CONCAT(DISTINCT model) AS models_csv
                FROM sessions
                WHERE platform = ?
                GROUP BY platform, repository, session_id
                HAVING SUM(total_token) > 0
                ORDER BY MIN(COALESCE(session_started_at, timestamp)) DESC
            `).all(platform)

            result.set(platform, rows.map(row => this.rowToSessionSummary(row)))
        }

        return result
    }

    queryInteractionEvents(filters: { projectName?: string, platform?: string } = {}): Array<{
        cacheCreationTokens: number
        cachedInputTokens: number
        costUSD: number
        inputTokens: number
        isFallbackModel: boolean
        model: string
        modelLookupCandidates?: string[]
        outputTokens: number
        platform: string
        project: string
        provider?: string | null
        rawCostUSD?: number | null
        reasoningOutputTokens: number
        repository: string
        sessionId: string
        speed?: 'fast' | 'standard' | null
        timestamp: string
        toolTokens: number
        totalTokens: number
    }> {
        const conditions: string[] = ['total_token > 0', 'timestamp IS NOT NULL']
        const params: unknown[] = []

        if (filters.projectName) {
            conditions.push('project_name = ?')
            params.push(filters.projectName)
        }

        if (filters.platform) {
            conditions.push('platform = ?')
            params.push(filters.platform)
        }

        const whereClause = `WHERE ${conditions.join(' AND ')}`

        return this.database.prepare<{
            session_id: string
            platform: string
            project_name: string
            repository: string
            model: string | null
            timestamp: string
            input_token: number
            output_token: number
            cached_input_token: number
            cache_creation: number
            cache_read: number
            reasoning_token: number
            total_token: number
            raw_cost_usd: number | null
            speed: string | null
            provider: string | null
            is_fallback_model: number
            tool_tokens: number
        }>(`
            SELECT
                session_id, platform, project_name, repository, model, timestamp,
                input_token, output_token, cached_input_token,
                cache_creation, cache_read, reasoning_token, total_token,
                raw_cost_usd, speed, provider,
                is_fallback_model, tool_tokens
            FROM sessions
            ${whereClause}
            ORDER BY timestamp ASC
        `).all(...params).map(row => ({
            cacheCreationTokens: row.cache_creation,
            cachedInputTokens: row.cached_input_token,
            costUSD: row.raw_cost_usd ?? 0,
            inputTokens: row.input_token,
            isFallbackModel: row.is_fallback_model === 1,
            model: row.model ?? 'unknown',
            outputTokens: row.output_token,
            platform: row.platform,
            project: row.project_name,
            provider: row.provider,
            rawCostUSD: row.raw_cost_usd,
            reasoningOutputTokens: row.reasoning_token,
            repository: row.repository,
            sessionId: createUsageSessionIdentity({
                platform: row.platform,
                repository: row.repository,
                sessionId: row.session_id,
            }),
            speed: row.speed === 'fast' || row.speed === 'standard' ? row.speed : null,
            timestamp: row.timestamp,
            toolTokens: row.tool_tokens,
            totalTokens: row.total_token,
        }))
    }

    queryInteractionEventsByPlatform(): Map<string, Array<{
        cacheCreationTokens: number
        cachedInputTokens: number
        costUSD: number
        inputTokens: number
        isFallbackModel: boolean
        model: string
        modelLookupCandidates?: string[]
        outputTokens: number
        platform: string
        project: string
        provider?: string | null
        rawCostUSD?: number | null
        reasoningOutputTokens: number
        repository: string
        sessionId: string
        speed?: 'fast' | 'standard' | null
        timestamp: string
        toolTokens: number
        totalTokens: number
    }>> {
        const rows = this.database.prepare<{
            session_id: string
            platform: string
            project_name: string
            repository: string
            model: string | null
            timestamp: string
            input_token: number
            output_token: number
            cached_input_token: number
            cache_creation: number
            cache_read: number
            reasoning_token: number
            total_token: number
            raw_cost_usd: number | null
            speed: string | null
            provider: string | null
            is_fallback_model: number
            tool_tokens: number
        }>(`
            SELECT
                session_id, platform, project_name, repository, model, timestamp,
                input_token, output_token, cached_input_token,
                cache_creation, cache_read, reasoning_token, total_token,
                raw_cost_usd, speed, provider,
                is_fallback_model, tool_tokens
            FROM sessions
            WHERE total_token > 0 AND timestamp IS NOT NULL
            ORDER BY platform ASC, timestamp ASC
        `).all()

        const result = new Map<string, Array<{
            cacheCreationTokens: number
            cachedInputTokens: number
            costUSD: number
            inputTokens: number
            isFallbackModel: boolean
            model: string
            modelLookupCandidates?: string[]
            outputTokens: number
            platform: string
            project: string
            provider?: string | null
            rawCostUSD?: number | null
            reasoningOutputTokens: number
            repository: string
            sessionId: string
            speed?: 'fast' | 'standard' | null
            timestamp: string
            toolTokens: number
            totalTokens: number
        }>>()

        for (const row of rows) {
            const list = result.get(row.platform) ?? []
            list.push({
                cacheCreationTokens: row.cache_creation,
                cachedInputTokens: row.cached_input_token,
                costUSD: row.raw_cost_usd ?? 0,
                inputTokens: row.input_token,
                isFallbackModel: row.is_fallback_model === 1,
                model: row.model ?? 'unknown',
                outputTokens: row.output_token,
                platform: row.platform,
                project: row.project_name,
                provider: row.provider,
                rawCostUSD: row.raw_cost_usd,
                reasoningOutputTokens: row.reasoning_token,
                repository: row.repository,
                sessionId: createUsageSessionIdentity({
                    platform: row.platform,
                    repository: row.repository,
                    sessionId: row.session_id,
                }),
                speed: row.speed === 'fast' || row.speed === 'standard' ? row.speed : null,
                timestamp: row.timestamp,
                toolTokens: row.tool_tokens,
                totalTokens: row.total_token,
            })
            result.set(row.platform, list)
        }

        return result
    }

    queryDailyTokenUsage(filters: { projectName?: string, platform?: string } = {}): DailyTokenUsage[] {
        const conditions: string[] = ['total_token > 0']
        const params: unknown[] = []

        if (filters.projectName) {
            conditions.push('project_name = ?')
            params.push(filters.projectName)
        }

        if (filters.platform) {
            conditions.push('platform = ?')
            params.push(filters.platform)
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

        const rows = this.database.prepare<{
            date_key: string
            input_token: number
            output_token: number
            cached_input_token: number
            reasoning_token: number
            total_token: number
            models_json: string
        }>(`
            SELECT
                DATE(COALESCE(timestamp, session_started_at)) AS date_key,
                SUM(input_token) AS input_token,
                SUM(output_token) AS output_token,
                SUM(cached_input_token) AS cached_input_token,
                SUM(reasoning_token) AS reasoning_token,
                SUM(total_token) AS total_token,
                json_group_array(DISTINCT model) AS models_json
            FROM sessions
            ${whereClause}
            GROUP BY date_key
            ORDER BY date_key DESC
        `).all(...params)

        return rows.map((row) => {
            let models: string[] = []

            try {
                models = JSON.parse(row.models_json).filter(Boolean)
            }
            catch {
                models = []
            }

            return {
                cachedInputTokens: row.cached_input_token,
                costUSD: 0,
                date: formatDateLabelFromDateKey(row.date_key),
                inputTokens: row.input_token,
                models: Object.fromEntries(models.map(model => [model, {
                    cachedInputTokens: 0,
                    costUSD: 0,
                    inputTokens: 0,
                    isFallback: false,
                    outputTokens: 0,
                    reasoningOutputTokens: 0,
                    totalTokens: 0,
                }])),
                outputTokens: row.output_token,
                reasoningOutputTokens: row.reasoning_token,
                totalTokens: row.total_token,
            }
        })
    }

    queryMonthlyModelUsage(filters: { projectName?: string, platform?: string } = {}): MonthlyModelUsage[] {
        const conditions: string[] = ['model IS NOT NULL', 'total_token > 0']
        const params: unknown[] = []

        if (filters.projectName) {
            conditions.push('project_name = ?')
            params.push(filters.projectName)
        }

        if (filters.platform) {
            conditions.push('platform = ?')
            params.push(filters.platform)
        }

        const whereClause = `WHERE ${conditions.join(' AND ')}`

        return this.database.prepare<{
            month: string
            model: string
            total_token: number
        }>(`
            SELECT
                SUBSTR(DATE(COALESCE(timestamp, session_started_at)), 1, 7) AS month,
                model,
                SUM(total_token) AS total_token
            FROM sessions
            ${whereClause}
            GROUP BY month, model
            ORDER BY month ASC, model ASC
        `).all(...params).map(row => ({
            model: row.model,
            month: row.month,
            tokenTotal: row.total_token,
        }))
    }

    queryProjectCatalog(): ProjectUsageCatalogItem[] {
        const rows = this.database.prepare<{
            project_name: string
            platforms_json: string
            total_token: number
        }>(`
            SELECT project_name,
                   json_group_array(DISTINCT platform) AS platforms_json,
                   SUM(total_token) AS total_token
            FROM sessions
            GROUP BY project_name
            ORDER BY project_name ASC
        `).all()

        return rows.map((row) => {
            let platforms: string[] = []

            try {
                platforms = JSON.parse(row.platforms_json)
            }
            catch {
                platforms = []
            }

            return {
                label: row.project_name,
                platforms: platforms
                    .filter(p => PROJECT_USAGE_PLATFORMS.includes(p as ProjectUsagePlatform))
                    .sort() as ProjectUsagePlatform[],
                totalTokens: row.total_token,
            }
        })
    }

    queryTopProjects(limit = 10): Array<{ projectName: string, sessionCount: number, totalTokens: number }> {
        const rows = this.database.prepare<{
            project_name: string
            session_count: number
            total_token: number
        }>(`
            SELECT project_name,
                   COUNT(*) AS session_count,
                   SUM(session_total_token) AS total_token
            FROM (
                SELECT project_name, platform, repository, session_id, SUM(total_token) AS session_total_token
                FROM sessions
                GROUP BY project_name, platform, repository, session_id
            )
            GROUP BY project_name
            ORDER BY total_token DESC
            LIMIT ?
        `).all(limit)

        return rows.map(row => ({
            projectName: row.project_name,
            sessionCount: row.session_count,
            totalTokens: row.total_token,
        }))
    }

    querySessionCount(filters: { platform?: string, projectName?: string } = {}): number {
        const conditions: string[] = []
        const params: unknown[] = []

        if (filters.platform) {
            conditions.push('platform = ?')
            params.push(filters.platform)
        }

        if (filters.projectName) {
            conditions.push('project_name = ?')
            params.push(filters.projectName)
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
        const row = this.database.prepare<{ count: number }>(`
            SELECT COUNT(*) AS count
            FROM (
                SELECT platform, repository, session_id
                FROM sessions
                ${whereClause}
                GROUP BY platform, repository, session_id
            )
        `).get(...params)

        return row?.count ?? 0
    }

    queryTodayInsights(): {
        previousPromptCount: number
        previousSessionCount: number
        promptCount: number
        sessionCount: number
        todayHourlyUsage: Array<{
            agents: Record<string, { costUSD: number, totalTokens: number }>
            costUSD: number
            hour: number
            label: string
            totalTokens: number
        }>
    } {
        const todayDate = todayStartOfDay()
        const todayDateKeyVal = todayDateKey()
        const previousDateKeyVal = previousDateKey(todayDateKeyVal)
        const { previousDayEnd, previousDayStart, todayEnd, todayStart } = getLocalDayQueryBoundaries(todayDate)

        // Today/previous session counts (by session_started_at)
        const sessionCounts = this.database.prepare<{
            date_key: string
            count: number
        }>(`
            SELECT date_key, COUNT(*) AS count
            FROM (
                SELECT CASE
                    WHEN session_started_at >= ? AND session_started_at < ? THEN ?
                    WHEN session_started_at >= ? AND session_started_at < ? THEN ?
                END AS date_key,
                platform,
                repository,
                session_id
                FROM sessions
                WHERE session_started_at IS NOT NULL
                  AND ((session_started_at >= ? AND session_started_at < ?)
                    OR (session_started_at >= ? AND session_started_at < ?))
                GROUP BY date_key, platform, repository, session_id
            )
            WHERE date_key IS NOT NULL
            GROUP BY date_key
        `).all(todayStart, todayEnd, todayDateKeyVal, previousDayStart, previousDayEnd, previousDateKeyVal, todayStart, todayEnd, previousDayStart, previousDayEnd)

        let sessionCount = 0
        let previousSessionCount = 0

        for (const row of sessionCounts) {
            if (row.date_key === todayDateKeyVal)
                sessionCount = row.count
            if (row.date_key === previousDateKeyVal)
                previousSessionCount = row.count
        }

        // Today/previous prompt counts (role = 'user')
        const promptCounts = this.database.prepare<{
            date_key: string
            count: number
        }>(`
            SELECT CASE
                WHEN timestamp >= ? AND timestamp < ? THEN ?
                WHEN timestamp >= ? AND timestamp < ? THEN ?
            END AS date_key,
            COUNT(*) AS count
            FROM sessions
            WHERE role = 'user'
              AND timestamp IS NOT NULL
              AND ((timestamp >= ? AND timestamp < ?)
                OR (timestamp >= ? AND timestamp < ?))
            GROUP BY date_key
        `).all(todayStart, todayEnd, todayDateKeyVal, previousDayStart, previousDayEnd, previousDateKeyVal, todayStart, todayEnd, previousDayStart, previousDayEnd)

        let promptCount = 0
        let previousPromptCount = 0

        for (const row of promptCounts) {
            if (row.date_key === todayDateKeyVal)
                promptCount = row.count
            if (row.date_key === previousDateKeyVal)
                previousPromptCount = row.count
        }

        // Today hourly usage — use local timezone offset to extract correct hour
        const offsetMinutes = -todayDate.getTimezoneOffset()
        const offsetSign = offsetMinutes >= 0 ? '+' : '-'
        const absOffset = Math.abs(offsetMinutes)
        const offsetHH = String(Math.floor(absOffset / 60)).padStart(2, '0')
        const offsetMM = String(absOffset % 60).padStart(2, '0')
        const tzModifier = `${offsetSign}${offsetHH}:${offsetMM}`

        const hourlyRows = this.database.prepare<{
            hour: string
            platform: string
            total_token: number
        }>(`
            SELECT
                SUBSTR(datetime(timestamp, ?), 12, 2) AS hour,
                platform,
                SUM(total_token) AS total_token
            FROM sessions
            WHERE timestamp IS NOT NULL
              AND timestamp >= ? AND timestamp < ?
              AND total_token > 0
            GROUP BY hour, platform
        `).all(tzModifier, todayStart, todayEnd)

        const hourlyMap = new Map<number, {
            agents: Map<string, { costUSD: number, totalTokens: number }>
            costUSD: number
            totalTokens: number
        }>()

        for (const row of hourlyRows) {
            const hour = Number.parseInt(row.hour, 10)

            if (!Number.isFinite(hour))
                continue

            const bucket = hourlyMap.get(hour) ?? { agents: new Map(), costUSD: 0, totalTokens: 0 }
            bucket.totalTokens += row.total_token
            bucket.agents.set(row.platform, {
                costUSD: 0,
                totalTokens: row.total_token,
            })
            hourlyMap.set(hour, bucket)
        }

        const todayHourlyUsage = Array.from({ length: 24 }, (_, hour) => ({
            agents: Object.fromEntries(hourlyMap.get(hour)?.agents.entries() ?? []),
            costUSD: 0,
            hour,
            label: `${String(hour).padStart(2, '0')}:00`,
            totalTokens: hourlyMap.get(hour)?.totalTokens ?? 0,
        }))

        return {
            previousPromptCount,
            previousSessionCount,
            promptCount,
            sessionCount,
            todayHourlyUsage,
        }
    }

    createPayloadHash(data: string): string {
        return createHash('sha1').update(data).digest('hex')
    }

    private rowToSessionSummary(row: SessionSummaryRow): ProjectSessionUsageItem {
        const sessionId = row.session_id
        const sessionIdentity = createUsageSessionIdentity({
            platform: row.platform,
            repository: row.repository ?? '',
            sessionId,
        })
        const modelsStr = row.models_csv ?? ''
        const models = modelsStr.split(',').filter(Boolean).sort()
        const topModel = models[0] ?? 'unknown'
        const startedAt = row.started_at ?? row.session_started_at ?? ''
        const lastActivity = row.last_activity ?? startedAt
        const dateKey = useDateFormat(startedAt) ?? ''
        const weekLabel = dateKey
            ? ((): string => {
                    const d = dayjs(startedAt).startOf('day')
                    const day = d.day()
                    const diff = day === 0 ? -6 : 1 - day
                    const ws = d.add(diff, 'day')
                    return `${ws.format('YYYY-MM-DD')} - ${ws.add(6, 'day').format('YYYY-MM-DD')}`
                })()
            : ''

        return {
            cachedInputTokens: row.cached_input_token ?? 0,
            costUSD: row.raw_cost_usd ?? 0,
            date: dateKey ? formatDateLabelFromDateKey(dateKey) : '',
            duration: '',
            durationMinutes: 0,
            id: sessionIdentity,
            inputTokens: row.input_token ?? 0,
            interactions: [],
            lastActivity,
            model: topModel,
            models,
            month: dateKey ? getMonthKey(startedAt) : '',
            outputTokens: row.output_token ?? 0,
            project: row.project_name ?? '',
            reasoningOutputTokens: row.reasoning_token ?? 0,
            repository: row.repository ?? '',
            sessionId,
            startedAt,
            threadName: row.thread_name ?? '',
            tokenTotal: row.total_token ?? 0,
            topModel,
            week: weekLabel,
        }
    }

    private initializeSchema() {
        this.database.exec(SCHEMA_SQL)

        const currentVersion = this.getCurrentSchemaVersion()
        const hasLegacyTables = this.hasLegacyTables()

        if ((currentVersion > 0 && currentVersion !== SCHEMA_VERSION) || hasLegacyTables) {
            this.resetCacheDatabase()
            this.database.exec(SCHEMA_SQL)
        }

        this.setSchemaVersion(SCHEMA_VERSION)
    }

    private hasLegacyTables(): boolean {
        try {
            const row = this.database.prepare<{ name: string }>(
                'SELECT name FROM sqlite_master WHERE type = \'table\' AND name = \'cache_schema_meta\'',
            ).get()

            return row !== undefined
        }
        catch {
            return false
        }
    }

    private getCurrentSchemaVersion(): number {
        try {
            const row = this.database.prepare<SchemaMetaRow>(
                'SELECT schema_version FROM schema_meta WHERE id = 1',
            ).get()

            return row?.schema_version ?? 0
        }
        catch {
            return 0
        }
    }

    private openDatabase() {
        const database = openSqliteDatabase(this.databasePath)
        database.exec('PRAGMA foreign_keys = ON')
        return database
    }

    private resetCacheDatabase() {
        this.database.close()

        for (const path of [this.databasePath, `${this.databasePath}-shm`, `${this.databasePath}-wal`]) {
            rmSync(path, {
                force: true,
                recursive: false,
            })
        }

        this.database = this.openDatabase()
    }

    private setSchemaVersion(version: number) {
        const row = this.database.prepare<{ package_version: string }>(
            'SELECT package_version FROM schema_meta WHERE id = 1',
        ).get()
        const packageVersion = row?.package_version ?? '0.0.0'

        this.database.prepare(`
            INSERT INTO schema_meta (id, schema_version, package_version)
            VALUES (1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                schema_version = excluded.schema_version,
                package_version = excluded.package_version
        `).run(version, packageVersion)
    }
}

function mkdirParentDirectory(filePath: string) {
    const directoryPath = dirname(filePath)

    if (!existsSync(directoryPath)) {
        mkdirSync(directoryPath, {
            recursive: true,
        })
    }
}
