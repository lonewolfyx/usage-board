import type { TokensConsumptionResult } from '../shared/types/usage-dashboard'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import dayjs from 'dayjs'
import { afterEach, describe, expect, it } from 'vitest'
import { UsageCacheRepository } from '../server/repositories/sqlite/usage-cache.repository'
import { createEmptyLoadUsageResult } from '../shared/platform/defaults'
import { PROJECT_USAGE_PLATFORMS } from '../shared/types/ai'
import { buildHomeDashboardModules } from '../shared/utils/analysis-dashboard'
import { previousDateKey, todayDateKey, useDateFormat } from '../shared/utils/date'
import { formatDateLabelFromDateKey } from '../shared/utils/usage-dashboard'

const createdRoots: string[] = []

afterEach(() => {
    while (createdRoots.length > 0) {
        rmSync(createdRoots.pop()!, {
            force: true,
            recursive: true,
        })
    }
})

describe('home dashboard today insights', () => {
    it('builds today hourly usage and counters from bootstrap session interactions', () => {
        const root = mkdtempSync(join(tmpdir(), 'usage-board-home-insights-'))
        createdRoots.push(root)

        const todayDateKeyVal = todayDateKey()
        const previousDateKeyVal = previousDateKey(todayDateKeyVal)
        const todayHour = Number(useDateFormat(Date.now(), 'hour') ?? new Date().getHours())
        const todayTimestamp = dayjs().toISOString()
        const previousTimestamp = useDateFormat(Date.now() - 24 * 60 * 60 * 1000, 'iso') ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

        const bootstrap = {
            ...Object.fromEntries(PROJECT_USAGE_PLATFORMS.map(platform => [platform, createEmptyLoadUsageResult()] as const)),
            codex: {
                ...createEmptyLoadUsageResult(),
                dailyTokenUsage: [
                    {
                        cachedInputTokens: 10,
                        costUSD: 0.25,
                        date: formatDateLabelFromDateKey(todayDateKeyVal),
                        inputTokens: 100,
                        models: {},
                        outputTokens: 50,
                        reasoningOutputTokens: 0,
                        totalTokens: 150,
                    },
                    {
                        cachedInputTokens: 0,
                        costUSD: 0.05,
                        date: formatDateLabelFromDateKey(previousDateKeyVal),
                        inputTokens: 20,
                        models: {},
                        outputTokens: 10,
                        reasoningOutputTokens: 0,
                        totalTokens: 30,
                    },
                ],
                sessionUsage: [
                    {
                        cachedInputTokens: 10,
                        costUSD: 0.25,
                        date: formatDateLabelFromDateKey(todayDateKeyVal),
                        duration: '5m',
                        durationMinutes: 5,
                        id: 'session-today',
                        inputTokens: 100,
                        interactions: [
                            {
                                content: 'prompt',
                                costUSD: 0,
                                index: 0,
                                model: null,
                                raw: null,
                                role: 'user',
                                timestamp: todayTimestamp,
                                type: 'message',
                                usage: null,
                            },
                            {
                                content: 'response',
                                costUSD: 0.25,
                                index: 1,
                                model: 'gpt-5',
                                raw: null,
                                role: 'assistant',
                                timestamp: todayTimestamp,
                                type: 'message',
                                usage: {
                                    cachedInputTokens: 10,
                                    costUSD: 0.25,
                                    inputTokens: 100,
                                    outputTokens: 50,
                                    reasoningOutputTokens: 0,
                                    totalTokens: 150,
                                },
                            },
                        ],
                        lastActivity: todayTimestamp,
                        model: 'gpt-5',
                        models: ['gpt-5'],
                        month: todayDateKeyVal.slice(0, 7),
                        outputTokens: 50,
                        project: 'usage-board',
                        reasoningOutputTokens: 0,
                        repository: 'usage-board',
                        sessionId: 'session-today',
                        startedAt: todayTimestamp,
                        threadName: 'today',
                        tokenTotal: 150,
                        topModel: 'gpt-5',
                        week: todayDateKeyVal,
                    },
                    {
                        cachedInputTokens: 0,
                        costUSD: 0.05,
                        date: formatDateLabelFromDateKey(previousDateKeyVal),
                        duration: '2m',
                        durationMinutes: 2,
                        id: 'session-previous',
                        inputTokens: 20,
                        interactions: [
                            {
                                content: 'prompt',
                                costUSD: 0,
                                index: 0,
                                model: null,
                                raw: null,
                                role: 'user',
                                timestamp: previousTimestamp,
                                type: 'message',
                                usage: null,
                            },
                        ],
                        lastActivity: previousTimestamp,
                        model: 'gpt-5',
                        models: ['gpt-5'],
                        month: previousDateKeyVal.slice(0, 7),
                        outputTokens: 10,
                        project: 'usage-board',
                        reasoningOutputTokens: 0,
                        repository: 'usage-board',
                        sessionId: 'session-previous',
                        startedAt: previousTimestamp,
                        threadName: 'previous',
                        tokenTotal: 30,
                        topModel: 'gpt-5',
                        week: previousDateKeyVal,
                    },
                ],
                todayTopModel: {
                    model: 'gpt-5',
                    totalTokens: 150,
                },
                todayTopProject: {
                    project: 'usage-board',
                    sessionCount: 1,
                },
                todayTotalCost: 0.25,
                todayTotalTokens: 150,
            },
            version: 'test',
        } as unknown as TokensConsumptionResult

        const { version: _version, ...dashboardsByPlatform } = bootstrap
        const modules = buildHomeDashboardModules(dashboardsByPlatform)
        const todayHourItem = modules.todayHourlyUsage[todayHour]

        expect(todayHourItem?.totalTokens).toBe(150)
        expect(todayHourItem?.agents.codex?.totalTokens).toBe(150)
        expect(modules.overviewCards.find(card => card.name === 'Today Sessions')?.value).toBe('1')
        expect(modules.overviewCards.find(card => card.name === 'Prompt Count')?.value).toBe('1')
    })

    it('stores and retrieves sessions per platform', () => {
        const root = mkdtempSync(join(tmpdir(), 'usage-board-sessions-per-platform-'))
        createdRoots.push(root)

        const repository = new UsageCacheRepository(join(root, 'cache.sqlite'))

        repository.upsertInteractions([makeInteraction({
            sessionId: 'claude-session',
            platform: 'claudeCode',
            projectName: 'usage-board',
            totalToken: 100,
        })])

        repository.upsertInteractions([makeInteraction({
            sessionId: 'codex-session-a',
            platform: 'codex',
            projectName: 'usage-board',
            totalToken: 50,
        })])

        repository.upsertInteractions([makeInteraction({
            sessionId: 'codex-session-b',
            platform: 'codex',
            projectName: 'usage-board',
            totalToken: 75,
        })])

        const sessionsByPlatform = repository.querySessionSummariesByPlatform(['claudeCode', 'codex'])

        expect(sessionsByPlatform.get('claudeCode')?.map(s => s.sessionId)).toEqual(['claude-session'])
        expect(sessionsByPlatform.get('codex')?.map(s => s.sessionId).sort()).toEqual(['codex-session-a', 'codex-session-b'])
    })

    it('computes project catalog from sessions', () => {
        const root = mkdtempSync(join(tmpdir(), 'usage-board-project-catalog-'))
        createdRoots.push(root)

        const repository = new UsageCacheRepository(join(root, 'cache.sqlite'))

        repository.upsertInteractions([makeInteraction({
            sessionId: 'alpha-session',
            platform: 'codex',
            projectName: 'alpha',
            totalToken: 100,
        })])

        repository.upsertInteractions([makeInteraction({
            sessionId: 'beta-session',
            platform: 'claudeCode',
            projectName: 'beta',
            totalToken: 200,
        })])

        const catalog = repository.queryProjectCatalog()

        expect(catalog).toEqual([
            {
                label: 'alpha',
                platforms: ['codex'],
                totalTokens: 100,
            },
            {
                label: 'beta',
                platforms: ['claudeCode'],
                totalTokens: 200,
            },
        ])
    })

    it('drops old tables during schema migration', () => {
        const root = mkdtempSync(join(tmpdir(), 'usage-board-schema-migration-'))
        createdRoots.push(root)

        const databasePath = join(root, 'cache.sqlite')
        const database = new DatabaseSync(databasePath)

        database.exec(`
            CREATE TABLE cache_schema_meta (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                schema_version INTEGER NOT NULL
            );
            INSERT INTO cache_schema_meta (id, schema_version) VALUES (1, 12);
            CREATE TABLE old_table_should_be_gone (
                id TEXT PRIMARY KEY
            );
        `)
        database.close()

        const repository = new UsageCacheRepository(databasePath)
        repository.close()

        const migratedDatabase = new DatabaseSync(databasePath)
        const oldTable = migratedDatabase.prepare(`
            SELECT name
            FROM sqlite_master
            WHERE type = 'table' AND name = 'old_table_should_be_gone'
        `).get()
        const sessionsTable = migratedDatabase.prepare(`
            SELECT name
            FROM sqlite_master
            WHERE type = 'table' AND name = 'sessions'
        `).get()
        migratedDatabase.close()

        expect(oldTable).toBeUndefined()
        expect(sessionsTable).toBeDefined()
    })
})

function makeInteraction(overrides: {
    sessionId: string
    platform: string
    projectName: string
    totalToken: number
    timestamp?: string
    model?: string
}) {
    return {
        sessionId: overrides.sessionId,
        interactionIndex: 0,
        platform: overrides.platform,
        projectName: overrides.projectName,
        repository: '',
        threadName: '',
        sessionStartedAt: overrides.timestamp ?? '2026-05-28T00:00:00.000Z',
        timestamp: overrides.timestamp ?? '2026-05-28T00:00:00.000Z',
        role: 'assistant',
        type: 'message',
        content: '',
        model: overrides.model ?? 'unknown',
        inputToken: 0,
        outputToken: overrides.totalToken,
        cachedInputToken: 0,
        cacheCreation: 0,
        cacheRead: 0,
        reasoningToken: 0,
        totalToken: overrides.totalToken,
        costUsd: 0,
        isFallbackModel: false,
        toolTokens: 0,
        extraTotalTokens: 0,
        dedupeKey: null,
        fallbackDedupeKey: null,
        sourceFile: null,
        isSidechain: false,
    }
}
