import type { DatabaseSyncOptions, StatementResultingChanges } from 'node:sqlite'
import { DatabaseSync } from 'node:sqlite'

type SqliteRow = Record<string, unknown>
type SqliteStatementParameters = unknown[]

export interface SqliteStatement<Row = SqliteRow> {
    all: (...parameters: SqliteStatementParameters) => Row[]
    get: (...parameters: SqliteStatementParameters) => Row | undefined
    iterate: (...parameters: SqliteStatementParameters) => IterableIterator<Row>
    run: (...parameters: SqliteStatementParameters) => StatementResultingChanges
}

export interface SqliteDatabase {
    close: () => void
    exec: (sql: string) => void
    prepare: <Row = SqliteRow>(sql: string) => SqliteStatement<Row>
}

export type SqliteDatabaseOptions = Pick<DatabaseSyncOptions, 'readOnly'>

export function openSqliteDatabase(location: string, options?: SqliteDatabaseOptions) {
    const database = new DatabaseSync(location, options ?? {}) as unknown as SqliteDatabase

    try {
        database.exec('PRAGMA journal_mode = WAL')
        database.exec('PRAGMA synchronous = NORMAL')
    }
    catch {
    }

    try {
        database.exec('PRAGMA busy_timeout = 15000')
    }
    catch {
    }

    return database
}
