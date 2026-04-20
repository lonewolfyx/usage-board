import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadProjectsUsage } from '../shared/platform'
import { resolveConfig } from '../src/config'

const config = resolveConfig({
    'host': '127.0.0.1',
    'port': 8888,
    'open': false,
    '--': '',
})

describe('project daily rows', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('does not include historical project usage in dailyRows when today is empty', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-04-17T08:00:00.000Z'))

        const root = await mkdtemp(join(tmpdir(), 'usage-board-project-daily-'))
        const claudeCodePath = join(root, 'claude')
        const codexPath = join(root, 'codex')
        const geminiPath = join(root, 'gemini')

        try {
            const projectDir = join(claudeCodePath, 'projects', '-tmp-example-project')
            await mkdir(projectDir, { recursive: true })
            await mkdir(join(codexPath, 'sessions'), { recursive: true })
            await mkdir(join(geminiPath, 'tmp'), { recursive: true })
            await writeFile(join(projectDir, 'fixture-session.jsonl'), JSON.stringify({
                costUSD: 0.25,
                cwd: '/tmp/example-project',
                message: {
                    id: 'msg_1',
                    model: 'claude-sonnet-4-5',
                    usage: {
                        cache_creation_input_tokens: 30,
                        cache_read_input_tokens: 20,
                        input_tokens: 100,
                        output_tokens: 50,
                    },
                },
                requestId: 'req_1',
                sessionId: 'fixture-session',
                timestamp: '2026-04-16T08:00:00.000Z',
            }))

            const data = await loadProjectsUsage({
                ...config,
                claudeCodePath,
                claudeCodePaths: [claudeCodePath],
                codexPath,
                geminiPath,
            })
            const exampleProject = data.find(item => item['example-project'])?.['example-project']

            expect(exampleProject?.analyzing.claudeCode.dailyRows).toHaveLength(0)
            expect(exampleProject?.analyzing.claudeCode.dailyTokenUsage).toHaveLength(1)
            expect(exampleProject?.analyzing.claudeCode.todayTotalCost).toBe(0)
            expect(exampleProject?.analyzing.claudeCode.todayTotalTokens).toBe(0)
            expect(exampleProject?.analyzing.claudeCode.todayTopModel).toBeNull()
            expect(exampleProject?.analyzing.claudeCode.todayTopProject).toBeNull()
        }
        finally {
            await rm(root, { force: true, recursive: true })
        }
    })
})
