import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config'
import { loadCodexUsage } from '../src/platform'

const config = resolveConfig({
    'host': '127.0.0.1',
    'port': 8888,
    'open': false,
    '--': '',
})

describe('test codex', () => {
    it('should ', async () => {
        const data = await loadCodexUsage(config)
        await expect(data).toMatchFileSnapshot('./codex.json')
    })

    it('reports input tokens excluding cached input, matching ccusage table display', async () => {
        const codexPath = await mkdtemp(join(tmpdir(), 'usage-board-codex-'))

        try {
            const sessionsDir = join(codexPath, 'sessions', '2026', '04', '16')
            await mkdir(sessionsDir, { recursive: true })
            await writeFile(join(sessionsDir, 'rollout.jsonl'), [
                JSON.stringify({
                    timestamp: '2026-04-16T00:00:00.000Z',
                    type: 'session_meta',
                    payload: {
                        cwd: '/tmp/example-project',
                        id: 'fixture-session',
                        timestamp: '2026-04-16T00:00:00.000Z',
                    },
                }),
                JSON.stringify({
                    timestamp: '2026-04-16T00:00:01.000Z',
                    type: 'turn_context',
                    payload: {
                        model: 'gpt-5.4',
                    },
                }),
                JSON.stringify({
                    timestamp: '2026-04-16T00:00:02.000Z',
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

            const data = await loadCodexUsage({
                ...config,
                codexPath,
            })

            expect(data.dailyRows).toHaveLength(1)
            expect(data.dailyRows[0]?.inputTokens).toBe(800)
            expect(data.dailyRows[0]?.cachedInputTokens).toBe(200)
            expect(data.dailyRows[0]?.totalTokens).toBe(1_050)
            expect(data.sessionUsage[0]?.inputTokens).toBe(800)
            expect(data.sessionUsage[0]?.cachedInputTokens).toBe(200)
        }
        finally {
            await rm(codexPath, { force: true, recursive: true })
        }
    })
})
