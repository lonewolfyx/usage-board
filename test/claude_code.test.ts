import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveConfig } from '../src/config'
import { loadClaudeCodeUsage } from '../src/platform'

const config = resolveConfig({
    'host': '127.0.0.1',
    'port': 8888,
    'open': false,
    '--': '',
})

describe('test claude code', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('should ', async () => {
        const data = await loadClaudeCodeUsage(config)
        await expect(data).toMatchFileSnapshot('./claude.json')
    })

    it('does not treat the latest historical usage day as today', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-04-17T08:00:00.000Z'))

        const claudeCodePath = await mkdtemp(join(tmpdir(), 'usage-board-claude-'))

        try {
            const projectDir = join(claudeCodePath, 'projects', '-tmp-example-project')
            await mkdir(projectDir, { recursive: true })
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

            const data = await loadClaudeCodeUsage({
                ...config,
                claudeCodePath,
                claudeCodePaths: [claudeCodePath],
            })

            expect(data.dailyRows).toHaveLength(0)
            expect(data.dailyTokenUsage).toHaveLength(1)
            expect(data.monthlyRows).toHaveLength(1)
            expect(data.sessionUsage).toHaveLength(1)
            expect(data.todayTotalCost).toBe(0)
            expect(data.todayTotalTokens).toBe(0)
            expect(data.todayTopModel).toBeNull()
            expect(data.todayTopProject).toBeNull()
            expect(data.overviewCards[0]?.value).toBe('0')
            expect(data.overviewCards[0]?.trend).toBe('0 sessions')
            expect(data.overviewCards[1]?.value).toBe('$0.00')
            expect(data.overviewCards[2]?.value).toBe('-')
            expect(data.overviewCards[3]?.value).toBe('-')
        }
        finally {
            await rm(claudeCodePath, { force: true, recursive: true })
        }
    })
})
