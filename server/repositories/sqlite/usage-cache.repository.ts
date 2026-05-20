import type { IndexedUsageSourceFile } from '#server/types/usage-indexer'
import type { ProjectUsageDetail, TokensConsumptionResult } from '#shared/types/usage-dashboard'
import type { ProjectUsageCatalogItem } from '#shared/types/ws'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

type SnapshotKey = 'bootstrap' | 'project_catalog'

interface SnapshotRow {
    payload: string
    payload_hash: string
    updated_at: string
}

export class UsageCacheRepository {
    private readonly database: DatabaseSync

    constructor(databasePath: string) {
        mkdirParentDirectory(databasePath)
        this.database = new DatabaseSync(databasePath)
        this.database.exec(`
            CREATE TABLE IF NOT EXISTS cache_snapshots (
                key TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                payload_hash TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS project_snapshots (
                label TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                payload_hash TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS indexed_source_files (
                path TEXT PRIMARY KEY,
                platform TEXT NOT NULL,
                payload TEXT NOT NULL,
                project_names TEXT NOT NULL,
                size INTEGER NOT NULL,
                mtime_ms INTEGER NOT NULL,
                updated_at TEXT NOT NULL
            );
        `)
    }

    loadBootstrap() {
        const row = this.getSnapshotRow('bootstrap')

        if (!row) {
            return null
        }

        return {
            payload: JSON.parse(row.payload) as TokensConsumptionResult,
            payloadHash: row.payload_hash,
            updatedAt: row.updated_at,
        }
    }

    saveBootstrap(payload: TokensConsumptionResult) {
        this.saveSnapshot('bootstrap', payload)
    }

    loadProjectCatalog() {
        const row = this.getSnapshotRow('project_catalog')

        if (!row) {
            return null
        }

        return {
            payload: JSON.parse(row.payload) as ProjectUsageCatalogItem[],
            payloadHash: row.payload_hash,
            updatedAt: row.updated_at,
        }
    }

    saveProjectCatalog(payload: ProjectUsageCatalogItem[]) {
        this.saveSnapshot('project_catalog', payload)
    }

    loadProjectDetails() {
        const rows = this.database.prepare(`
            SELECT label, payload, payload_hash, updated_at
            FROM project_snapshots
            ORDER BY label ASC
        `).all() as unknown as Array<SnapshotRow & { label: string }>
        const details = new Map<string, ProjectUsageDetail>()

        for (const row of rows) {
            details.set(row.label, JSON.parse(row.payload) as ProjectUsageDetail)
        }

        return details
    }

    loadIndexedSourceFiles() {
        const rows = this.database.prepare(`
            SELECT path, platform, payload, project_names, size, mtime_ms, updated_at
            FROM indexed_source_files
            ORDER BY path ASC
        `).all() as unknown as Array<{
            mtime_ms: number
            path: string
            payload: string
            platform: IndexedUsageSourceFile['platform']
            project_names: string
            size: number
            updated_at: string
        }>

        return rows.map(row => ({
            mtimeMs: row.mtime_ms,
            path: row.path,
            payload: JSON.parse(row.payload) as IndexedUsageSourceFile['payload'],
            platform: row.platform,
            projectNames: JSON.parse(row.project_names) as string[],
            size: row.size,
            updatedAt: row.updated_at,
        } satisfies IndexedUsageSourceFile))
    }

    upsertIndexedSourceFiles(files: IndexedUsageSourceFile[]) {
        if (files.length === 0) {
            return
        }

        const statement = this.database.prepare(`
            INSERT INTO indexed_source_files (path, platform, payload, project_names, size, mtime_ms, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET
                platform = excluded.platform,
                payload = excluded.payload,
                project_names = excluded.project_names,
                size = excluded.size,
                mtime_ms = excluded.mtime_ms,
                updated_at = excluded.updated_at
        `)

        this.database.exec('BEGIN')

        try {
            for (const file of files) {
                statement.run(
                    file.path,
                    file.platform,
                    JSON.stringify(file.payload),
                    JSON.stringify(file.projectNames),
                    file.size,
                    file.mtimeMs,
                    file.updatedAt,
                )
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

        const statement = this.database.prepare('DELETE FROM indexed_source_files WHERE path = ?')
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
        const deleteStatement = this.database.prepare('DELETE FROM project_snapshots')
        const insertStatement = this.database.prepare(`
            INSERT INTO project_snapshots (label, payload, payload_hash, updated_at)
            VALUES (?, ?, ?, ?)
        `)
        const now = new Date().toISOString()
        const runInTransaction = () => {
            this.database.exec('BEGIN')

            try {
                deleteStatement.run()

                for (const [label, detail] of details.entries()) {
                    const payload = JSON.stringify(stripRawPayload(detail))
                    insertStatement.run(label, payload, createPayloadHash(payload), now)
                }

                this.database.exec('COMMIT')
            }
            catch (error) {
                this.database.exec('ROLLBACK')
                throw error
            }
        }

        runInTransaction()
    }

    close() {
        this.database.close()
    }

    private getSnapshotRow(key: SnapshotKey) {
        return this.database.prepare(`
            SELECT payload, payload_hash, updated_at
            FROM cache_snapshots
            WHERE key = ?
        `).get(key) as SnapshotRow | undefined
    }

    private saveSnapshot(key: SnapshotKey, payload: ProjectUsageCatalogItem[] | TokensConsumptionResult) {
        const serializedPayload = JSON.stringify(payload)
        const payloadHash = createPayloadHash(serializedPayload)
        const updatedAt = new Date().toISOString()

        this.database.prepare(`
            INSERT INTO cache_snapshots (key, payload, payload_hash, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                payload = excluded.payload,
                payload_hash = excluded.payload_hash,
                updated_at = excluded.updated_at
        `).run(key, serializedPayload, payloadHash, updatedAt)
    }
}

function stripRawPayload(detail: ProjectUsageDetail): ProjectUsageDetail {
    return {
        ...detail,
        analyzing: {
            claudeCode: stripRawInteractions(detail.analyzing.claudeCode),
            codex: stripRawInteractions(detail.analyzing.codex),
            gemini: stripRawInteractions(detail.analyzing.gemini),
        },
    }
}

function stripRawInteractions(detail: ProjectUsageDetail['analyzing']['claudeCode']) {
    return {
        ...detail,
        sessionUsage: detail.sessionUsage.map(session => ({
            ...session,
            interactions: session.interactions.map(({ raw: _raw, ...interaction }) => ({
                ...interaction,
                raw: null,
            })),
        })),
        sessions: detail.sessions.map(session => ({
            ...session,
            interactions: session.interactions.map(({ raw: _raw, ...interaction }) => ({
                ...interaction,
                raw: null,
            })),
        })),
    }
}

function createPayloadHash(value: string) {
    return createHash('sha1').update(value).digest('hex')
}

function mkdirParentDirectory(filePath: string) {
    const directory = dirname(filePath)

    if (!existsSync(directory)) {
        mkdirSync(directory, { recursive: true })
    }
}
