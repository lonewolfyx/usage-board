import type { LoadUsageResult, ProjectPlatformUsage, ProjectSessionUsageItem } from '#shared/types/usage-dashboard'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadClaudeCodeUsage, loadCodexUsage, loadGeminiUsage } from '#shared/platform'
import { loadProjectsUsage, loadProjectUsageCatalog, loadProjectUsageData, loadProjectUsageDataModule } from '#shared/platform/project'
import { resolveConfig } from '#shared/utils/configs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { version } from '../package.json' with { type: 'josn' }

const config = resolveConfig({
    appVersion: version,
    home: homedir(),
})

describe('project usage scope', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('keeps every analyzer field scoped to the current project', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-04-17T08:00:00.000Z'))

        const root = await mkdtemp(join(tmpdir(), 'usage-board-project-scope-'))
        const claudeCodePath = join(root, 'claude')
        const codexPath = join(root, 'codex')
        const geminiPath = join(root, 'gemini')

        try {
            await mkdir(join(codexPath, 'sessions'), { recursive: true })
            await mkdir(join(geminiPath, 'tmp'), { recursive: true })
            await writeClaudeFixture(claudeCodePath, 'project-a', 'session-a', 100, 10, 0.01)
            await writeClaudeFixture(claudeCodePath, 'project-b', 'session-b', 500, 50, 0.09)

            const data = await loadProjectsUsage({
                ...config,
                claudeCodePath,
                claudeCodePaths: [claudeCodePath],
                codexPath,
                geminiPath,
            })
            const projectA = data.find(item => item['project-a'])?.['project-a']
            const claudeCode = projectA?.analyzing.claudeCode

            expect(projectA?.sessionCound).toBe(1)
            expect(projectA?.models).toEqual(['claude-sonnet-4-5'])
            expect(claudeCode?.sessions).toHaveLength(1)
            expect(claudeCode?.sessions[0]?.project).toBe('project-a')
            expect(claudeCode?.sessionUsage.map(session => session.project)).toEqual(['project-a'])
            expect(claudeCode?.sessionRows.map(row => row.projects)).toEqual([['project-a']])
            expect(claudeCode?.projectUsage.map(project => project.label)).toEqual(['project-a'])
            expect(claudeCode?.monthlyRows.map(row => row.projects)).toEqual([['project-a']])
            expect(claudeCode?.weeklyRows.map(row => row.projects)).toEqual([['project-a']])
            expect(claudeCode?.dailyRows.map(row => row.projects)).toEqual([['project-a']])
            expect(claudeCode?.todayTopProject?.project).toBe('project-a')
            expect(claudeCode?.todayTotalTokens).toBe(110)
            expect(claudeCode?.todayTotalCost).toBe(0.01)
        }
        finally {
            await rm(root, { force: true, recursive: true })
        }
    })

    it('loads project catalog and project detail scoped by session roots', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-04-17T08:00:00.000Z'))

        const root = await mkdtemp(join(tmpdir(), 'usage-board-project-catalog-'))
        const claudeCodePath = join(root, 'claude')
        const codexPath = join(root, 'codex')
        const geminiPath = join(root, 'gemini')
        const scopedConfig = {
            ...config,
            claudeCodePath,
            claudeCodePaths: [claudeCodePath],
            codexPath,
            geminiPath,
        }

        try {
            await mkdir(join(codexPath, 'sessions'), { recursive: true })
            await mkdir(join(geminiPath, 'tmp'), { recursive: true })
            await writeClaudeFixture(claudeCodePath, 'project-a', 'session-a', 100, 10, 0.01)

            const projectPath = join(claudeCodePath, 'projects')
            const catalog = await loadProjectUsageCatalog(scopedConfig)
            const project = await loadProjectUsageData(scopedConfig, {
                path: [projectPath],
                project: 'project-a',
            })

            expect(catalog).toEqual([{
                label: 'project-a',
                path: [projectPath],
                type: 'claudeCode',
            }])
            expect(project?.label).toBe('project-a')
            expect(project?.analyzing.claudeCode.sessions).toHaveLength(1)
            expect(project?.analyzing.codex.sessions).toHaveLength(0)
            expect(project?.analyzing.gemini.sessions).toHaveLength(0)
        }
        finally {
            await rm(root, { force: true, recursive: true })
        }
    })

    it('returns lightweight project modules without raw interaction payloads', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-04-17T08:00:00.000Z'))

        const root = await mkdtemp(join(tmpdir(), 'usage-board-project-modules-'))
        const claudeCodePath = join(root, 'claude')
        const codexPath = join(root, 'codex')
        const geminiPath = join(root, 'gemini')
        const scopedConfig = {
            ...config,
            claudeCodePath,
            claudeCodePaths: [claudeCodePath],
            codexPath,
            geminiPath,
        }

        try {
            await mkdir(join(codexPath, 'sessions'), { recursive: true })
            await mkdir(join(geminiPath, 'tmp'), { recursive: true })
            await writeClaudeFixture(claudeCodePath, 'project-a', 'session-a', 100, 10, 0.01)

            const overview = await loadProjectUsageDataModule(scopedConfig, {
                module: 'overview_cards',
                project: 'project-a',
            })
            const sessionList = await loadProjectUsageDataModule(scopedConfig, {
                module: 'session_list',
                project: 'project-a',
            })
            const interactions = await loadProjectUsageDataModule(scopedConfig, {
                module: 'session_interactions',
                project: 'project-a',
                sessionId: 'session-a',
            })

            expect(overview).toMatchObject({
                label: 'project-a',
                module: 'overview_cards',
            })
            expect(JSON.stringify(overview)).not.toContain('interactions')
            expect(JSON.stringify(sessionList)).not.toContain('"raw"')
            expect(JSON.stringify(interactions)).not.toContain('"raw"')
            expect(JSON.stringify(interactions)).toContain('"interactions"')
        }
        finally {
            await rm(root, { force: true, recursive: true })
        }
    })

    it('matches product dashboard calculations when a product contains one project', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-04-17T08:00:00.000Z'))

        const root = await mkdtemp(join(tmpdir(), 'usage-board-project-product-equivalence-'))
        const claudeCodePath = join(root, 'claude')
        const codexPath = join(root, 'codex')
        const geminiPath = join(root, 'gemini')
        const scopedConfig = {
            ...config,
            claudeCodePath,
            claudeCodePaths: [claudeCodePath],
            codexPath,
            geminiPath,
        }

        try {
            await writeClaudeFixture(claudeCodePath, 'project-a', 'claude-session', 100, 10, 0.01)
            await writeCodexFixture(codexPath, 'project-a', 'codex-session')
            await writeGeminiFixture(geminiPath, 'project-a', 'gemini-session')

            const [
                productClaudeCode,
                productCodex,
                productGemini,
                projects,
            ] = await Promise.all([
                loadClaudeCodeUsage(scopedConfig),
                loadCodexUsage(scopedConfig),
                loadGeminiUsage(scopedConfig),
                loadProjectsUsage(scopedConfig),
            ])
            const project = projects.find(item => item['project-a'])?.['project-a']

            expect(project).toBeDefined()
            expectProjectUsageToMatchProductUsage(project!.analyzing.claudeCode, productClaudeCode)
            expectProjectUsageToMatchProductUsage(project!.analyzing.codex, productCodex)
            expectProjectUsageToMatchProductUsage(project!.analyzing.gemini, productGemini)
        }
        finally {
            await rm(root, { force: true, recursive: true })
        }
    })

    it('excludes zero-usage codex sessions from project day counts and models', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-04-22T08:00:00.000Z'))

        const root = await mkdtemp(join(tmpdir(), 'usage-board-project-codex-filter-'))
        const claudeCodePath = join(root, 'claude')
        const codexPath = join(root, 'codex')
        const geminiPath = join(root, 'gemini')
        const scopedConfig = {
            ...config,
            claudeCodePath,
            claudeCodePaths: [claudeCodePath],
            codexPath,
            geminiPath,
        }

        try {
            await mkdir(join(codexPath, 'sessions', '2026', '04', '22'), { recursive: true })
            await mkdir(join(geminiPath, 'tmp'), { recursive: true })

            await writeCodexFixture(codexPath, 'usage-board', 'billable-a', '2026-04-22T00:00:00.000Z')
            await writeCodexFixture(codexPath, 'usage-board', 'billable-b', '2026-04-22T01:00:00.000Z')
            await writeCodexZeroUsageFixture(codexPath, 'usage-board', 'empty-session', '2026-04-22T02:00:00.000Z')

            const [
                productCodex,
                projects,
            ] = await Promise.all([
                loadCodexUsage(scopedConfig),
                loadProjectsUsage(scopedConfig),
            ])
            const project = projects.find(item => item['usage-board'])?.['usage-board']

            expect(project?.analyzing.codex.sessionUsage).toHaveLength(2)
            expect(project?.analyzing.codex.sessionUsage.map(session => session.sessionId)).toEqual(['billable-b', 'billable-a'])
            expect(project?.analyzing.codex.dailyRows).toEqual(productCodex.dailyRows)
            expect(project?.analyzing.codex.sessionUsage.map(toProductSessionUsageItem)).toEqual(productCodex.sessionUsage)
        }
        finally {
            await rm(root, { force: true, recursive: true })
        }
    })
})

async function writeClaudeFixture(
    claudeCodePath: string,
    project: string,
    sessionId: string,
    inputTokens: number,
    outputTokens: number,
    costUSD: number,
) {
    const projectDir = join(claudeCodePath, 'projects', `-tmp-${project}`)
    await mkdir(projectDir, { recursive: true })
    await writeFile(join(projectDir, `${sessionId}.jsonl`), JSON.stringify({
        costUSD,
        cwd: `/tmp/${project}`,
        message: {
            id: `msg_${sessionId}`,
            model: 'claude-sonnet-4-5',
            usage: {
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: 0,
                input_tokens: inputTokens,
                output_tokens: outputTokens,
            },
        },
        requestId: `req_${sessionId}`,
        sessionId,
        timestamp: '2026-04-17T08:00:00.000Z',
    }))
}

async function writeCodexFixture(
    codexPath: string,
    project: string,
    sessionId: string,
    timestamp = '2026-04-17T00:00:00.000Z',
) {
    const date = new Date(timestamp)
    const sessionsDir = join(
        codexPath,
        'sessions',
        String(date.getUTCFullYear()),
        `${date.getUTCMonth() + 1}`.padStart(2, '0'),
        `${date.getUTCDate()}`.padStart(2, '0'),
    )
    await mkdir(sessionsDir, { recursive: true })
    await writeFile(join(sessionsDir, `${sessionId}.jsonl`), [
        JSON.stringify({
            timestamp,
            type: 'session_meta',
            payload: {
                cwd: `/tmp/${project}`,
                id: sessionId,
                timestamp,
            },
        }),
        JSON.stringify({
            timestamp,
            type: 'turn_context',
            payload: {
                model: 'gpt-5.4',
            },
        }),
        JSON.stringify({
            timestamp,
            type: 'event_msg',
            payload: {
                type: 'token_count',
                info: {
                    last_token_usage: {
                        cached_input_tokens: 200,
                        input_tokens: 1_000,
                        output_tokens: 50,
                        reasoning_output_tokens: 10,
                        total_tokens: 1_050,
                    },
                    total_token_usage: {
                        cached_input_tokens: 200,
                        input_tokens: 1_000,
                        output_tokens: 50,
                        reasoning_output_tokens: 10,
                        total_tokens: 1_050,
                    },
                },
            },
        }),
    ].join('\n'))
}

async function writeCodexZeroUsageFixture(
    codexPath: string,
    project: string,
    sessionId: string,
    timestamp: string,
) {
    const date = new Date(timestamp)
    const sessionsDir = join(
        codexPath,
        'sessions',
        String(date.getUTCFullYear()),
        `${date.getUTCMonth() + 1}`.padStart(2, '0'),
        `${date.getUTCDate()}`.padStart(2, '0'),
    )
    await mkdir(sessionsDir, { recursive: true })
    await writeFile(join(sessionsDir, `${sessionId}.jsonl`), [
        JSON.stringify({
            timestamp,
            type: 'session_meta',
            payload: {
                cwd: `/tmp/${project}`,
                id: sessionId,
                timestamp,
            },
        }),
        JSON.stringify({
            timestamp,
            type: 'event_msg',
            payload: {
                type: 'user_message',
                message: 'hello',
            },
        }),
    ].join('\n'))
}

async function writeGeminiFixture(geminiPath: string, project: string, sessionId: string) {
    const chatsDir = join(geminiPath, 'tmp', project, 'chats')
    await mkdir(chatsDir, { recursive: true })
    await writeFile(join(chatsDir, `session-${sessionId}.json`), JSON.stringify({
        lastUpdated: '2026-04-17T00:05:00.000Z',
        messages: [
            {
                content: 'hello',
                timestamp: '2026-04-17T00:00:00.000Z',
                type: 'user',
            },
            {
                model: 'gemini-2.5-flash',
                timestamp: '2026-04-17T00:01:00.000Z',
                tokens: {
                    cached: 20,
                    input: 100,
                    output: 50,
                    thoughts: 10,
                    total: 160,
                },
                type: 'gemini',
            },
        ],
        sessionId,
        startTime: '2026-04-17T00:00:00.000Z',
    }))
}

function expectProjectUsageToMatchProductUsage(projectUsage: ProjectPlatformUsage, productUsage: LoadUsageResult) {
    expect(projectUsage.dailyRows).toEqual(productUsage.dailyRows)
    expect(projectUsage.dailyTokenUsage).toEqual(productUsage.dailyTokenUsage)
    expect(projectUsage.monthlyModelUsage).toEqual(productUsage.monthlyModelUsage)
    expect(projectUsage.monthlyRows).toEqual(productUsage.monthlyRows)
    expect(projectUsage.overviewCards).toEqual(productUsage.overviewCards)
    expect(projectUsage.projectUsage).toEqual(productUsage.projectUsage)
    expect(projectUsage.sessionRows).toEqual(productUsage.sessionRows)
    expect(projectUsage.sessionUsage.map(toProductSessionUsageItem)).toEqual(productUsage.sessionUsage)
    expect(projectUsage.todayTopModel).toEqual(productUsage.todayTopModel)
    expect(projectUsage.todayTopProject).toEqual(productUsage.todayTopProject)
    expect(projectUsage.todayTotalCost).toBe(productUsage.todayTotalCost)
    expect(projectUsage.todayTotalTokens).toBe(productUsage.todayTotalTokens)
    expect(projectUsage.weeklyRows).toEqual(productUsage.weeklyRows)
}

function toProductSessionUsageItem(session: ProjectSessionUsageItem) {
    const { interactions: _interactions, models: _models, topModel: _topModel, lastActivity: _lastActivity, ...item } = session

    return item
}
