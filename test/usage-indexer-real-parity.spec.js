import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { buildIncrementalUsageIndex } from '../server/services/usage-indexer.ts'
import { PROJECT_USAGE_PLATFORM_META } from '../shared/platform/metadata.ts'
import { buildProjectLoadUsageResult } from '../shared/platform/project.ts'
import { PROJECT_USAGE_PLATFORMS } from '../shared/types/ai.ts'
import { buildHomeDashboardModules } from '../shared/utils/analysis-dashboard.ts'
import { resolveConfig } from '../shared/utils/configs.ts'
import { getDateKeyFromLabel } from '../shared/utils/usage-dashboard.ts'

describe('usage indexer real parity with installed ccusage', () => {
    it('matches daily totals for all 15 agent platforms on this machine', async () => {
        const config = resolveConfig({
            appVersion: 'test',
            home: process.cwd(),
        })
        const { bootstrapByPlatform } = await buildIncrementalUsageIndex(config, createMemoryRepository())

        for (const platform of PROJECT_USAGE_PLATFORMS) {
            const command = getCcusageCommand(platform)
            const ccusageReport = JSON.parse(execFileSync('ccusage', [command, 'daily', '--json', '--offline', '-z', 'Asia/Shanghai'], {
                cwd: process.cwd(),
                encoding: 'utf8',
            }))
            const usage = buildProjectLoadUsageResult(bootstrapByPlatform[platform], platform)
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
        const { bootstrapByPlatform } = await buildIncrementalUsageIndex(config, createMemoryRepository())
        const dashboardsByPlatform = Object.fromEntries(
            PROJECT_USAGE_PLATFORMS.map(platform => [
                platform,
                buildProjectLoadUsageResult(bootstrapByPlatform[platform], platform),
            ]),
        )
        const usage = buildHomeDashboardModules(dashboardsByPlatform)
        const ccusageReport = JSON.parse(execFileSync('ccusage', ['--json'], {
            cwd: process.cwd(),
            encoding: 'utf8',
        }))
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

    return {
        deleteIndexedSourceFiles(paths) {
            if (paths.length === 0) {
                return
            }

            const pending = new Set(paths)
            const kept = indexedFiles.filter(file => !pending.has(file.path))
            indexedFiles.splice(0, indexedFiles.length, ...kept)
        },
        loadIndexedSourceFiles() {
            return [...indexedFiles]
        },
        upsertIndexedSourceFiles(files) {
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
