import { mkdirSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { UsageCacheRepository } from '../server/repositories/sqlite/usage-cache.repository'
import { UsageDataRuntime } from '../server/services/usage-data-runtime'

const createdRoots: string[] = []

afterEach(() => {
    while (createdRoots.length > 0) {
        rmSync(createdRoots.pop()!, {
            force: true,
            recursive: true,
        })
    }
})

describe('usage data runtime startup', () => {
    it('hydrates from cache.sqlite without reparsing unchanged source files', async () => {
        const root = mkdtempSync(join(tmpdir(), 'usage-board-runtime-startup-'))
        createdRoots.push(root)

        const cacheDirectory = join(root, '.usage-board')
        const databasePath = join(cacheDirectory, 'cache.sqlite')
        const codexSessionsDirectory = join(root, '.codex', 'sessions', '2026')
        const sessionPath = join(codexSessionsDirectory, 'startup-session.jsonl')

        mkdirSync(cacheDirectory, { recursive: true })
        mkdirSync(codexSessionsDirectory, { recursive: true })
        writeFileSync(sessionPath, '{"type":"session_meta","payload":{"id":"startup-session","cwd":"/tmp/demo"}}\n', 'utf8')

        const updatedAt = new Date('2026-06-11T08:00:00.000Z')
        utimesSync(sessionPath, updatedAt, updatedAt)

        const repository = new UsageCacheRepository(databasePath)
        const sessionStat = statSync(sessionPath)

        repository.upsertSourceFiles([{
            hash: 'codex-speed:standard',
            mtimeMs: sessionStat.mtimeMs,
            path: sessionPath,
            platform: 'codex',
            size: sessionStat.size,
        }])

        repository.upsertInteractions([{
            cacheCreation: 0,
            cacheRead: 0,
            cachedInputToken: 0,
            dedupeKey: null,
            extraTotalTokens: 0,
            fallbackDedupeKey: null,
            inputToken: 10,
            interactionIndex: 0,
            isFallbackModel: false,
            isSidechain: false,
            model: 'gpt-5',
            outputToken: 20,
            platform: 'codex',
            projectName: 'demo',
            provider: null,
            rawCostUsd: 0.5,
            reasoningToken: 0,
            repository: 'local/demo',
            sessionId: 'startup-session',
            sessionStartedAt: '2026-06-11T08:00:00.000Z',
            sourceFile: sessionPath,
            speed: 'standard',
            threadName: 'startup',
            timestamp: '2026-06-11T08:00:00.000Z',
            toolTokens: 0,
            totalToken: 30,
            type: 'message',
            role: 'assistant',
        }])
        repository.close()

        const runtime = new UsageDataRuntime({
            ampPaths: [],
            claudeCodePath: join(root, '.claude'),
            claudeCodePaths: [],
            codebuffPaths: [],
            codexPath: join(root, '.codex'),
            copilotPaths: [],
            droidPaths: [],
            geminiPath: join(root, '.gemini'),
            goosePaths: [],
            hermesPaths: [],
            home: root,
            kiloPaths: [],
            kimiPaths: [],
            openClawPaths: [],
            openCodePaths: [],
            piPaths: [],
            qwenPaths: [],
            version: 'test',
        })

        await runtime.initialize()
        await runtime.ensureFreshBootstrapForStartup({
            verboseWhenChanged: false,
        })

        const state = (runtime as any).state

        expect(state.bootstrap?.codex.sessionUsage).toHaveLength(1)
        expect(state.hasIndexedCurrentProcess).toBe(true)
        expect(state.indexedFiles).toBeNull()

        runtime.dispose()
    })
})
