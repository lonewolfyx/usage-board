import type { IndexedUsageSourceFile } from '#server/types/usage-indexer'
import type { SqliteDatabase } from '#server/utils/sqlite'
import type { ProjectUsagePlatform, ProjectUsagePlatformRecord } from '#shared/types/ai'
import type {
    DailyTokenUsage,
    LoadUsageResult,
    MonthlyModelUsage,
    ProjectInteractionUsage,
    ProjectPlatformUsage,
    ProjectSessionInteractionItem,
    ProjectSessionUsageItem,
    ProjectUsageDetail,
    TokensConsumptionResult,
    TokenUsageRow,
    UsageOverviewCard,
} from '#shared/types/usage-dashboard'
import type { ProjectUsageCatalogItem } from '#shared/types/ws'
import type {
    CacheStateRow,
    DailyUsageModelRow,
    DailyUsageRow,
    IndexedFileProjectRow,
    IndexedFileRow,
    IndexedFragmentRow,
    IndexedInteractionRow,
    LegacyIndexedSourceFileRow,
    LegacyProjectCatalogTypeRow,
    LegacyProjectSnapshotRow,
    LegacySnapshotRow,
    MonthlyModelUsageRow,
    OverviewCardRow,
    PersistedUsageScope,
    ProjectCatalogEntryRow,
    ProjectModelRow,
    ProjectRow,
    ProjectUsageRow,
    SchemaVersionRow,
    ScopeInteractionRow,
    SessionModelRow,
    SessionRow,
    SnapshotKey,
    SqliteNameRow,
    TokenRowBucket,
    TokenRowModelRow,
    TokenRowProjectRow,
    TokenRowRow,
    UsageScopeKind,
    UsageScopeRow,
} from './usage-cache.types'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { openSqliteDatabase } from '#server/utils/sqlite'
import {
    createEmptyLoadUsageResult,
    createEmptyProjectPlatformUsage,
    normalizeProjectUsageDetail,
} from '#shared/platform/defaults'
import { PROJECT_USAGE_PLATFORMS } from '#shared/types/ai'

const CACHE_SCHEMA_VERSION = 7
const ROW_KEY_SEPARATOR = '\u001F'
const CACHE_SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS cache_schema_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        schema_version INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cache_state (
        key TEXT PRIMARY KEY,
        payload_hash TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        version TEXT
    );

    CREATE TABLE IF NOT EXISTS project_catalog_entries (
        label TEXT PRIMARY KEY,
        platforms_json TEXT NOT NULL,
        total_tokens INTEGER NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
        label TEXT PRIMARY KEY,
        create_time TEXT,
        session_count INTEGER NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_models (
        project_label TEXT NOT NULL,
        model TEXT NOT NULL,
        model_order INTEGER NOT NULL,
        PRIMARY KEY (project_label, model),
        FOREIGN KEY (project_label) REFERENCES projects(label) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS usage_scopes (
        scope_key TEXT PRIMARY KEY,
        scope_kind TEXT NOT NULL,
        project_label TEXT,
        platform TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        today_total_cost REAL NOT NULL,
        today_total_tokens INTEGER NOT NULL,
        today_top_model TEXT,
        today_top_model_total_tokens INTEGER,
        today_top_project TEXT,
        today_top_project_session_count INTEGER,
        FOREIGN KEY (project_label) REFERENCES projects(label) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_usage_scopes_kind ON usage_scopes(scope_kind);
    CREATE INDEX IF NOT EXISTS idx_usage_scopes_project ON usage_scopes(project_label);

    CREATE TABLE IF NOT EXISTS usage_scope_overview_cards (
        scope_key TEXT NOT NULL,
        position INTEGER NOT NULL,
        icon TEXT NOT NULL,
        name TEXT NOT NULL,
        value TEXT NOT NULL,
        detail TEXT,
        trend TEXT NOT NULL,
        trend_tone TEXT NOT NULL,
        PRIMARY KEY (scope_key, position),
        FOREIGN KEY (scope_key) REFERENCES usage_scopes(scope_key) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS usage_scope_token_rows (
        scope_key TEXT NOT NULL,
        bucket TEXT NOT NULL,
        row_order INTEGER NOT NULL,
        row_id TEXT NOT NULL,
        label TEXT NOT NULL,
        period TEXT NOT NULL,
        session_count INTEGER NOT NULL,
        input_tokens INTEGER NOT NULL,
        cached_input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        reasoning_output_tokens INTEGER NOT NULL,
        total_tokens INTEGER NOT NULL,
        cost_usd REAL NOT NULL,
        PRIMARY KEY (scope_key, bucket, row_id),
        FOREIGN KEY (scope_key) REFERENCES usage_scopes(scope_key) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_usage_scope_token_rows_order
        ON usage_scope_token_rows(scope_key, bucket, row_order);

    CREATE TABLE IF NOT EXISTS usage_scope_token_row_models (
        scope_key TEXT NOT NULL,
        bucket TEXT NOT NULL,
        row_id TEXT NOT NULL,
        model TEXT NOT NULL,
        model_order INTEGER NOT NULL,
        PRIMARY KEY (scope_key, bucket, row_id, model),
        FOREIGN KEY (scope_key, bucket, row_id)
            REFERENCES usage_scope_token_rows(scope_key, bucket, row_id)
            ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS usage_scope_token_row_projects (
        scope_key TEXT NOT NULL,
        bucket TEXT NOT NULL,
        row_id TEXT NOT NULL,
        project TEXT NOT NULL,
        project_order INTEGER NOT NULL,
        PRIMARY KEY (scope_key, bucket, row_id, project),
        FOREIGN KEY (scope_key, bucket, row_id)
            REFERENCES usage_scope_token_rows(scope_key, bucket, row_id)
            ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS usage_scope_daily_usage (
        scope_key TEXT NOT NULL,
        row_order INTEGER NOT NULL,
        date TEXT NOT NULL,
        input_tokens INTEGER NOT NULL,
        cached_input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        reasoning_output_tokens INTEGER NOT NULL,
        total_tokens INTEGER NOT NULL,
        cost_usd REAL NOT NULL,
        PRIMARY KEY (scope_key, date),
        FOREIGN KEY (scope_key) REFERENCES usage_scopes(scope_key) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_usage_scope_daily_usage_order
        ON usage_scope_daily_usage(scope_key, row_order);

    CREATE TABLE IF NOT EXISTS usage_scope_daily_usage_models (
        scope_key TEXT NOT NULL,
        date TEXT NOT NULL,
        model TEXT NOT NULL,
        model_order INTEGER NOT NULL,
        input_tokens INTEGER NOT NULL,
        cached_input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        reasoning_output_tokens INTEGER NOT NULL,
        total_tokens INTEGER NOT NULL,
        cost_usd REAL NOT NULL,
        is_fallback INTEGER NOT NULL,
        PRIMARY KEY (scope_key, date, model),
        FOREIGN KEY (scope_key, date)
            REFERENCES usage_scope_daily_usage(scope_key, date)
            ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS usage_scope_monthly_model_usage (
        scope_key TEXT NOT NULL,
        row_order INTEGER NOT NULL,
        month TEXT NOT NULL,
        model TEXT NOT NULL,
        token_total INTEGER NOT NULL,
        PRIMARY KEY (scope_key, month, model),
        FOREIGN KEY (scope_key) REFERENCES usage_scopes(scope_key) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_usage_scope_monthly_model_usage_order
        ON usage_scope_monthly_model_usage(scope_key, row_order);

    CREATE TABLE IF NOT EXISTS usage_scope_project_usage (
        scope_key TEXT NOT NULL,
        row_order INTEGER NOT NULL,
        label TEXT NOT NULL,
        value TEXT NOT NULL,
        detail TEXT NOT NULL,
        percent REAL NOT NULL,
        tone TEXT,
        repository TEXT NOT NULL,
        sessions INTEGER NOT NULL,
        token_total INTEGER NOT NULL,
        cost_usd REAL NOT NULL,
        PRIMARY KEY (scope_key, label, repository),
        FOREIGN KEY (scope_key) REFERENCES usage_scopes(scope_key) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_usage_scope_project_usage_order
        ON usage_scope_project_usage(scope_key, row_order);

    CREATE TABLE IF NOT EXISTS usage_scope_sessions (
        scope_key TEXT NOT NULL,
        session_key TEXT NOT NULL,
        session_order INTEGER NOT NULL,
        session_id TEXT NOT NULL,
        thread_name TEXT NOT NULL,
        project TEXT NOT NULL,
        repository TEXT NOT NULL,
        model TEXT NOT NULL,
        started_at TEXT NOT NULL,
        date TEXT NOT NULL,
        month TEXT NOT NULL,
        week TEXT NOT NULL,
        duration TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL,
        input_tokens INTEGER NOT NULL,
        cached_input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        reasoning_output_tokens INTEGER NOT NULL,
        token_total INTEGER NOT NULL,
        cost_usd REAL NOT NULL,
        last_activity TEXT NOT NULL,
        top_model TEXT NOT NULL,
        PRIMARY KEY (scope_key, session_key),
        FOREIGN KEY (scope_key) REFERENCES usage_scopes(scope_key) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_usage_scope_sessions_order
        ON usage_scope_sessions(scope_key, session_order);

    CREATE TABLE IF NOT EXISTS usage_scope_session_models (
        scope_key TEXT NOT NULL,
        session_key TEXT NOT NULL,
        model TEXT NOT NULL,
        model_order INTEGER NOT NULL,
        PRIMARY KEY (scope_key, session_key, model),
        FOREIGN KEY (scope_key, session_key)
            REFERENCES usage_scope_sessions(scope_key, session_key)
            ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS usage_scope_interactions (
        scope_key TEXT NOT NULL,
        session_key TEXT NOT NULL,
        interaction_order INTEGER NOT NULL,
        interaction_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        cost_usd REAL NOT NULL,
        model TEXT,
        role TEXT NOT NULL,
        timestamp TEXT,
        type TEXT NOT NULL,
        input_tokens INTEGER,
        cached_input_tokens INTEGER,
        output_tokens INTEGER,
        reasoning_output_tokens INTEGER,
        extra_total_tokens INTEGER,
        total_tokens INTEGER,
        usage_cost_usd REAL,
        cache_creation_tokens INTEGER,
        cache_read_tokens INTEGER,
        tool_tokens INTEGER,
        is_fallback_model INTEGER,
        PRIMARY KEY (scope_key, session_key, interaction_order),
        FOREIGN KEY (scope_key, session_key)
            REFERENCES usage_scope_sessions(scope_key, session_key)
            ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS indexed_files (
        path TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        cache_signature TEXT NOT NULL DEFAULT '',
        size INTEGER NOT NULL,
        mtime_ms INTEGER NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS indexed_file_projects (
        path TEXT NOT NULL,
        project_name TEXT NOT NULL,
        project_order INTEGER NOT NULL,
        PRIMARY KEY (path, project_name),
        FOREIGN KEY (path) REFERENCES indexed_files(path) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS indexed_file_fragments (
        fragment_id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL,
        fragment_order INTEGER NOT NULL,
        fragment_key TEXT NOT NULL,
        project TEXT NOT NULL,
        repository TEXT NOT NULL,
        session_id TEXT NOT NULL,
        started_at TEXT,
        duration_end_at TEXT,
        thread_name TEXT NOT NULL,
        UNIQUE (path, fragment_order),
        FOREIGN KEY (path) REFERENCES indexed_files(path) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_indexed_file_fragments_path_order
        ON indexed_file_fragments(path, fragment_order);

    CREATE TABLE IF NOT EXISTS indexed_fragment_interactions (
        fragment_id INTEGER NOT NULL,
        interaction_order INTEGER NOT NULL,
        interaction_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        cost_usd REAL NOT NULL,
        dedupe_key TEXT,
        model TEXT,
        role TEXT NOT NULL,
        timestamp TEXT,
        type TEXT NOT NULL,
        input_tokens INTEGER,
        cached_input_tokens INTEGER,
        output_tokens INTEGER,
        reasoning_output_tokens INTEGER,
        extra_total_tokens INTEGER,
        total_tokens INTEGER,
        usage_cost_usd REAL,
        cache_creation_tokens INTEGER,
        cache_read_tokens INTEGER,
        tool_tokens INTEGER,
        is_fallback_model INTEGER,
        PRIMARY KEY (fragment_id, interaction_order),
        FOREIGN KEY (fragment_id) REFERENCES indexed_file_fragments(fragment_id) ON DELETE CASCADE
    );
`

export class UsageCacheRepository {
    private readonly database: SqliteDatabase

    constructor(databasePath: string) {
        mkdirParentDirectory(databasePath)
        this.database = openSqliteDatabase(databasePath)
        this.database.exec('PRAGMA foreign_keys = ON')
        this.initializeSchema()
    }

    loadBootstrap() {
        const meta = this.getCacheState('bootstrap')

        if (!meta) {
            return null
        }

        const scopes = this.loadHydratedUsageScopes('bootstrap')
        const payload = Object.fromEntries(
            PROJECT_USAGE_PLATFORMS.map(platform => [
                platform,
                scopes.get(createUsageScopeKey('bootstrap', platform)) ?? createEmptyPersistedUsageScope(),
            ]),
        ) as unknown as ProjectUsagePlatformRecord<LoadUsageResult>

        return {
            payload: {
                ...payload,
                version: meta.version ?? '',
            } as TokensConsumptionResult,
            payloadHash: meta.payload_hash,
            updatedAt: meta.updated_at,
        }
    }

    saveBootstrap(payload: TokensConsumptionResult) {
        this.persistBootstrap(payload)
    }

    loadProjectCatalog() {
        const meta = this.getCacheState('project_catalog')

        if (!meta) {
            return null
        }

        const rows: ProjectCatalogEntryRow[] = this.database.prepare<ProjectCatalogEntryRow>(`
            SELECT label, platforms_json, total_tokens
            FROM project_catalog_entries
            ORDER BY label ASC
        `).all()

        return {
            payload: rows.map(row => ({
                label: row.label,
                platforms: parseProjectCatalogPlatforms(row.platforms_json),
                totalTokens: row.total_tokens,
            })),
            payloadHash: meta.payload_hash,
            updatedAt: meta.updated_at,
        }
    }

    saveProjectCatalog(payload: ProjectUsageCatalogItem[]) {
        this.persistProjectCatalog(payload)
    }

    loadProjectDetails() {
        const projects: ProjectRow[] = this.database.prepare<ProjectRow>(`
            SELECT label, create_time, session_count
            FROM projects
            ORDER BY label ASC
        `).all()

        if (projects.length === 0) {
            return new Map<string, ProjectUsageDetail>()
        }

        const projectModels = groupProjectModels(this.database.prepare<ProjectModelRow>(`
            SELECT project_label, model, model_order
            FROM project_models
            ORDER BY project_label ASC, model_order ASC
        `).all())
        const scopes = this.loadHydratedUsageScopes('project')
        const details = new Map<string, ProjectUsageDetail>()

        for (const project of projects) {
            const analyzing = Object.fromEntries(
                PROJECT_USAGE_PLATFORMS.map((platform) => {
                    const scopeKey = createUsageScopeKey('project', platform, project.label)
                    const usage = scopes.get(scopeKey)

                    return [
                        platform,
                        usage
                            ? {
                                    ...usage,
                                    sessions: usage.sessionUsage,
                                }
                            : createEmptyProjectPlatformUsage(),
                    ]
                }),
            ) as ProjectUsagePlatformRecord<ProjectPlatformUsage>

            details.set(project.label, normalizeProjectUsageDetail({
                analyzing,
                createTime: project.create_time,
                label: project.label,
                models: projectModels.get(project.label) ?? [],
                sessionCound: project.session_count,
            }))
        }

        return details
    }

    loadIndexedSourceFiles() {
        const files: IndexedFileRow[] = this.database.prepare<IndexedFileRow>(`
            SELECT path, platform, cache_signature, size, mtime_ms, updated_at
            FROM indexed_files
            ORDER BY path ASC
        `).all()

        if (files.length === 0) {
            return []
        }

        const projectNamesByPath = groupIndexedFileProjects(this.database.prepare<IndexedFileProjectRow>(`
            SELECT path, project_name, project_order
            FROM indexed_file_projects
            ORDER BY path ASC, project_order ASC
        `).all())
        const fragments = this.database.prepare<IndexedFragmentRow>(`
            SELECT
                fragment_id,
                path,
                fragment_order,
                fragment_key,
                project,
                repository,
                session_id,
                started_at,
                duration_end_at,
                thread_name
            FROM indexed_file_fragments
            ORDER BY path ASC, fragment_order ASC
        `).all()
        const interactions = this.database.prepare<IndexedInteractionRow>(`
            SELECT
                fragment_id,
                interaction_order,
                interaction_index,
                content,
                cost_usd,
                dedupe_key,
                model,
                role,
                timestamp,
                type,
                input_tokens,
                cached_input_tokens,
                output_tokens,
                reasoning_output_tokens,
                extra_total_tokens,
                total_tokens,
                usage_cost_usd,
                cache_creation_tokens,
                cache_read_tokens,
                tool_tokens,
                is_fallback_model
            FROM indexed_fragment_interactions
            ORDER BY fragment_id ASC, interaction_order ASC
        `).all()

        const interactionsByFragment = groupIndexedInteractions(interactions)
        const fragmentsByPath = new Map<string, IndexedUsageSourceFile['payload']>()

        for (const fragment of fragments) {
            const payload = fragmentsByPath.get(fragment.path) ?? []
            payload.push({
                durationEndAt: fragment.duration_end_at ?? '',
                interactions: interactionsByFragment.get(fragment.fragment_id) ?? [],
                key: fragment.fragment_key,
                project: fragment.project,
                repository: fragment.repository,
                sessionId: fragment.session_id,
                startedAt: fragment.started_at,
                threadName: fragment.thread_name,
            })
            fragmentsByPath.set(fragment.path, payload)
        }

        return files.map(file => ({
            cacheSignature: file.cache_signature,
            mtimeMs: file.mtime_ms,
            path: file.path,
            payload: fragmentsByPath.get(file.path) ?? [],
            platform: file.platform,
            projectNames: projectNamesByPath.get(file.path) ?? [],
            size: file.size,
            updatedAt: file.updated_at,
        } satisfies IndexedUsageSourceFile))
    }

    upsertIndexedSourceFiles(files: IndexedUsageSourceFile[]) {
        if (files.length === 0) {
            return
        }

        const deleteFileStatement = this.database.prepare('DELETE FROM indexed_files WHERE path = ?')
        const insertFileStatement = this.database.prepare(`
            INSERT INTO indexed_files (path, platform, cache_signature, size, mtime_ms, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `)
        const insertProjectStatement = this.database.prepare(`
            INSERT INTO indexed_file_projects (path, project_name, project_order)
            VALUES (?, ?, ?)
        `)
        const insertFragmentStatement = this.database.prepare(`
            INSERT INTO indexed_file_fragments (
                path,
                fragment_order,
                fragment_key,
                project,
                repository,
                session_id,
                started_at,
                duration_end_at,
                thread_name
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        const insertInteractionStatement = this.database.prepare(`
            INSERT INTO indexed_fragment_interactions (
                fragment_id,
                interaction_order,
                interaction_index,
                content,
                cost_usd,
                dedupe_key,
                model,
                role,
                timestamp,
                type,
                input_tokens,
                cached_input_tokens,
                output_tokens,
                reasoning_output_tokens,
                extra_total_tokens,
                total_tokens,
                usage_cost_usd,
                cache_creation_tokens,
                cache_read_tokens,
                tool_tokens,
                is_fallback_model
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)

        this.database.exec('BEGIN')

        try {
            for (const file of files) {
                deleteFileStatement.run(file.path)
                insertFileStatement.run(file.path, file.platform, file.cacheSignature, file.size, file.mtimeMs, file.updatedAt)

                for (const [projectOrder, projectName] of file.projectNames.entries()) {
                    insertProjectStatement.run(file.path, projectName, projectOrder)
                }

                for (const [fragmentOrder, fragment] of file.payload.entries()) {
                    const result = insertFragmentStatement.run(
                        file.path,
                        fragmentOrder,
                        fragment.key,
                        fragment.project,
                        fragment.repository,
                        fragment.sessionId,
                        fragment.startedAt,
                        fragment.durationEndAt,
                        fragment.threadName,
                    )
                    const fragmentId = Number(result.lastInsertRowid)

                    for (const [interactionOrder, interaction] of fragment.interactions.entries()) {
                        insertInteractionStatement.run(
                            fragmentId,
                            interactionOrder,
                            interaction.index,
                            interaction.content,
                            interaction.costUSD,
                            interaction.dedupeKey ?? null,
                            interaction.model,
                            interaction.role,
                            interaction.timestamp,
                            interaction.type,
                            interaction.usage?.inputTokens ?? null,
                            interaction.usage?.cachedInputTokens ?? null,
                            interaction.usage?.outputTokens ?? null,
                            interaction.usage?.reasoningOutputTokens ?? null,
                            interaction.usage?.extraTotalTokens ?? null,
                            interaction.usage?.totalTokens ?? null,
                            interaction.usage?.costUSD ?? null,
                            interaction.usage?.cacheCreationTokens ?? null,
                            interaction.usage?.cacheReadTokens ?? null,
                            interaction.usage?.toolTokens ?? null,
                            interaction.usage?.isFallbackModel ? 1 : 0,
                        )
                    }
                }
            }

            this.database.exec('COMMIT')
        }
        catch (error) {
            this.database.exec('ROLLBACK')
            throw error
        }
    }

    deleteIndexedSourceFiles(paths: string[]) {
        if (paths.length === 0) {
            return
        }

        const statement = this.database.prepare('DELETE FROM indexed_files WHERE path = ?')
        this.database.exec('BEGIN')

        try {
            for (const path of paths) {
                statement.run(path)
            }

            this.database.exec('COMMIT')
        }
        catch (error) {
            this.database.exec('ROLLBACK')
            throw error
        }
    }

    replaceProjectDetails(details: Map<string, ProjectUsageDetail>) {
        const insertProjectStatement = this.database.prepare(`
            INSERT INTO projects (label, create_time, session_count, updated_at)
            VALUES (?, ?, ?, ?)
        `)
        const insertProjectModelStatement = this.database.prepare(`
            INSERT INTO project_models (project_label, model, model_order)
            VALUES (?, ?, ?)
        `)
        const now = new Date().toISOString()

        this.database.exec('BEGIN')

        try {
            this.database.prepare('DELETE FROM projects').run()

            for (const [label, detail] of details.entries()) {
                const sanitizedDetail = stripRawPayload(detail)
                insertProjectStatement.run(
                    label,
                    sanitizedDetail.createTime,
                    sanitizedDetail.sessionCound,
                    now,
                )

                for (const [modelOrder, model] of sanitizedDetail.models.entries()) {
                    insertProjectModelStatement.run(label, model, modelOrder)
                }

                for (const platform of PROJECT_USAGE_PLATFORMS) {
                    this.insertUsageScope({
                        kind: 'project',
                        platform,
                        projectLabel: label,
                        updatedAt: now,
                        usage: sanitizedDetail.analyzing[platform],
                    })
                }
            }

            this.database.exec('COMMIT')
        }
        catch (error) {
            this.database.exec('ROLLBACK')
            throw error
        }
    }

    close() {
        this.database.close()
    }

    private initializeSchema() {
        this.database.exec(CACHE_SCHEMA_SQL)
        this.ensureIndexedFilesCacheSignatureColumn()
        this.ensureDailyUsageModelCostColumn()
        this.ensureProjectCatalogColumns()
        this.ensureInteractionExtraTotalTokenColumns()

        const currentSchemaVersion = this.getCurrentSchemaVersion()

        if (currentSchemaVersion >= CACHE_SCHEMA_VERSION) {
            return
        }

        this.migrateLegacyDataIfNeeded()
        this.setSchemaVersion(CACHE_SCHEMA_VERSION)
    }

    private getCurrentSchemaVersion() {
        return this.database.prepare<SchemaVersionRow>(`
            SELECT schema_version
            FROM cache_schema_meta
            WHERE id = 1
        `).get()?.schema_version ?? 0
    }

    private setSchemaVersion(version: number) {
        this.database.prepare(`
            INSERT INTO cache_schema_meta (id, schema_version)
            VALUES (1, ?)
            ON CONFLICT(id) DO UPDATE SET
                schema_version = excluded.schema_version
        `).run(version)
    }

    private migrateLegacyDataIfNeeded() {
        if (!this.hasLegacyData()) {
            return
        }

        this.clearNormalizedTables()

        const hasLegacySnapshots = this.hasTable('cache_snapshots')
        const hasLegacyProjectSnapshots = this.hasTable('project_snapshots')
        const hasLegacyIndexedFiles = this.hasTable('indexed_source_files')

        if (hasLegacySnapshots) {
            const bootstrap = this.loadLegacyBootstrap()
            const projectCatalog = this.loadLegacyProjectCatalog()

            if (bootstrap) {
                this.persistBootstrap(bootstrap.payload, {
                    payloadHash: bootstrap.payloadHash,
                    updatedAt: bootstrap.updatedAt,
                    version: bootstrap.payload.version,
                })
            }

            if (projectCatalog) {
                this.persistProjectCatalog(projectCatalog.payload, {
                    payloadHash: projectCatalog.payloadHash,
                    updatedAt: projectCatalog.updatedAt,
                })
            }
        }

        if (hasLegacyProjectSnapshots) {
            this.replaceProjectDetails(this.loadLegacyProjectDetails())
        }

        if (hasLegacyIndexedFiles) {
            this.upsertIndexedSourceFiles(this.loadLegacyIndexedSourceFiles())
        }

        this.dropLegacyTables()
    }

    private hasLegacyData() {
        return this.hasTable('cache_snapshots')
            || this.hasTable('project_snapshots')
            || this.hasTable('indexed_source_files')
    }

    private ensureIndexedFilesCacheSignatureColumn() {
        if (!this.hasTable('indexed_files')) {
            return
        }

        const columns = this.database.prepare<SqliteNameRow>('PRAGMA table_info(indexed_files)').all()

        if (columns.some(column => column.name === 'cache_signature')) {
            return
        }

        this.database.exec('ALTER TABLE indexed_files ADD COLUMN cache_signature TEXT NOT NULL DEFAULT \'\'')
    }

    private ensureProjectCatalogColumns() {
        if (!this.hasTable('project_catalog_entries')) {
            return
        }

        const columns = this.database.prepare<SqliteNameRow>('PRAGMA table_info(project_catalog_entries)').all()

        if (!columns.some(column => column.name === 'platforms_json')) {
            this.database.exec('ALTER TABLE project_catalog_entries ADD COLUMN platforms_json TEXT NOT NULL DEFAULT \'[]\'')
        }

        if (!columns.some(column => column.name === 'total_tokens')) {
            this.database.exec('ALTER TABLE project_catalog_entries ADD COLUMN total_tokens INTEGER NOT NULL DEFAULT 0')
        }

        if (!columns.some(column => column.name === 'type')) {
            return
        }

        const legacyRows = this.database.prepare<LegacyProjectCatalogTypeRow>(`
            SELECT label, type
            FROM project_catalog_entries
        `).all()
        const updateStatement = this.database.prepare(`
            UPDATE project_catalog_entries
            SET platforms_json = ?, total_tokens = 0
            WHERE label = ?
        `)

        for (const row of legacyRows) {
            const platforms = row.type === 'mixed' ? [] : [row.type]
            updateStatement.run(JSON.stringify(platforms), row.label)
        }
    }

    private ensureDailyUsageModelCostColumn() {
        if (!this.hasTable('usage_scope_daily_usage_models')) {
            return
        }

        const columns = this.database.prepare<SqliteNameRow>('PRAGMA table_info(usage_scope_daily_usage_models)').all()

        if (columns.some(column => column.name === 'cost_usd')) {
            return
        }

        this.database.exec('ALTER TABLE usage_scope_daily_usage_models ADD COLUMN cost_usd REAL NOT NULL DEFAULT 0')
    }

    private ensureInteractionExtraTotalTokenColumns() {
        if (this.hasTable('usage_scope_interactions')) {
            const usageScopeInteractionColumns = this.database.prepare<SqliteNameRow>('PRAGMA table_info(usage_scope_interactions)').all()

            if (!usageScopeInteractionColumns.some(column => column.name === 'extra_total_tokens')) {
                this.database.exec('ALTER TABLE usage_scope_interactions ADD COLUMN extra_total_tokens INTEGER')
            }
        }

        if (this.hasTable('indexed_fragment_interactions')) {
            const indexedInteractionColumns = this.database.prepare<SqliteNameRow>('PRAGMA table_info(indexed_fragment_interactions)').all()

            if (!indexedInteractionColumns.some(column => column.name === 'extra_total_tokens')) {
                this.database.exec('ALTER TABLE indexed_fragment_interactions ADD COLUMN extra_total_tokens INTEGER')
            }
        }
    }

    private clearNormalizedTables() {
        this.database.exec('BEGIN')

        try {
            this.database.prepare('DELETE FROM cache_state').run()
            this.database.prepare('DELETE FROM project_catalog_entries').run()
            this.database.prepare('DELETE FROM projects').run()
            this.database.prepare('DELETE FROM usage_scopes').run()
            this.database.prepare('DELETE FROM indexed_files').run()
            this.database.exec('COMMIT')
        }
        catch (error) {
            this.database.exec('ROLLBACK')
            throw error
        }
    }

    private dropLegacyTables() {
        this.database.exec(`
            DROP TABLE IF EXISTS cache_snapshots;
            DROP TABLE IF EXISTS project_snapshots;
            DROP TABLE IF EXISTS indexed_source_files;
        `)
    }

    private hasTable(tableName: string) {
        const row = this.database.prepare<SqliteNameRow>(`
            SELECT name
            FROM sqlite_master
            WHERE type = 'table' AND name = ?
        `).get(tableName)

        return Boolean(row)
    }

    private getCacheState(key: SnapshotKey) {
        return this.database.prepare<CacheStateRow>(`
            SELECT key, payload_hash, updated_at, version
            FROM cache_state
            WHERE key = ?
        `).get(key)
    }

    private persistBootstrap(
        payload: TokensConsumptionResult,
        options: {
            payloadHash?: string
            updatedAt?: string
            version?: string
        } = {},
    ) {
        const updatedAt = options.updatedAt ?? new Date().toISOString()
        const payloadHash = options.payloadHash ?? createPayloadHash(JSON.stringify(payload))
        const version = options.version ?? payload.version

        this.database.exec('BEGIN')

        try {
            this.database.prepare(`DELETE FROM usage_scopes WHERE scope_kind = 'bootstrap'`).run()

            for (const platform of PROJECT_USAGE_PLATFORMS) {
                this.insertUsageScope({
                    kind: 'bootstrap',
                    platform,
                    updatedAt,
                    usage: payload[platform] as unknown as PersistedUsageScope,
                })
            }

            this.upsertCacheState('bootstrap', payloadHash, updatedAt, version)
            this.database.exec('COMMIT')
        }
        catch (error) {
            this.database.exec('ROLLBACK')
            throw error
        }
    }

    private persistProjectCatalog(
        payload: ProjectUsageCatalogItem[],
        options: {
            payloadHash?: string
            updatedAt?: string
        } = {},
    ) {
        const updatedAt = options.updatedAt ?? new Date().toISOString()
        const payloadHash = options.payloadHash ?? createPayloadHash(JSON.stringify(payload))
        const deleteStatement = this.database.prepare('DELETE FROM project_catalog_entries')
        const insertStatement = this.database.prepare(`
            INSERT INTO project_catalog_entries (label, platforms_json, total_tokens, updated_at)
            VALUES (?, ?, ?, ?)
        `)

        this.database.exec('BEGIN')

        try {
            deleteStatement.run()

            for (const item of payload) {
                insertStatement.run(item.label, JSON.stringify(item.platforms), item.totalTokens, updatedAt)
            }

            this.upsertCacheState('project_catalog', payloadHash, updatedAt)
            this.database.exec('COMMIT')
        }
        catch (error) {
            this.database.exec('ROLLBACK')
            throw error
        }
    }

    private upsertCacheState(
        key: SnapshotKey,
        payloadHash: string,
        updatedAt: string,
        version?: string,
    ) {
        this.database.prepare(`
            INSERT INTO cache_state (key, payload_hash, updated_at, version)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                payload_hash = excluded.payload_hash,
                updated_at = excluded.updated_at,
                version = excluded.version
        `).run(key, payloadHash, updatedAt, version ?? null)
    }

    private insertUsageScope(options: {
        kind: UsageScopeKind
        platform: ProjectUsagePlatform
        projectLabel?: string
        updatedAt: string
        usage: PersistedUsageScope
    }) {
        const scopeKey = createUsageScopeKey(options.kind, options.platform, options.projectLabel)
        const payloadHash = createPayloadHash(JSON.stringify(options.usage))
        const insertScopeStatement = this.database.prepare(`
            INSERT INTO usage_scopes (
                scope_key,
                scope_kind,
                project_label,
                platform,
                payload_hash,
                updated_at,
                today_total_cost,
                today_total_tokens,
                today_top_model,
                today_top_model_total_tokens,
                today_top_project,
                today_top_project_session_count
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        const insertOverviewCardStatement = this.database.prepare(`
            INSERT INTO usage_scope_overview_cards (
                scope_key,
                position,
                icon,
                name,
                value,
                detail,
                trend,
                trend_tone
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        const insertTokenRowStatement = this.database.prepare(`
            INSERT INTO usage_scope_token_rows (
                scope_key,
                bucket,
                row_order,
                row_id,
                label,
                period,
                session_count,
                input_tokens,
                cached_input_tokens,
                output_tokens,
                reasoning_output_tokens,
                total_tokens,
                cost_usd
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        const insertTokenRowModelStatement = this.database.prepare(`
            INSERT INTO usage_scope_token_row_models (
                scope_key,
                bucket,
                row_id,
                model,
                model_order
            )
            VALUES (?, ?, ?, ?, ?)
        `)
        const insertTokenRowProjectStatement = this.database.prepare(`
            INSERT INTO usage_scope_token_row_projects (
                scope_key,
                bucket,
                row_id,
                project,
                project_order
            )
            VALUES (?, ?, ?, ?, ?)
        `)
        const insertDailyUsageStatement = this.database.prepare(`
            INSERT INTO usage_scope_daily_usage (
                scope_key,
                row_order,
                date,
                input_tokens,
                cached_input_tokens,
                output_tokens,
                reasoning_output_tokens,
                total_tokens,
                cost_usd
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        const insertDailyUsageModelStatement = this.database.prepare(`
            INSERT INTO usage_scope_daily_usage_models (
                scope_key,
                date,
                model,
                model_order,
                input_tokens,
                cached_input_tokens,
                output_tokens,
                reasoning_output_tokens,
                total_tokens,
                cost_usd,
                is_fallback
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        const insertMonthlyModelStatement = this.database.prepare(`
            INSERT INTO usage_scope_monthly_model_usage (
                scope_key,
                row_order,
                month,
                model,
                token_total
            )
            VALUES (?, ?, ?, ?, ?)
        `)
        const insertProjectUsageStatement = this.database.prepare(`
            INSERT INTO usage_scope_project_usage (
                scope_key,
                row_order,
                label,
                value,
                detail,
                percent,
                tone,
                repository,
                sessions,
                token_total,
                cost_usd
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        const insertSessionStatement = this.database.prepare(`
            INSERT INTO usage_scope_sessions (
                scope_key,
                session_key,
                session_order,
                session_id,
                thread_name,
                project,
                repository,
                model,
                started_at,
                date,
                month,
                week,
                duration,
                duration_minutes,
                input_tokens,
                cached_input_tokens,
                output_tokens,
                reasoning_output_tokens,
                token_total,
                cost_usd,
                last_activity,
                top_model
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        const insertSessionModelStatement = this.database.prepare(`
            INSERT INTO usage_scope_session_models (
                scope_key,
                session_key,
                model,
                model_order
            )
            VALUES (?, ?, ?, ?)
        `)
        const insertInteractionStatement = this.database.prepare(`
            INSERT INTO usage_scope_interactions (
                scope_key,
                session_key,
                interaction_order,
                interaction_index,
                content,
                cost_usd,
                model,
                role,
                timestamp,
                type,
                input_tokens,
                cached_input_tokens,
                output_tokens,
                reasoning_output_tokens,
                extra_total_tokens,
                total_tokens,
                usage_cost_usd,
                cache_creation_tokens,
                cache_read_tokens,
                tool_tokens,
                is_fallback_model
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)

        insertScopeStatement.run(
            scopeKey,
            options.kind,
            options.projectLabel ?? null,
            options.platform,
            payloadHash,
            options.updatedAt,
            options.usage.todayTotalCost,
            options.usage.todayTotalTokens,
            options.usage.todayTopModel?.model ?? null,
            options.usage.todayTopModel?.totalTokens ?? null,
            options.usage.todayTopProject?.project ?? null,
            options.usage.todayTopProject?.sessionCount ?? null,
        )

        for (const [position, card] of options.usage.overviewCards.entries()) {
            insertOverviewCardStatement.run(
                scopeKey,
                position,
                card.icon,
                card.name,
                card.value,
                card.detail ?? null,
                card.trend,
                card.trendTone,
            )
        }

        for (const bucket of ['daily', 'monthly', 'session', 'weekly'] as TokenRowBucket[]) {
            const rows = getTokenRowsByBucket(options.usage, bucket)

            for (const [rowOrder, row] of rows.entries()) {
                insertTokenRowStatement.run(
                    scopeKey,
                    bucket,
                    rowOrder,
                    row.id,
                    row.label,
                    row.period,
                    row.sessionCount,
                    row.inputTokens,
                    row.cachedInputTokens,
                    row.outputTokens,
                    row.reasoningOutputTokens,
                    row.totalTokens,
                    row.costUSD,
                )

                for (const [modelOrder, model] of row.models.entries()) {
                    insertTokenRowModelStatement.run(scopeKey, bucket, row.id, model, modelOrder)
                }

                for (const [projectOrder, project] of row.projects.entries()) {
                    insertTokenRowProjectStatement.run(scopeKey, bucket, row.id, project, projectOrder)
                }
            }
        }

        for (const [rowOrder, row] of options.usage.dailyTokenUsage.entries()) {
            insertDailyUsageStatement.run(
                scopeKey,
                rowOrder,
                row.date,
                row.inputTokens,
                row.cachedInputTokens,
                row.outputTokens,
                row.reasoningOutputTokens,
                row.totalTokens,
                row.costUSD,
            )

            for (const [modelOrder, [model, usage]] of Object.entries(row.models).entries()) {
                insertDailyUsageModelStatement.run(
                    scopeKey,
                    row.date,
                    model,
                    modelOrder,
                    usage.inputTokens,
                    usage.cachedInputTokens,
                    usage.outputTokens,
                    usage.reasoningOutputTokens,
                    usage.totalTokens,
                    usage.costUSD,
                    usage.isFallback ? 1 : 0,
                )
            }
        }

        for (const [rowOrder, row] of options.usage.monthlyModelUsage.entries()) {
            insertMonthlyModelStatement.run(
                scopeKey,
                rowOrder,
                row.month,
                row.model,
                row.tokenTotal,
            )
        }

        for (const [rowOrder, row] of options.usage.projectUsage.entries()) {
            insertProjectUsageStatement.run(
                scopeKey,
                rowOrder,
                row.label,
                row.value,
                row.detail,
                row.percent,
                row.tone ?? null,
                row.repository,
                row.sessions,
                row.tokenTotal,
                row.costUSD,
            )
        }

        for (const [sessionOrder, session] of options.usage.sessionUsage.entries()) {
            insertSessionStatement.run(
                scopeKey,
                session.id,
                sessionOrder,
                session.sessionId,
                session.threadName,
                session.project,
                session.repository,
                session.model,
                session.startedAt,
                session.date,
                session.month,
                session.week,
                session.duration,
                session.durationMinutes,
                session.inputTokens,
                session.cachedInputTokens,
                session.outputTokens,
                session.reasoningOutputTokens,
                session.tokenTotal,
                session.costUSD,
                session.lastActivity,
                session.topModel,
            )

            for (const [modelOrder, model] of session.models.entries()) {
                insertSessionModelStatement.run(scopeKey, session.id, model, modelOrder)
            }

            for (const [interactionOrder, interaction] of session.interactions.entries()) {
                insertInteractionStatement.run(
                    scopeKey,
                    session.id,
                    interactionOrder,
                    interaction.index,
                    interaction.content,
                    interaction.costUSD,
                    interaction.model,
                    interaction.role,
                    interaction.timestamp,
                    interaction.type,
                    interaction.usage?.inputTokens ?? null,
                    interaction.usage?.cachedInputTokens ?? null,
                    interaction.usage?.outputTokens ?? null,
                    interaction.usage?.reasoningOutputTokens ?? null,
                    interaction.usage?.extraTotalTokens ?? null,
                    interaction.usage?.totalTokens ?? null,
                    interaction.usage?.costUSD ?? null,
                    interaction.usage?.cacheCreationTokens ?? null,
                    interaction.usage?.cacheReadTokens ?? null,
                    interaction.usage?.toolTokens ?? null,
                    interaction.usage?.isFallbackModel ? 1 : 0,
                )
            }
        }
    }

    private loadHydratedUsageScopes(kind: UsageScopeKind) {
        const scopes: UsageScopeRow[] = this.database.prepare<UsageScopeRow>(`
            SELECT
                scope_key,
                scope_kind,
                project_label,
                platform,
                payload_hash,
                updated_at,
                today_total_cost,
                today_total_tokens,
                today_top_model,
                today_top_model_total_tokens,
                today_top_project,
                today_top_project_session_count
            FROM usage_scopes
            WHERE scope_kind = ?
            ORDER BY project_label ASC, platform ASC
        `).all(kind)

        if (scopes.length === 0) {
            return new Map<string, PersistedUsageScope>()
        }

        const scopeSet = new Set(scopes.map(scope => scope.scope_key))
        const overviewCards = groupOverviewCards(this.database.prepare<OverviewCardRow>(`
            SELECT card.scope_key, card.position, card.icon, card.name, card.value, card.detail, card.trend, card.trend_tone
            FROM usage_scope_overview_cards AS card
            JOIN usage_scopes AS scope ON scope.scope_key = card.scope_key
            WHERE scope.scope_kind = ?
            ORDER BY card.scope_key ASC, card.position ASC
        `).all(kind))
        const tokenRows = groupTokenRows(
            this.database.prepare<TokenRowRow>(`
                SELECT
                    row.scope_key,
                    row.bucket,
                    row.row_order,
                    row.row_id,
                    row.label,
                    row.period,
                    row.session_count,
                    row.input_tokens,
                    row.cached_input_tokens,
                    row.output_tokens,
                    row.reasoning_output_tokens,
                    row.total_tokens,
                    row.cost_usd
                FROM usage_scope_token_rows AS row
                JOIN usage_scopes AS scope ON scope.scope_key = row.scope_key
                WHERE scope.scope_kind = ?
                ORDER BY row.scope_key ASC, row.bucket ASC, row.row_order ASC
            `).all(kind),
            this.database.prepare<TokenRowModelRow>(`
                SELECT model.scope_key, model.bucket, model.row_id, model.model, model.model_order
                FROM usage_scope_token_row_models AS model
                JOIN usage_scopes AS scope ON scope.scope_key = model.scope_key
                WHERE scope.scope_kind = ?
                ORDER BY model.scope_key ASC, model.bucket ASC, model.row_id ASC, model.model_order ASC
            `).all(kind),
            this.database.prepare<TokenRowProjectRow>(`
                SELECT project.scope_key, project.bucket, project.row_id, project.project, project.project_order
                FROM usage_scope_token_row_projects AS project
                JOIN usage_scopes AS scope ON scope.scope_key = project.scope_key
                WHERE scope.scope_kind = ?
                ORDER BY project.scope_key ASC, project.bucket ASC, project.row_id ASC, project.project_order ASC
            `).all(kind),
        )
        const dailyUsage = groupDailyUsage(
            this.database.prepare<DailyUsageRow>(`
                SELECT
                    daily.scope_key,
                    daily.row_order,
                    daily.date,
                    daily.input_tokens,
                    daily.cached_input_tokens,
                    daily.output_tokens,
                    daily.reasoning_output_tokens,
                    daily.total_tokens,
                    daily.cost_usd
                FROM usage_scope_daily_usage AS daily
                JOIN usage_scopes AS scope ON scope.scope_key = daily.scope_key
                WHERE scope.scope_kind = ?
                ORDER BY daily.scope_key ASC, daily.row_order ASC
            `).all(kind),
            this.database.prepare<DailyUsageModelRow>(`
                SELECT
                    model.scope_key,
                    model.date,
                    model.model,
                    model.model_order,
                    model.input_tokens,
                    model.cached_input_tokens,
                    model.output_tokens,
                    model.reasoning_output_tokens,
                    model.total_tokens,
                    model.cost_usd,
                    model.is_fallback
                FROM usage_scope_daily_usage_models AS model
                JOIN usage_scopes AS scope ON scope.scope_key = model.scope_key
                WHERE scope.scope_kind = ?
                ORDER BY model.scope_key ASC, model.date ASC, model.model_order ASC
            `).all(kind),
        )
        const monthlyUsage = groupMonthlyModelUsage(this.database.prepare<MonthlyModelUsageRow>(`
            SELECT monthly.scope_key, monthly.row_order, monthly.month, monthly.model, monthly.token_total
            FROM usage_scope_monthly_model_usage AS monthly
            JOIN usage_scopes AS scope ON scope.scope_key = monthly.scope_key
            WHERE scope.scope_kind = ?
            ORDER BY monthly.scope_key ASC, monthly.row_order ASC
        `).all(kind))
        const projectUsage = groupProjectUsage(this.database.prepare<ProjectUsageRow>(`
            SELECT
                usage.scope_key,
                usage.row_order,
                usage.label,
                usage.value,
                usage.detail,
                usage.percent,
                usage.tone,
                usage.repository,
                usage.sessions,
                usage.token_total,
                usage.cost_usd
            FROM usage_scope_project_usage AS usage
            JOIN usage_scopes AS scope ON scope.scope_key = usage.scope_key
            WHERE scope.scope_kind = ?
            ORDER BY usage.scope_key ASC, usage.row_order ASC
        `).all(kind))
        const sessions = groupSessions(
            this.database.prepare<SessionRow>(`
                SELECT
                    session.scope_key,
                    session.session_key,
                    session.session_order,
                    session.session_id,
                    session.thread_name,
                    session.project,
                    session.repository,
                    session.model,
                    session.started_at,
                    session.date,
                    session.month,
                    session.week,
                    session.duration,
                    session.duration_minutes,
                    session.input_tokens,
                    session.cached_input_tokens,
                    session.output_tokens,
                    session.reasoning_output_tokens,
                    session.token_total,
                    session.cost_usd,
                    session.last_activity,
                    session.top_model
                FROM usage_scope_sessions AS session
                JOIN usage_scopes AS scope ON scope.scope_key = session.scope_key
                WHERE scope.scope_kind = ?
                ORDER BY session.scope_key ASC, session.session_order ASC
            `).all(kind),
            this.database.prepare<SessionModelRow>(`
                SELECT model.scope_key, model.session_key, model.model, model.model_order
                FROM usage_scope_session_models AS model
                JOIN usage_scopes AS scope ON scope.scope_key = model.scope_key
                WHERE scope.scope_kind = ?
                ORDER BY model.scope_key ASC, model.session_key ASC, model.model_order ASC
            `).all(kind),
            this.database.prepare<ScopeInteractionRow>(`
                SELECT
                    interaction.scope_key,
                    interaction.session_key,
                    interaction.interaction_order,
                    interaction.interaction_index,
                    interaction.content,
                    interaction.cost_usd,
                    interaction.model,
                    interaction.role,
                    interaction.timestamp,
                    interaction.type,
                    interaction.input_tokens,
                    interaction.cached_input_tokens,
                    interaction.output_tokens,
                    interaction.reasoning_output_tokens,
                    interaction.extra_total_tokens,
                    interaction.total_tokens,
                    interaction.usage_cost_usd,
                    interaction.cache_creation_tokens,
                    interaction.cache_read_tokens,
                    interaction.tool_tokens,
                    interaction.is_fallback_model
                FROM usage_scope_interactions AS interaction
                JOIN usage_scopes AS scope ON scope.scope_key = interaction.scope_key
                WHERE scope.scope_kind = ?
                ORDER BY interaction.scope_key ASC, interaction.session_key ASC, interaction.interaction_order ASC
            `).all(kind),
        )
        const hydrated = new Map<string, PersistedUsageScope>()

        for (const scope of scopes) {
            if (!scopeSet.has(scope.scope_key)) {
                continue
            }

            const scopeTokenRows = tokenRows.get(scope.scope_key)
            const sessionUsage = sessions.get(scope.scope_key) ?? []

            hydrated.set(scope.scope_key, {
                dailyRows: scopeTokenRows?.daily ?? [],
                dailyTokenUsage: dailyUsage.get(scope.scope_key) ?? [],
                monthlyModelUsage: monthlyUsage.get(scope.scope_key) ?? [],
                monthlyRows: scopeTokenRows?.monthly ?? [],
                overviewCards: overviewCards.get(scope.scope_key) ?? [],
                projectUsage: projectUsage.get(scope.scope_key) ?? [],
                sessionRows: scopeTokenRows?.session ?? [],
                sessionUsage,
                todayTopModel: scope.today_top_model
                    ? {
                            model: scope.today_top_model,
                            totalTokens: scope.today_top_model_total_tokens ?? 0,
                        }
                    : null,
                todayTopProject: scope.today_top_project
                    ? {
                            project: scope.today_top_project,
                            sessionCount: scope.today_top_project_session_count ?? 0,
                        }
                    : null,
                todayTotalCost: scope.today_total_cost,
                todayTotalTokens: scope.today_total_tokens,
                weeklyRows: scopeTokenRows?.weekly ?? [],
            })
        }

        return hydrated
    }

    private loadLegacyBootstrap() {
        const row: LegacySnapshotRow | undefined = this.database.prepare<LegacySnapshotRow>(`
            SELECT payload, payload_hash, updated_at
            FROM cache_snapshots
            WHERE key = ?
        `).get('bootstrap')

        if (!row) {
            return null
        }

        return {
            payload: JSON.parse(row.payload) as TokensConsumptionResult,
            payloadHash: row.payload_hash,
            updatedAt: row.updated_at,
        }
    }

    private loadLegacyProjectCatalog() {
        const row: LegacySnapshotRow | undefined = this.database.prepare<LegacySnapshotRow>(`
            SELECT payload, payload_hash, updated_at
            FROM cache_snapshots
            WHERE key = ?
        `).get('project_catalog')

        if (!row) {
            return null
        }

        return {
            payload: normalizeProjectCatalogItems(JSON.parse(row.payload) as unknown),
            payloadHash: row.payload_hash,
            updatedAt: row.updated_at,
        }
    }

    private loadLegacyProjectDetails() {
        const rows: LegacyProjectSnapshotRow[] = this.database.prepare<LegacyProjectSnapshotRow>(`
            SELECT label, payload, payload_hash, updated_at
            FROM project_snapshots
            ORDER BY label ASC
        `).all()
        const details = new Map<string, ProjectUsageDetail>()

        for (const row of rows) {
            details.set(row.label, normalizeProjectUsageDetail(JSON.parse(row.payload) as ProjectUsageDetail))
        }

        return details
    }

    private loadLegacyIndexedSourceFiles() {
        const rows: LegacyIndexedSourceFileRow[] = this.database.prepare<LegacyIndexedSourceFileRow>(`
            SELECT path, platform, payload, project_names, size, mtime_ms, updated_at
            FROM indexed_source_files
            ORDER BY path ASC
        `).all()

        return rows.map(row => ({
            cacheSignature: '',
            mtimeMs: row.mtime_ms,
            path: row.path,
            payload: JSON.parse(row.payload) as IndexedUsageSourceFile['payload'],
            platform: row.platform,
            projectNames: JSON.parse(row.project_names) as string[],
            size: row.size,
            updatedAt: row.updated_at,
        } satisfies IndexedUsageSourceFile))
    }
}

function getTokenRowsByBucket(usage: PersistedUsageScope, bucket: TokenRowBucket): TokenUsageRow[] {
    switch (bucket) {
        case 'daily':
            return usage.dailyRows
        case 'monthly':
            return usage.monthlyRows
        case 'session':
            return usage.sessionRows
        case 'weekly':
            return usage.weeklyRows
    }
}

function groupProjectModels(rows: ProjectModelRow[]) {
    const grouped = new Map<string, string[]>()

    for (const row of rows) {
        const models = grouped.get(row.project_label) ?? []
        models.push(row.model)
        grouped.set(row.project_label, models)
    }

    return grouped
}

function groupIndexedFileProjects(rows: IndexedFileProjectRow[]) {
    const grouped = new Map<string, string[]>()

    for (const row of rows) {
        const projects = grouped.get(row.path) ?? []
        projects.push(row.project_name)
        grouped.set(row.path, projects)
    }

    return grouped
}

function groupIndexedInteractions(rows: IndexedInteractionRow[]) {
    const grouped = new Map<number, IndexedUsageSourceFile['payload'][number]['interactions']>()

    for (const row of rows) {
        const interactions = grouped.get(row.fragment_id) ?? []
        interactions.push({
            content: row.content,
            costUSD: row.cost_usd,
            dedupeKey: row.dedupe_key,
            index: row.interaction_index,
            model: row.model,
            role: row.role,
            timestamp: row.timestamp,
            type: row.type,
            usage: buildInteractionUsage(row),
        })
        grouped.set(row.fragment_id, interactions)
    }

    return grouped
}

function groupOverviewCards(rows: OverviewCardRow[]) {
    const grouped = new Map<string, UsageOverviewCard[]>()

    for (const row of rows) {
        const cards = grouped.get(row.scope_key) ?? []
        cards.push({
            detail: row.detail ?? undefined,
            icon: row.icon,
            name: row.name,
            trend: row.trend,
            trendTone: row.trend_tone,
            value: row.value,
        })
        grouped.set(row.scope_key, cards)
    }

    return grouped
}

function groupTokenRows(
    rows: TokenRowRow[],
    modelRows: TokenRowModelRow[],
    projectRows: TokenRowProjectRow[],
) {
    const modelsByRow = new Map<string, string[]>()
    const projectsByRow = new Map<string, string[]>()

    for (const row of modelRows) {
        const key = createCompositeKey(row.scope_key, row.bucket, row.row_id)
        const models = modelsByRow.get(key) ?? []
        models.push(row.model)
        modelsByRow.set(key, models)
    }

    for (const row of projectRows) {
        const key = createCompositeKey(row.scope_key, row.bucket, row.row_id)
        const projects = projectsByRow.get(key) ?? []
        projects.push(row.project)
        projectsByRow.set(key, projects)
    }

    const grouped = new Map<string, Record<TokenRowBucket, TokenUsageRow[]>>()

    for (const row of rows) {
        const buckets = grouped.get(row.scope_key) ?? {
            daily: [],
            monthly: [],
            session: [],
            weekly: [],
        }
        const key = createCompositeKey(row.scope_key, row.bucket, row.row_id)

        buckets[row.bucket].push({
            cachedInputTokens: row.cached_input_tokens,
            costUSD: row.cost_usd,
            id: row.row_id,
            inputTokens: row.input_tokens,
            label: row.label,
            models: modelsByRow.get(key) ?? [],
            outputTokens: row.output_tokens,
            period: row.period,
            projects: projectsByRow.get(key) ?? [],
            reasoningOutputTokens: row.reasoning_output_tokens,
            sessionCount: row.session_count,
            totalTokens: row.total_tokens,
        })
        grouped.set(row.scope_key, buckets)
    }

    return grouped
}

function groupDailyUsage(rows: DailyUsageRow[], modelRows: DailyUsageModelRow[]) {
    const modelsByRow = new Map<string, DailyTokenUsage['models']>()

    for (const row of modelRows) {
        const key = createCompositeKey(row.scope_key, row.date)
        const models = modelsByRow.get(key) ?? {}
        models[row.model] = {
            cachedInputTokens: row.cached_input_tokens,
            costUSD: row.cost_usd,
            inputTokens: row.input_tokens,
            isFallback: Boolean(row.is_fallback),
            outputTokens: row.output_tokens,
            reasoningOutputTokens: row.reasoning_output_tokens,
            totalTokens: row.total_tokens,
        }
        modelsByRow.set(key, models)
    }

    const grouped = new Map<string, DailyTokenUsage[]>()

    for (const row of rows) {
        const items = grouped.get(row.scope_key) ?? []
        items.push({
            cachedInputTokens: row.cached_input_tokens,
            costUSD: row.cost_usd,
            date: row.date,
            inputTokens: row.input_tokens,
            models: modelsByRow.get(createCompositeKey(row.scope_key, row.date)) ?? {},
            outputTokens: row.output_tokens,
            reasoningOutputTokens: row.reasoning_output_tokens,
            totalTokens: row.total_tokens,
        })
        grouped.set(row.scope_key, items)
    }

    return grouped
}

function groupMonthlyModelUsage(rows: MonthlyModelUsageRow[]) {
    const grouped = new Map<string, MonthlyModelUsage[]>()

    for (const row of rows) {
        const items = grouped.get(row.scope_key) ?? []
        items.push({
            model: row.model,
            month: row.month,
            tokenTotal: row.token_total,
        })
        grouped.set(row.scope_key, items)
    }

    return grouped
}

function groupProjectUsage(rows: ProjectUsageRow[]) {
    const grouped = new Map<string, LoadUsageResult['projectUsage']>()

    for (const row of rows) {
        const items = grouped.get(row.scope_key) ?? []
        items.push({
            costUSD: row.cost_usd,
            detail: row.detail,
            label: row.label,
            percent: row.percent,
            repository: row.repository,
            sessions: row.sessions,
            tokenTotal: row.token_total,
            tone: row.tone as LoadUsageResult['projectUsage'][number]['tone'],
            value: row.value,
        })
        grouped.set(row.scope_key, items)
    }

    return grouped
}

function groupSessions(
    rows: SessionRow[],
    modelRows: SessionModelRow[],
    interactionRows: ScopeInteractionRow[],
) {
    const sessionModels = new Map<string, string[]>()
    const interactions = new Map<string, ProjectSessionInteractionItem[]>()

    for (const row of modelRows) {
        const key = createCompositeKey(row.scope_key, row.session_key)
        const models = sessionModels.get(key) ?? []
        models.push(row.model)
        sessionModels.set(key, models)
    }

    for (const row of interactionRows) {
        const key = createCompositeKey(row.scope_key, row.session_key)
        const items = interactions.get(key) ?? []
        items.push({
            content: row.content,
            costUSD: row.cost_usd,
            index: row.interaction_index,
            model: row.model,
            raw: null,
            role: row.role,
            timestamp: row.timestamp,
            type: row.type,
            usage: buildInteractionUsage(row),
        })
        interactions.set(key, items)
    }

    const grouped = new Map<string, ProjectSessionUsageItem[]>()

    for (const row of rows) {
        const items = grouped.get(row.scope_key) ?? []
        const key = createCompositeKey(row.scope_key, row.session_key)

        items.push({
            cachedInputTokens: row.cached_input_tokens,
            costUSD: row.cost_usd,
            date: row.date,
            duration: row.duration,
            durationMinutes: row.duration_minutes,
            id: row.session_key,
            inputTokens: row.input_tokens,
            interactions: interactions.get(key) ?? [],
            lastActivity: row.last_activity,
            model: row.model,
            models: sessionModels.get(key) ?? [],
            month: row.month,
            outputTokens: row.output_tokens,
            project: row.project,
            reasoningOutputTokens: row.reasoning_output_tokens,
            repository: row.repository,
            sessionId: row.session_id,
            startedAt: row.started_at,
            threadName: row.thread_name,
            tokenTotal: row.token_total,
            topModel: row.top_model,
            week: row.week,
        })
        grouped.set(row.scope_key, items)
    }

    return grouped
}

function buildInteractionUsage(row: {
    cache_creation_tokens: number | null
    cache_read_tokens: number | null
    cached_input_tokens: number | null
    extra_total_tokens: number | null
    input_tokens: number | null
    is_fallback_model: number | null
    output_tokens: number | null
    reasoning_output_tokens: number | null
    tool_tokens: number | null
    total_tokens: number | null
    usage_cost_usd: number | null
}) {
    if (
        row.input_tokens === null
        || row.cached_input_tokens === null
        || row.output_tokens === null
        || row.reasoning_output_tokens === null
        || row.total_tokens === null
        || row.usage_cost_usd === null
    ) {
        return null
    }

    const usage: ProjectInteractionUsage = {
        cachedInputTokens: row.cached_input_tokens,
        costUSD: row.usage_cost_usd,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        reasoningOutputTokens: row.reasoning_output_tokens,
        totalTokens: row.total_tokens,
    }

    if (row.extra_total_tokens !== null) {
        usage.extraTotalTokens = row.extra_total_tokens
    }

    if (row.cache_creation_tokens !== null) {
        usage.cacheCreationTokens = row.cache_creation_tokens
    }

    if (row.cache_read_tokens !== null) {
        usage.cacheReadTokens = row.cache_read_tokens
    }

    if (row.tool_tokens !== null) {
        usage.toolTokens = row.tool_tokens
    }

    if (row.is_fallback_model !== null) {
        usage.isFallbackModel = Boolean(row.is_fallback_model)
    }

    return usage
}

function createEmptyPersistedUsageScope(): PersistedUsageScope {
    return {
        ...createEmptyLoadUsageResult(),
        sessionUsage: [],
    }
}

function stripRawPayload(detail: ProjectUsageDetail): ProjectUsageDetail {
    return {
        ...detail,
        analyzing: Object.fromEntries(
            PROJECT_USAGE_PLATFORMS.map(platform => [platform, stripRawInteractions(detail.analyzing[platform])]),
        ) as ProjectUsagePlatformRecord<ProjectUsageDetail['analyzing'][ProjectUsagePlatform]>,
    }
}

function stripRawInteractions(detail: ProjectUsageDetail['analyzing'][ProjectUsagePlatform]) {
    return {
        ...detail,
        sessionUsage: stripRawFromSessionList(detail.sessionUsage),
        sessions: stripRawFromSessionList(detail.sessions),
    }
}

function stripRawFromSessionList<T extends { interactions: Array<{ raw: unknown }> }>(sessions: T[]) {
    return sessions.map(session => ({
        ...session,
        interactions: session.interactions.map(({ raw: _raw, ...interaction }) => ({
            ...interaction,
            raw: null,
        })),
    }))
}

function createUsageScopeKey(
    kind: UsageScopeKind,
    platform: ProjectUsagePlatform,
    projectLabel?: string,
) {
    return kind === 'bootstrap'
        ? `bootstrap:${platform}`
        : `project:${projectLabel ?? ''}:${platform}`
}

function createCompositeKey(...parts: Array<string | number>) {
    return parts.join(ROW_KEY_SEPARATOR)
}

function createPayloadHash(value: string) {
    return createHash('sha1').update(value).digest('hex')
}

function normalizeProjectCatalogItems(value: unknown): ProjectUsageCatalogItem[] {
    if (!Array.isArray(value)) {
        return []
    }

    return value.flatMap((item) => {
        if (!item || typeof item !== 'object') {
            return []
        }

        const record = item as Record<string, unknown>

        if (typeof record.label !== 'string') {
            return []
        }

        if (Array.isArray(record.platforms)) {
            return [{
                label: record.label,
                platforms: normalizeProjectCatalogPlatforms(record.platforms),
                totalTokens: normalizeProjectCatalogTotalTokens(record.totalTokens),
            }]
        }

        if (typeof record.type === 'string') {
            return [{
                label: record.label,
                platforms: normalizeProjectCatalogPlatforms(record.type === 'mixed' ? [] : [record.type]),
                totalTokens: normalizeProjectCatalogTotalTokens(record.totalTokens),
            }]
        }

        return []
    })
}

function parseProjectCatalogPlatforms(value: string) {
    try {
        return normalizeProjectCatalogPlatforms(JSON.parse(value) as unknown)
    }
    catch {
        return []
    }
}

function normalizeProjectCatalogPlatforms(value: unknown): ProjectUsagePlatform[] {
    if (!Array.isArray(value)) {
        return []
    }

    return value.filter((platform): platform is ProjectUsagePlatform =>
        typeof platform === 'string' && PROJECT_USAGE_PLATFORMS.includes(platform as ProjectUsagePlatform),
    )
}

function normalizeProjectCatalogTotalTokens(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
}

function mkdirParentDirectory(filePath: string) {
    const directory = dirname(filePath)

    if (!existsSync(directory)) {
        mkdirSync(directory, { recursive: true })
    }
}
