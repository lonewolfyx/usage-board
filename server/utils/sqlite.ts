import BetterSqliteDatabase from 'better-sqlite3'

export type SqliteDatabase = InstanceType<typeof BetterSqliteDatabase>
export type SqliteDatabaseOptions = ConstructorParameters<typeof BetterSqliteDatabase>[1]

export function openSqliteDatabase(location: string, options?: SqliteDatabaseOptions) {
    return new BetterSqliteDatabase(location, options)
}
