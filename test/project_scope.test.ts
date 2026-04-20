import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadProjectsUsage } from '#shared/platform/project'
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
