import type { TokensConsumptionResult } from '../shared/types/usage-dashboard'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { UsageCacheRepository } from '../server/repositories/sqlite/usage-cache.repository'
import { createEmptyLoadUsageResult } from '../shared/platform/defaults'
import { PROJECT_USAGE_PLATFORMS } from '../shared/types/ai'
import { buildHomeDashboardModules } from '../shared/utils/analysis-dashboard'
import { formatDateLabelFromDateKey, getDateKey, getPreviousDateKey } from '../shared/utils/usage-dashboard'

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
    it('builds today hourly usage and counters from sqlite even when cached bootstrap omits interactions', () => {
        const root = mkdtempSync(join(tmpdir(), 'usage-board-home-insights-'))
        createdRoots.push(root)

        const repository = new UsageCacheRepository(join(root, 'cache.sqlite'))
        const todayDateKey = getDateKey(new Date())
        const previousDateKey = getPreviousDateKey(todayDateKey)
        const todayHour = new Date().getHours()
        const todayTimestamp = new Date().toISOString()
        const previousTimestamp = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

        repository.saveBootstrap({
            ...Object.fromEntries(PROJECT_USAGE_PLATFORMS.map(platform => [platform, createEmptyLoadUsageResult()] as const)),
            codex: {
                ...createEmptyLoadUsageResult(),
                dailyTokenUsage: [
                    {
                        cachedInputTokens: 10,
                        costUSD: 0.25,
                        date: formatDateLabelFromDateKey(todayDateKey),
                        inputTokens: 100,
                        models: {},
                        outputTokens: 50,
                        reasoningOutputTokens: 0,
                        totalTokens: 150,
                    },
                    {
                        cachedInputTokens: 0,
                        costUSD: 0.05,
                        date: formatDateLabelFromDateKey(previousDateKey),
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
                        date: formatDateLabelFromDateKey(todayDateKey),
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
                        month: todayDateKey.slice(0, 7),
                        outputTokens: 50,
                        project: 'usage-board',
                        reasoningOutputTokens: 0,
                        repository: 'usage-board',
                        sessionId: 'session-today',
                        startedAt: todayTimestamp,
                        threadName: 'today',
                        tokenTotal: 150,
                        topModel: 'gpt-5',
                        week: todayDateKey,
                    },
                    {
                        cachedInputTokens: 0,
                        costUSD: 0.05,
                        date: formatDateLabelFromDateKey(previousDateKey),
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
                        month: previousDateKey.slice(0, 7),
                        outputTokens: 10,
                        project: 'usage-board',
                        reasoningOutputTokens: 0,
                        repository: 'usage-board',
                        sessionId: 'session-previous',
                        startedAt: previousTimestamp,
                        threadName: 'previous',
                        tokenTotal: 30,
                        topModel: 'gpt-5',
                        week: previousDateKey,
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
        } as unknown as TokensConsumptionResult)

        const bootstrap = repository.loadBootstrap()

        expect(bootstrap).not.toBeNull()
        expect((bootstrap!.payload.codex.sessionUsage[0] as { interactions?: unknown[] } | undefined)?.interactions).toHaveLength(0)

        const { version: _version, ...dashboardsByPlatform } = bootstrap!.payload
        const modules = buildHomeDashboardModules(dashboardsByPlatform, repository.loadHomeDashboardTodayInsights())
        const todayHourItem = modules.todayHourlyUsage[todayHour]

        expect(todayHourItem?.totalTokens).toBe(150)
        expect(todayHourItem?.agents.codex?.totalTokens).toBe(150)
        expect(modules.overviewCards.find(card => card.name === 'Today Sessions')?.value).toBe('1')
        expect(modules.overviewCards.find(card => card.name === 'Prompt Count')?.value).toBe('1')
    })
})
