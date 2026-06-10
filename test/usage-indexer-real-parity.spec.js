import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { buildIncrementalUsageIndex } from '../server/services/usage-indexer.ts'
import { PROJECT_USAGE_PLATFORM_META } from '../shared/platform/metadata.ts'
import { buildProjectLoadUsageResult } from '../shared/platform/project.ts'
import { PROJECT_USAGE_PLATFORMS } from '../shared/types/ai.ts'
import { buildHomeDashboardModules } from '../shared/utils/analysis-dashboard.ts'
import { resolveConfig } from '../shared/utils/configs.ts'
import { parse } from '../shared/utils/parse.ts'
import { getDateKeyFromLabel } from '../shared/utils/usage-dashboard.ts'

describe('usage indexer real parity with installed ccusage', () => {
    it('matches daily totals for all 15 agent platforms on this machine', async () => {
        const config = resolveConfig({
            appVersion: 'test',
            home: process.cwd(),
        })
        const { bootstrapByPlatform, eventsByPlatform } = await buildIncrementalUsageIndex(config, createMemoryRepository())

        for (const platform of PROJECT_USAGE_PLATFORMS) {
            const command = getCcusageCommand(platform)
            const ccusageReport = parse(execFileSync('ccusage', [command, 'daily', '--json', '--offline', '-z', 'Asia/Shanghai'], {
                cwd: process.cwd(),
                encoding: 'utf8',
            })) ?? {}
            const usage = buildProjectLoadUsageResult(bootstrapByPlatform[platform], platform, eventsByPlatform[platform])
            const actualDailyRows = normalizeDailyRows(usage.dailyRows)
            const expectedDailyRows = normalizeCcusageDailyRows(ccusageReport.daily ?? [])
            const actualTotals = normalizeTotalsFromRows(actualDailyRows)
            const expectedTotals = normalizeTotalsFromRows(expectedDailyRows)

            if (JSON.stringify(actualTotals) !== JSON.stringify(expectedTotals) || JSON.stringify(actualDailyRows) !== JSON.stringify(expectedDailyRows)) {
                console.log(JSON.stringify({
                    actualDailyRows,
                    actualTotals,
                    expectedDailyRows,
                    expectedTotals,
                    platform,
                }, null, 2))
            }

            expect(actualTotals).toEqual(expectedTotals)
            expect(actualDailyRows).toEqual(expectedDailyRows)
        }
    }, 30_000)

    it('matches default all-agent daily totals on this machine', async () => {
        const config = resolveConfig({
            appVersion: 'test',
            home: process.cwd(),
        })
        const { bootstrapByPlatform, eventsByPlatform } = await buildIncrementalUsageIndex(config, createMemoryRepository())
        const dashboardsByPlatform = Object.fromEntries(
            PROJECT_USAGE_PLATFORMS.map(platform => [
                platform,
                buildProjectLoadUsageResult(bootstrapByPlatform[platform], platform, eventsByPlatform[platform]),
            ]),
        )
        const usage = buildHomeDashboardModules(dashboardsByPlatform)
        const ccusageReport = parse(execFileSync('ccusage', ['--json'], {
            cwd: process.cwd(),
            encoding: 'utf8',
        })) ?? {}
        const actualDailyRows = normalizeDailyTokenUsageRows(usage.dailyTokenUsage)
        const expectedDailyRows = normalizeCcusageDailyRows(ccusageReport.daily ?? [], { includeReasoningOutputTokens: false })
        const actualTotals = normalizeCcusageVisibleTotalsFromRows(actualDailyRows)
        const expectedTotals = normalizeCcusageTotals(ccusageReport.totals)

        if (JSON.stringify(actualTotals) !== JSON.stringify(expectedTotals) || JSON.stringify(actualDailyRows) !== JSON.stringify(expectedDailyRows)) {
            console.log(JSON.stringify({
                actualDailyRows,
                actualTotals,
                expectedDailyRows,
                expectedTotals,
            }, null, 2))
        }

        expect(actualTotals).toEqual(expectedTotals)
        expect(actualDailyRows).toEqual(expectedDailyRows)
    }, 30_000)
})

function createMemoryRepository() {
    const indexedFiles = []
    const interactions = []

    return {
        deleteSourceFiles(paths) {
            if (paths.length === 0) {
                return
            }

            const pending = new Set(paths)
            const kept = indexedFiles.filter(file => !pending.has(file.path))
            indexedFiles.splice(0, indexedFiles.length, ...kept)
        },
        deleteSessionsBySourceFiles(paths) {
            if (paths.length === 0)
                return
            const pathSet = new Set(paths)
            const kept = interactions.filter(row => !pathSet.has(row.sourceFile))
            interactions.splice(0, interactions.length, ...kept)
        },
        loadSourceFileMetas() {
            return indexedFiles.map(file => ({
                cacheSignature: file.cacheSignature,
                mtimeMs: file.mtimeMs,
                path: file.path,
                platform: file.platform,
                projectNames: file.projectNames,
                size: file.size,
                updatedAt: file.updatedAt,
            }))
        },
        upsertSourceFiles(files) {
            for (const file of files) {
                const index = indexedFiles.findIndex(candidate => candidate.path === file.path)

                if (index === -1) {
                    indexedFiles.push(file)
                }
                else {
                    indexedFiles[index] = file
                }
            }
        },
        upsertInteractions(items) {
            interactions.push(...items)
        },
        querySessionSummariesByPlatform(platforms) {
            const result = new Map()
            for (const platform of platforms) {
                const platformRows = interactions.filter(row => row.platform === platform)
                const bySession = new Map()
                for (const row of platformRows) {
                    const existing = bySession.get(row.sessionId) || {
                        session_id: row.sessionId,
                        platform: row.platform,
                        project_name: row.projectName,
                        repository: row.repository,
                        thread_name: row.threadName,
                        session_started_at: row.sessionStartedAt,
                        started_at: row.timestamp,
                        last_activity: row.timestamp,
                        input_token: 0,
                        output_token: 0,
                        cached_input_token: 0,
                        reasoning_token: 0,
                        total_token: 0,
                        cost_usd: 0,
                        models_set: new Set(),
                    }
                    existing.input_token += row.inputToken
                    existing.output_token += row.outputToken
                    existing.cached_input_token += row.cachedInputToken
                    existing.reasoning_token += row.reasoningToken
                    existing.total_token += row.totalToken
                    existing.cost_usd += row.costUsd ?? 0
                    if (row.model)
                        existing.models_set.add(row.model)
                    if (row.timestamp && (!existing.started_at || row.timestamp < existing.started_at))
                        existing.started_at = row.timestamp
                    if (row.timestamp && row.timestamp > existing.last_activity)
                        existing.last_activity = row.timestamp
                    bySession.set(row.sessionId, existing)
                }
                const sessions = []
                for (const [, session] of bySession) {
                    if (session.total_token > 0) {
                        const models = Array.from(session.models_set).sort()
                        const topModel = models[0] || 'unknown'
                        sessions.push({
                            cachedInputTokens: session.cached_input_token,
                            costUSD: Math.round(session.cost_usd * 1000000) / 1000000,
                            date: '',
                            duration: '',
                            durationMinutes: 0,
                            id: session.session_id,
                            inputTokens: session.input_token,
                            interactions: [],
                            lastActivity: session.last_activity || session.started_at || '',
                            model: topModel,
                            models,
                            month: '',
                            outputTokens: session.output_token,
                            project: session.project_name,
                            reasoningOutputTokens: session.reasoning_token,
                            repository: session.repository,
                            sessionId: session.session_id,
                            startedAt: session.started_at || session.session_started_at || '',
                            threadName: session.thread_name,
                            tokenTotal: session.total_token,
                            topModel,
                            week: '',
                        })
                    }
                }
                sessions.sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''))
                result.set(platform, sessions)
            }
            return result
        },
        queryInteractionEventsByPlatform() {
            const result = new Map()
            for (const row of interactions) {
                if (row.totalToken <= 0)
                    continue
                if (!row.timestamp)
                    continue
                const list = result.get(row.platform) ?? []
                list.push({
                    cacheCreationTokens: row.cacheCreation ?? 0,
                    cachedInputTokens: row.cachedInputToken,
                    costUSD: row.costUsd ?? 0,
                    inputTokens: row.inputToken,
                    isFallbackModel: row.isFallbackModel,
                    model: row.model || 'unknown',
                    outputTokens: row.outputToken,
                    platform: row.platform,
                    project: row.projectName,
                    reasoningOutputTokens: row.reasoningToken,
                    repository: row.repository,
                    sessionId: row.sessionId,
                    timestamp: row.timestamp,
                    toolTokens: row.toolTokens ?? 0,
                    totalTokens: row.totalToken,
                })
                result.set(row.platform, list)
            }
            return result
        },
        upsertSessions() {},
    }
}

function normalizeTotalsFromRows(rows) {
    return {
        cachedInputTokens: rows.reduce((sum, row) => sum + row.cachedInputTokens, 0),
        costUSD: round4(rows.reduce((sum, row) => sum + row.costUSD, 0)),
        inputTokens: rows.reduce((sum, row) => sum + row.inputTokens, 0),
        outputTokens: rows.reduce((sum, row) => sum + row.outputTokens, 0),
        reasoningOutputTokens: rows.reduce((sum, row) => sum + row.reasoningOutputTokens, 0),
        totalTokens: rows.reduce((sum, row) => sum + row.totalTokens, 0),
    }
}

function normalizeDailyRows(rows) {
    return rows
        .map(row => ({
            cachedInputTokens: row.cachedInputTokens,
            costUSD: round4(row.costUSD),
            date: row.id,
            inputTokens: row.inputTokens,
            outputTokens: row.outputTokens,
            reasoningOutputTokens: row.reasoningOutputTokens,
            totalTokens: row.totalTokens,
        }))
        .sort((left, right) => left.date.localeCompare(right.date))
}

function normalizeDailyTokenUsageRows(rows) {
    return rows
        .map(row => ({
            cachedInputTokens: row.cachedInputTokens,
            costUSD: round4(row.costUSD),
            date: getDateKeyFromLabel(row.date),
            inputTokens: row.inputTokens,
            outputTokens: row.outputTokens,
            totalTokens: row.totalTokens,
        }))
        .sort((left, right) => left.date.localeCompare(right.date))
}

function normalizeCcusageDailyRows(rows, options = { includeReasoningOutputTokens: true }) {
    return rows
        .map((row) => {
            const normalized = {
                cachedInputTokens: (row.cacheCreationTokens ?? 0) + (row.cacheReadTokens ?? row.cachedInputTokens ?? 0),
                costUSD: round4(row.totalCost ?? row.costUSD ?? 0),
                date: row.date ?? row.period,
                inputTokens: row.inputTokens ?? 0,
                outputTokens: row.outputTokens ?? 0,
                totalTokens: row.totalTokens ?? 0,
            }

            return options.includeReasoningOutputTokens
                ? {
                        ...normalized,
                        reasoningOutputTokens: row.reasoningOutputTokens ?? 0,
                    }
                : normalized
        })
        .sort((left, right) => left.date.localeCompare(right.date))
}

function normalizeCcusageVisibleTotalsFromRows(rows) {
    return {
        cachedInputTokens: rows.reduce((sum, row) => sum + row.cachedInputTokens, 0),
        inputTokens: rows.reduce((sum, row) => sum + row.inputTokens, 0),
        outputTokens: rows.reduce((sum, row) => sum + row.outputTokens, 0),
        totalTokens: rows.reduce((sum, row) => sum + row.totalTokens, 0),
    }
}

function normalizeCcusageTotals(totals) {
    return {
        cachedInputTokens: (totals?.cacheCreationTokens ?? 0) + (totals?.cacheReadTokens ?? totals?.cachedInputTokens ?? 0),
        inputTokens: totals?.inputTokens ?? 0,
        outputTokens: totals?.outputTokens ?? 0,
        totalTokens: totals?.totalTokens ?? 0,
    }
}

function round4(value) {
    const rounded = Math.round(value * 10_000) / 10_000

    return Object.is(rounded, -0) ? 0 : rounded
}

function getCcusageCommand(platform) {
    return platform === 'claudeCode'
        ? 'claude'
        : PROJECT_USAGE_PLATFORM_META[platform].slug
}
