import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadGeminiUsage } from '#shared/platform'
import { resolveConfig } from '#shared/utils/configs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { version } from '../package.json' with { type: 'josn' }

const config = resolveConfig({
    appVersion: version,
    home: homedir(),
})

describe('test gemini', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('should ', async () => {
        const data = await loadGeminiUsage(config)
        await expect(data).toMatchFileSnapshot('./gemini.json')
    })

    it('does not include historical usage in daily rows when today is empty', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-04-17T08:00:00.000Z'))

        const geminiPath = await mkdtemp(join(tmpdir(), 'usage-board-gemini-'))

        try {
            const chatsDir = join(geminiPath, 'tmp', 'example-project', 'chats')
            await mkdir(chatsDir, { recursive: true })
            await writeFile(join(chatsDir, 'session-fixture.json'), JSON.stringify({
                lastUpdated: '2026-04-16T00:05:00.000Z',
                messages: [
                    {
                        content: 'hello',
                        timestamp: '2026-04-16T00:00:00.000Z',
                        type: 'user',
                    },
                    {
                        model: 'gemini-2.5-flash',
                        timestamp: '2026-04-16T00:01:00.000Z',
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
                sessionId: 'fixture-session',
                startTime: '2026-04-16T00:00:00.000Z',
            }))

            const data = await loadGeminiUsage({
                ...config,
                geminiPath,
            })

            expect(data.dailyRows).toHaveLength(0)
            expect(data.dailyTokenUsage).toHaveLength(1)
            expect(data.monthlyRows).toHaveLength(1)
            expect(data.sessionUsage).toHaveLength(1)
            expect(data.todayTotalCost).toBe(0)
            expect(data.todayTotalTokens).toBe(0)
            expect(data.todayTopModel).toBeNull()
            expect(data.todayTopProject).toBeNull()
            expect(data.overviewCards[2]?.value).toBe('-')
            expect(data.overviewCards[3]?.value).toBe('-')
        }
        finally {
            await rm(geminiPath, { force: true, recursive: true })
        }
    })
})
