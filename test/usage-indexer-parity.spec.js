import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { UsageCacheRepository } from '../server/repositories/sqlite/usage-cache.repository.ts'
import { buildIncrementalUsageIndex } from '../server/services/usage-indexer.ts'
import { ampUsageAdapter } from '../server/services/usage-indexer/adapters/amp.ts'
import { claudeCodeUsageAdapter } from '../server/services/usage-indexer/adapters/claude-code.ts'
import { codebuffUsageAdapter } from '../server/services/usage-indexer/adapters/codebuff.ts'
import { codexUsageAdapter } from '../server/services/usage-indexer/adapters/codex.ts'
import { copilotUsageAdapter } from '../server/services/usage-indexer/adapters/copilot.ts'
import { droidUsageAdapter } from '../server/services/usage-indexer/adapters/droid.ts'
import { geminiUsageAdapter } from '../server/services/usage-indexer/adapters/gemini.ts'
import { gooseUsageAdapter } from '../server/services/usage-indexer/adapters/goose.ts'
import { hermesUsageAdapter } from '../server/services/usage-indexer/adapters/hermes.ts'
import { kiloUsageAdapter } from '../server/services/usage-indexer/adapters/kilo.ts'
import { kimiUsageAdapter } from '../server/services/usage-indexer/adapters/kimi.ts'
import { openClawUsageAdapter } from '../server/services/usage-indexer/adapters/openclaw.ts'
import { openCodeUsageAdapter } from '../server/services/usage-indexer/adapters/opencode.ts'
import { piUsageAdapter } from '../server/services/usage-indexer/adapters/pi.ts'
import { qwenUsageAdapter } from '../server/services/usage-indexer/adapters/qwen.ts'

const createdRoots = []
function zeroPricingResolver() {
    return {
        cachedInputCostPerMTokens: 0,
        cacheCreationInputCostPerMTokens: 0,
        inputCostPerMTokens: 0,
        outputCostPerMTokens: 0,
    }
}

afterEach(() => {
    while (createdRoots.length > 0) {
        rmSync(createdRoots.pop(), {
            force: true,
            recursive: true,
        })
    }
})

describe('usage indexer parity with ccusage', () => {
    it('matches Claude Code malformed-line filtering', () => {
        const filePath = createTempFile('claude/projects/-Users-me-demo/session-1.jsonl', [
            JSON.stringify({
                message: {
                    id: 'msg-valid',
                    model: 'claude-sonnet-4.5',
                    usage: {
                        cache_creation_input_tokens: 2,
                        cache_read_input_tokens: 4,
                        input_tokens: 10,
                        output_tokens: 6,
                    },
                },
                requestId: 'req-valid',
                sessionId: 'session-1',
                timestamp: '2026-01-02T00:00:00.000Z',
                version: '1.0.70',
            }),
            JSON.stringify({
                message: {
                    id: 'msg-invalid',
                    model: 'claude-sonnet-4.5',
                    usage: {
                        input_tokens: 400,
                        output_tokens: 100,
                    },
                },
                requestId: 'req-invalid',
                sessionId: 'session-1',
                timestamp: '2026-01-02T00:05:00.000Z',
                version: 'openai-codex',
            }),
        ])

        const interactions = getUsageInteractions(
            claudeCodeUsageAdapter.parseFile(filePath, zeroPricingResolver, discovered(filePath, 'claudeCode')),
        )

        expect(interactions).toHaveLength(1)
        expect(interactions[0].usage.totalTokens).toBe(22)
    })

    it('matches Claude Code unknown-model pricing fallback behavior', async () => {
        const filePath = createTempFile('claude/projects/-Users-me-demo/session-2.jsonl', [
            JSON.stringify({
                message: {
                    id: 'msg-mimo',
                    model: 'mimo-v2-pro',
                    usage: {
                        input_tokens: 1000,
                        output_tokens: 500,
                    },
                },
                requestId: 'req-mimo',
                sessionId: 'session-2',
                timestamp: '2026-01-02T00:00:00.000Z',
                version: '1.0.70',
            }),
        ])

        const resolvePricing = await claudeCodeUsageAdapter.createPricingResolver()
        const interaction = getUsageInteractions(
            claudeCodeUsageAdapter.parseFile(filePath, resolvePricing, discovered(filePath, 'claudeCode')),
        )[0]

        expect(interaction.model).toBe('mimo-v2-pro')
        expect(interaction.usage.costUSD).toBe(0)
    })

    it('matches Claude Code sidechain replay deduplication across request ids', async () => {
        const root = createTempDir('claude-sidechain')
        const sessionFile = join(root, 'projects/-Users-me-demo/session-1.jsonl')
        const sidechainFile = join(root, 'projects/-Users-me-demo/session-1/subagents/agent-1.jsonl')

        mkdirSync(dirname(sessionFile), { recursive: true })
        mkdirSync(dirname(sidechainFile), { recursive: true })
        writeFileSync(sessionFile, `${JSON.stringify({
            isSidechain: false,
            message: {
                id: 'msg-parent',
                model: 'claude-sonnet-4.5',
                usage: {
                    cache_read_input_tokens: 30,
                    input_tokens: 120,
                    output_tokens: 45,
                },
            },
            requestId: 'req-parent',
            sessionId: 'session-1',
            timestamp: '2026-01-02T00:00:00.000Z',
            version: '1.0.70',
        })}\n`)
        writeFileSync(sidechainFile, `${JSON.stringify({
            isSidechain: true,
            message: {
                id: 'msg-parent',
                model: 'claude-sonnet-4.5',
                usage: {
                    cache_read_input_tokens: 30,
                    input_tokens: 120,
                    output_tokens: 45,
                },
            },
            requestId: 'req-sidechain',
            sessionId: 'session-1',
            timestamp: '2026-01-02T00:00:01.000Z',
            version: '1.0.70',
        })}\n`)

        const { bootstrapByPlatform } = await buildIncrementalUsageIndex(createConfig({
            claudeCodePath: root,
            claudeCodePaths: [root],
        }), createMemoryRepository())

        expect(bootstrapByPlatform.claudeCode).toHaveLength(1)
        expect(bootstrapByPlatform.claudeCode[0].tokenTotal).toBe(195)
    })

    it('matches Claude Code daily agent progress deduplication against sidechain usage', async () => {
        const root = createTempDir('claude-agent-progress')
        const sessionFile = join(root, 'projects/-Users-me-demo/session-1.jsonl')
        const sidechainFile = join(root, 'projects/-Users-me-demo/session-1/subagents/agent-1.jsonl')

        mkdirSync(dirname(sessionFile), { recursive: true })
        mkdirSync(dirname(sidechainFile), { recursive: true })
        writeFileSync(sessionFile, `${JSON.stringify({
            cwd: '/Users/me/demo',
            data: {
                message: {
                    message: {
                        id: 'msg-sidechain-tool',
                        model: 'claude-sonnet-4.5',
                        role: 'assistant',
                        type: 'message',
                        usage: {
                            input_tokens: 0,
                            output_tokens: 0,
                        },
                    },
                    timestamp: '2026-01-02T00:00:00.000Z',
                    type: 'assistant',
                },
                type: 'agent_progress',
            },
            isSidechain: false,
            sessionId: 'session-1',
            timestamp: '2026-01-02T00:00:00.001Z',
            type: 'progress',
            version: '1.0.70',
        })}\n`)
        writeFileSync(sidechainFile, `${JSON.stringify({
            cwd: '/Users/me/demo',
            isSidechain: true,
            message: {
                id: 'msg-sidechain-tool',
                model: 'claude-sonnet-4.5',
                role: 'assistant',
                type: 'message',
                usage: {
                    cache_read_input_tokens: 30,
                    input_tokens: 120,
                    output_tokens: 45,
                },
            },
            sessionId: 'session-1',
            timestamp: '2026-01-02T00:00:00.000Z',
            type: 'assistant',
            version: '1.0.70',
        })}\n`)

        const { bootstrapByPlatform } = await buildIncrementalUsageIndex(createConfig({
            claudeCodePath: root,
            claudeCodePaths: [root],
        }), createMemoryRepository())

        expect(bootstrapByPlatform.claudeCode).toHaveLength(0)
    })

    it('preserves Claude Code fallback dedupe metadata in the indexed cache', async () => {
        const root = createTempDir('claude-cache-dedupe')
        const sessionFile = join(root, 'projects/-Users-me-demo/session-1.jsonl')
        const sidechainFile = join(root, 'projects/-Users-me-demo/session-1/subagents/agent-1.jsonl')

        mkdirSync(dirname(sessionFile), { recursive: true })
        mkdirSync(dirname(sidechainFile), { recursive: true })
        writeFileSync(sessionFile, `${JSON.stringify({
            data: {
                message: {
                    message: {
                        id: 'msg-cache-dedupe',
                        model: 'mimo-v2-pro',
                        role: 'assistant',
                        type: 'message',
                        usage: {
                            cache_read_input_tokens: 300,
                            input_tokens: 20,
                            output_tokens: 5,
                        },
                    },
                    timestamp: '2026-01-02T00:00:00.000Z',
                    type: 'assistant',
                },
                type: 'agent_progress',
            },
            isSidechain: false,
            sessionId: 'session-1',
            timestamp: '2026-01-02T00:00:00.001Z',
            type: 'progress',
            version: '1.0.70',
        })}\n`)
        writeFileSync(sidechainFile, `${JSON.stringify({
            isSidechain: true,
            message: {
                id: 'msg-cache-dedupe',
                model: 'mimo-v2-pro',
                role: 'assistant',
                type: 'message',
                usage: {
                    cache_read_input_tokens: 300,
                    input_tokens: 20,
                    output_tokens: 5,
                },
            },
            sessionId: 'session-1',
            timestamp: '2026-01-02T00:00:00.000Z',
            type: 'assistant',
            version: '1.0.70',
        })}\n`)

        const repository = new UsageCacheRepository(join(root, 'cache.sqlite'))
        const config = createConfig({
            claudeCodePath: root,
            claudeCodePaths: [root],
        })

        await buildIncrementalUsageIndex(config, repository)
        const { bootstrapByPlatform } = await buildIncrementalUsageIndex(config, repository)
        repository.close()

        expect(bootstrapByPlatform.claudeCode).toHaveLength(1)
        expect(bootstrapByPlatform.claudeCode[0].tokenTotal).toBe(325)
    })

    it('matches Codex headless usage parsing and numeric timestamps', () => {
        const headlessFile = createTempFile('codex/run.jsonl', [
            JSON.stringify({
                timestamp: '2026-01-02T03:04:05.000Z',
                type: 'turn.completed',
                model: 'gpt-5.2-codex',
                usage: {
                    cached_input_tokens: 20,
                    input_tokens: 120,
                    output_tokens: 30,
                    total_tokens: 150,
                },
            }),
            JSON.stringify({
                type: 'result',
                data: {
                    timestamp: '2026-01-02T03:05:05.000Z',
                    model_name: 'gpt-5.2-codex',
                    usage: {
                        cached_tokens: 5,
                        completion_tokens: 12,
                        prompt_tokens: 50,
                    },
                },
            }),
            JSON.stringify({
                timestamp: '2026-01-02T03:06:05.000Z',
                type: 'turn.completed',
                model: 'gpt-5.2-codex',
                usage: {
                    input_tokens: 9,
                    output_tokens: 4,
                    reasoning_output_tokens: 1,
                    total_tokens: 0,
                },
            }),
        ])
        const numericTimestampFile = createTempFile('codex/session.jsonl', [
            JSON.stringify({
                timestamp: '2026-01-02T00:00:00.000Z',
                type: 'turn_context',
                payload: { model: 'gpt-5' },
            }),
            JSON.stringify({
                timestamp: 1767312001000,
                type: 'event_msg',
                payload: {
                    info: {
                        model: 'gpt-5',
                        total_token_usage: {
                            cached_input_tokens: 10,
                            input_tokens: 100,
                            output_tokens: 50,
                            reasoning_output_tokens: 0,
                            total_tokens: 150,
                        },
                    },
                    type: 'token_count',
                },
            }),
        ])

        const headlessInteractions = getUsageInteractions(
            codexUsageAdapter.parseFile(headlessFile, zeroPricingResolver, discovered(headlessFile, 'codex')),
        )
        const numericInteraction = getUsageInteractions(
            codexUsageAdapter.parseFile(numericTimestampFile, zeroPricingResolver, discovered(numericTimestampFile, 'codex')),
        )[0]

        // Codex now only stores token_count type entries; headless entries (turn.completed, result) are skipped
        expect(headlessInteractions).toHaveLength(0)
        expect(numericInteraction.timestamp).toBe('2026-01-02T00:00:01.000Z')
        expect(numericInteraction.usage.inputTokens).toBe(90)
    })

    it('ignores Codex token_count deltas that only carry total_tokens', () => {
        const filePath = createTempFile('codex/total-only-token-count.jsonl', [
            JSON.stringify({
                timestamp: '2026-01-02T00:00:00.000Z',
                type: 'turn_context',
                payload: { model: 'gpt-5' },
            }),
            JSON.stringify({
                timestamp: '2026-01-02T00:00:01.000Z',
                type: 'event_msg',
                payload: {
                    info: {
                        model: 'gpt-5',
                        last_token_usage: {
                            input_tokens: 0,
                            cached_input_tokens: 0,
                            output_tokens: 0,
                            reasoning_output_tokens: 0,
                            total_tokens: 15,
                        },
                    },
                    type: 'token_count',
                },
            }),
        ])

        const interactions = getUsageInteractions(
            codexUsageAdapter.parseFile(filePath, zeroPricingResolver, discovered(filePath, 'codex')),
        )

        expect(interactions).toHaveLength(0)
    })

    it('matches Codex unknown-model pricing fallback behavior', async () => {
        const filePath = createTempFile('codex/unknown-model.jsonl', [
            JSON.stringify({
                timestamp: '2026-01-02T00:00:00.000Z',
                type: 'event_msg',
                payload: {
                    info: {
                        model: 'mimo-v2-pro',
                        last_token_usage: {
                            input_tokens: 1000,
                            output_tokens: 500,
                            total_tokens: 1500,
                        },
                    },
                    type: 'token_count',
                },
            }),
        ])

        const resolvePricing = await codexUsageAdapter.createPricingResolver()
        const interaction = getUsageInteractions(
            codexUsageAdapter.parseFile(filePath, resolvePricing, discovered(filePath, 'codex')),
        )[0]

        expect(interaction.model).toBe('mimo-v2-pro')
        expect(interaction.usage.costUSD).toBe(0)
    })

    it('matches Codex distinct-session deduplication boundaries', async () => {
        const root = createTempDir('codex-dedupe')
        const firstFile = join(root, 'sessions/2026/01/02/session-a.jsonl')
        const secondFile = join(root, 'sessions/2026/01/02/session-b.jsonl')
        const sharedUsageLine = JSON.stringify({
            timestamp: '2026-01-02T00:00:00.000Z',
            type: 'event_msg',
            payload: {
                info: {
                    model: 'gpt-5',
                    last_token_usage: {
                        cached_input_tokens: 10,
                        input_tokens: 100,
                        output_tokens: 50,
                        reasoning_output_tokens: 0,
                        total_tokens: 150,
                    },
                },
                type: 'token_count',
            },
        })

        mkdirSync(dirname(firstFile), { recursive: true })
        mkdirSync(dirname(secondFile), { recursive: true })
        writeFileSync(firstFile, `${sharedUsageLine}\n`)
        writeFileSync(secondFile, `${sharedUsageLine}\n`)

        const { bootstrapByPlatform } = await buildIncrementalUsageIndex(createConfig({
            codexPath: root,
        }), createMemoryRepository())

        expect(bootstrapByPlatform.codex).toHaveLength(2)
        expect(bootstrapByPlatform.codex.reduce((sum, session) => sum + session.tokenTotal, 0)).toBe(300)
    })

    it('keeps Goose extra tokens outside reasoning and avoids cross-db session collisions', () => {
        const firstDb = createSqliteFile('goose/first.db', (db) => {
            db.exec(`
                CREATE TABLE sessions (
                    id TEXT PRIMARY KEY,
                    model_config_json TEXT,
                    provider_name TEXT,
                    created_at TEXT,
                    total_tokens INTEGER,
                    input_tokens INTEGER,
                    output_tokens INTEGER,
                    accumulated_total_tokens INTEGER,
                    accumulated_input_tokens INTEGER,
                    accumulated_output_tokens INTEGER
                )
            `)
            db.prepare(`
                INSERT INTO sessions (
                    id, model_config_json, provider_name, created_at,
                    accumulated_total_tokens, accumulated_input_tokens, accumulated_output_tokens
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                'session-a',
                '{"model_name":"claude-sonnet-4-20250514"}',
                'anthropic',
                '2026-05-01 01:02:03',
                180,
                100,
                50,
            )
        })
        const secondDb = createSqliteFile('goose/second.db', (db) => {
            db.exec(`
                CREATE TABLE sessions (
                    id TEXT PRIMARY KEY,
                    model_config_json TEXT,
                    provider_name TEXT,
                    created_at TEXT,
                    total_tokens INTEGER,
                    input_tokens INTEGER,
                    output_tokens INTEGER,
                    accumulated_total_tokens INTEGER,
                    accumulated_input_tokens INTEGER,
                    accumulated_output_tokens INTEGER
                )
            `)
            db.prepare(`
                INSERT INTO sessions (
                    id, model_config_json, provider_name, created_at,
                    accumulated_total_tokens, accumulated_input_tokens, accumulated_output_tokens
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                'session-a',
                '{"model_name":"claude-sonnet-4-20250514"}',
                'anthropic',
                '2026-05-01 01:02:03',
                180,
                100,
                50,
            )
        })

        const firstInteraction = getUsageInteractions(
            gooseUsageAdapter.parseFile(firstDb, zeroPricingResolver, discovered(firstDb, 'goose')),
        )[0]
        const secondInteraction = getUsageInteractions(
            gooseUsageAdapter.parseFile(secondDb, zeroPricingResolver, discovered(secondDb, 'goose')),
        )[0]

        expect(firstInteraction.usage.extraTotalTokens).toBe(30)
        expect(firstInteraction.usage.reasoningOutputTokens).toBe(0)
        expect(firstInteraction.dedupeKey).not.toBe(secondInteraction.dedupeKey)
    })

    it('matches Hermes and Droid extra token accounting and latest-snapshot selection', async () => {
        const hermesDb = createSqliteFile('hermes/state.db', (db) => {
            db.exec(`
                CREATE TABLE sessions (
                    id TEXT PRIMARY KEY,
                    source TEXT NOT NULL,
                    model TEXT,
                    started_at REAL NOT NULL,
                    message_count INTEGER DEFAULT 0,
                    input_tokens INTEGER DEFAULT 0,
                    output_tokens INTEGER DEFAULT 0,
                    cache_read_tokens INTEGER DEFAULT 0,
                    cache_write_tokens INTEGER DEFAULT 0,
                    reasoning_tokens INTEGER DEFAULT 0,
                    billing_provider TEXT,
                    estimated_cost_usd REAL,
                    actual_cost_usd REAL
                )
            `)
            db.prepare(`
                INSERT INTO sessions (
                    id, source, model, started_at, message_count,
                    input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens,
                    billing_provider, estimated_cost_usd, actual_cost_usd
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                'session-1',
                'cli',
                'claude-sonnet-4-20250514',
                1_750_000_000.25,
                42,
                1200,
                300,
                50,
                20,
                10,
                'anthropic',
                0.12,
                0.34,
            )
        })
        const droidRoot = createTempDir('droid')
        mkdirSync(join(droidRoot, 'archive'), { recursive: true })
        writeFileSync(join(droidRoot, 'archive', 'session-c.settings.json'), JSON.stringify({
            model: 'gpt-5',
            providerLock: 'openai',
            providerLockTimestamp: '2026-05-01T01:02:03.000Z',
            tokenUsage: {
                inputTokens: 10,
                outputTokens: 20,
            },
        }))
        writeFileSync(join(droidRoot, 'session-c.settings.json'), JSON.stringify({
            model: 'Claude-Sonnet-4-[Anthropic]',
            providerLock: 'anthropic',
            providerLockTimestamp: '2026-05-02T01:02:03.000Z',
            tokenUsage: {
                cacheCreationTokens: 20,
                cacheReadTokens: 10,
                inputTokens: 100,
                outputTokens: 50,
                thinkingTokens: 5,
            },
        }))

        const hermesInteraction = getUsageInteractions(
            hermesUsageAdapter.parseFile(hermesDb, zeroPricingResolver, discovered(hermesDb, 'hermes')),
        )[0]
        const droidFiles = await droidUsageAdapter.discoverFiles({ droidPaths: [droidRoot] })
        const droidInteraction = getUsageInteractions(
            droidUsageAdapter.parseFile(droidFiles[0].path, zeroPricingResolver, droidFiles[0]),
        )[0]

        expect(hermesInteraction.usage.extraTotalTokens).toBe(10)
        expect(hermesInteraction.usage.reasoningOutputTokens).toBe(0)
        expect(droidFiles).toHaveLength(1)
        expect(droidFiles[0].path).toContain('session-c.settings.json')
        expect(droidInteraction.usage.extraTotalTokens).toBe(5)
        expect(droidInteraction.model).toBe('claude-sonnet-4')
    })

    it('matches Gemini, Kilo, and Qwen extra token accounting', () => {
        const geminiFile = createJsonFile('gemini/session-a.json', {
            lastUpdated: '2026-05-17T11:07:33.000Z',
            messages: [{
                content: [{ text: 'hello' }],
                model: 'gemini-3-flash-preview',
                timestamp: '2026-05-17T11:07:32.000Z',
                tokens: {
                    cached: 11526,
                    input: 15327,
                    output: 23,
                    thoughts: 919,
                    tool: 7,
                    total: 16276,
                },
                type: 'gemini',
            }],
            sessionId: 'session-a',
        })
        const kiloDb = createSqliteFile('kilo/kilo.db', (db) => {
            db.exec('CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, data TEXT)')
            db.prepare('INSERT INTO message (id, session_id, data) VALUES (?, ?, ?)').run(
                'msg-1',
                'session-a',
                JSON.stringify({
                    id: 'msg-1',
                    modelID: 'claude-sonnet-4-5',
                    providerID: 'anthropic',
                    role: 'assistant',
                    session_id: 'session-a',
                    time: { created: '2026-01-02T01:02:03.000Z' },
                    tokens: {
                        cache: { read: 10, write: 20 },
                        input: 100,
                        output: 50,
                        reasoning: 5,
                    },
                }),
            )
        })
        const qwenFile = createTempFile('qwen/projects/myProject/chats/session-json.jsonl', [
            JSON.stringify({
                model: 'qwen3-coder-plus',
                timestamp: '2026-02-23T00:00:00.000Z',
                type: 'assistant',
                usageMetadata: {
                    cachedContentTokenCount: 5,
                    candidatesTokenCount: 50,
                    promptTokenCount: 100,
                    thoughtsTokenCount: 10,
                    totalTokenCount: 165,
                },
            }),
        ])

        const geminiInteraction = getUsageInteractions(
            geminiUsageAdapter.parseFile(geminiFile, zeroPricingResolver, discovered(geminiFile, 'gemini')),
        )[0]
        const kiloInteraction = getUsageInteractions(
            kiloUsageAdapter.parseFile(kiloDb, zeroPricingResolver, discovered(kiloDb, 'kilo')),
        )[0]
        const qwenInteraction = getUsageInteractions(
            qwenUsageAdapter.parseFile(qwenFile, zeroPricingResolver, discovered(qwenFile, 'qwen')),
        )[0]

        expect(geminiInteraction.usage.inputTokens).toBe(3808)
        expect(geminiInteraction.usage.costUSD).toBe(0)
        expect(geminiInteraction.usage.extraTotalTokens).toBe(919)
        expect(geminiInteraction.usage.reasoningOutputTokens).toBe(0)
        expect(kiloInteraction.usage.extraTotalTokens).toBe(5)
        expect(kiloInteraction.usage.reasoningOutputTokens).toBe(0)
        expect(qwenInteraction.usage.extraTotalTokens).toBe(10)
        expect(qwenInteraction.usage.reasoningOutputTokens).toBe(0)
    })

    it('matches Gemini unknown-model pricing fallback behavior', async () => {
        const filePath = createJsonFile('gemini/session-unknown.json', {
            messages: [{
                content: [{ text: 'hello' }],
                model: 'mimo-v2-pro',
                timestamp: '2026-05-17T11:07:32.000Z',
                tokens: {
                    cached: 0,
                    input: 1000,
                    output: 500,
                    total: 1500,
                },
                type: 'gemini',
            }],
            sessionId: 'session-unknown',
        })

        const resolvePricing = await geminiUsageAdapter.createPricingResolver()
        const interaction = getUsageInteractions(
            geminiUsageAdapter.parseFile(filePath, resolvePricing, discovered(filePath, 'gemini')),
        )[0]

        expect(interaction.model).toBe('mimo-v2-pro')
        expect(interaction.usage.costUSD).toBe(0)
    })

    it('matches Amp total-token fallback and keeps credits out of cost', () => {
        const filePath = createJsonFile('amp/threads/thread-a.json', {
            id: 'thread-a',
            usageLedger: {
                events: [{
                    credits: 3.5,
                    id: 'event-a',
                    model: 'mimo-v2-pro',
                    timestamp: '2026-01-02T00:00:00.000Z',
                    tokens: {
                        total: 345,
                    },
                }],
            },
        })

        const interaction = getUsageInteractions(
            ampUsageAdapter.parseFile(filePath, zeroPricingResolver, discovered(filePath, 'amp')),
        )[0]

        expect(interaction.usage.outputTokens).toBe(345)
        expect(interaction.usage.extraTotalTokens).toBeUndefined()
        expect(interaction.usage.costUSD).toBe(0)
    })

    it('matches Codebuff usage fallback and does not treat credits as cost', () => {
        const filePath = createJsonFile('codebuff/projects/project-a/chats/2026-01-02T03-04-05.000Z/chat-messages.json', [{
            credits: 1.25,
            metadata: {
                usage: {
                    totalTokens: 789,
                },
            },
            role: 'assistant',
        }])

        const interaction = getUsageInteractions(
            codebuffUsageAdapter.parseFile(filePath, zeroPricingResolver, discovered(filePath, 'codebuff')),
        )[0]

        expect(interaction.usage.outputTokens).toBe(789)
        expect(interaction.usage.extraTotalTokens).toBeUndefined()
        expect(interaction.usage.costUSD).toBe(0)
    })

    it('matches Copilot reasoning accounting as extra tokens', () => {
        const filePath = createTempFile('copilot/session.jsonl', [
            JSON.stringify({
                attributes: {
                    'gen_ai.conversation.id': 'conv-1',
                    'gen_ai.operation.name': 'chat',
                    'gen_ai.request.model': 'claude-sonnet-4',
                    'gen_ai.response.model': 'claude-sonnet-4',
                    'gen_ai.usage.cache_creation.input_tokens': 25,
                    'gen_ai.usage.cache_read.input_tokens': 123,
                    'gen_ai.usage.input_tokens': 19452,
                    'gen_ai.usage.output_tokens': 281,
                    'gen_ai.usage.reasoning.output_tokens': 128,
                },
                endTime: [1_775_934_264, 967_317_833],
                name: 'chat claude-sonnet-4',
                spanId: 'span-1',
                traceId: 'trace-1',
                type: 'span',
            }),
        ])

        const interaction = getUsageInteractions(
            copilotUsageAdapter.parseFile(filePath, zeroPricingResolver, discovered(filePath, 'copilot')),
        )[0]

        expect(interaction.usage.inputTokens).toBe(19329)
        expect(interaction.usage.extraTotalTokens).toBe(128)
        expect(interaction.usage.reasoningOutputTokens).toBe(0)
    })

    it('matches Kimi, OpenClaw, and Pi total-token fallback behavior', () => {
        const kimiRoot = createTempDir('kimi')
        mkdirSync(join(kimiRoot, 'sessions/group/session-a'), { recursive: true })
        writeFileSync(join(kimiRoot, 'config.json'), JSON.stringify({ model: 'kimi-k2' }))
        writeFileSync(join(kimiRoot, 'sessions/group/session-a/wire.jsonl'), `${JSON.stringify({
            timestamp: 1770983427.123,
            message: {
                payload: {
                    token_usage: {
                        total: 432,
                    },
                },
                type: 'StatusUpdate',
            },
        })}\n`)
        const openClawFile = createTempFile('openclaw/agents/main/sessions/abc.jsonl', [
            JSON.stringify({
                data: {
                    modelId: 'gpt-5.2',
                    provider: 'openai-codex',
                },
                type: 'model_change',
            }),
            JSON.stringify({
                message: {
                    role: 'assistant',
                    timestamp: 1769753935279,
                    usage: {
                        totalTokens: 222,
                    },
                },
                type: 'message',
            }),
        ])
        const piFile = createTempFile('pi/sessions/project-a/agent_session-a.jsonl', [
            JSON.stringify({
                message: {
                    model: 'gpt-5',
                    role: 'assistant',
                    usage: {
                        totalTokens: 333,
                    },
                },
                timestamp: '2026-01-02T00:00:00.000Z',
                type: 'message',
            }),
        ])

        const kimiInteraction = getUsageInteractions(
            kimiUsageAdapter.parseFile(join(kimiRoot, 'sessions/group/session-a/wire.jsonl'), zeroPricingResolver, discovered(join(kimiRoot, 'sessions/group/session-a/wire.jsonl'), 'kimi')),
        )[0]
        const openClawInteraction = getUsageInteractions(
            openClawUsageAdapter.parseFile(openClawFile, zeroPricingResolver, discovered(openClawFile, 'openclaw')),
        )[0]
        const piInteraction = getUsageInteractions(
            piUsageAdapter.parseFile(piFile, zeroPricingResolver, discovered(piFile, 'pi')),
        )[0]

        expect(kimiInteraction.usage.outputTokens).toBe(432)
        expect(kimiInteraction.usage.extraTotalTokens).toBeUndefined()
        expect(openClawInteraction.model).toBe('[openclaw] gpt-5.2')
        expect(openClawInteraction.usage.outputTokens).toBe(222)
        expect(openClawInteraction.usage.extraTotalTokens).toBeUndefined()
        expect(piInteraction.usage.outputTokens).toBe(333)
        expect(piInteraction.usage.extraTotalTokens).toBeUndefined()
    })

    it('matches OpenCode database precedence over duplicate JSON files', () => {
        const root = createTempDir('opencode')
        const databasePath = join(root, 'opencode.db')
        const messagePath = join(root, 'storage', 'message', 'message.json')

        mkdirSync(dirname(messagePath), { recursive: true })
        const database = new DatabaseSync(databasePath)
        database.exec('CREATE TABLE message (id TEXT, session_id TEXT, data TEXT)')
        database.prepare('INSERT INTO message (id, session_id, data) VALUES (?, ?, ?)').run(
            'msg-1',
            'db-session-a',
            JSON.stringify({
                cost: 0.03,
                modelID: 'claude-sonnet-4-20250514',
                providerID: 'anthropic',
                time: { created: 1767312000000 },
                tokens: { input: 120, output: 60 },
            }),
        )
        database.close()
        writeFileSync(messagePath, JSON.stringify({
            cost: 0.99,
            id: 'msg-1',
            modelID: 'claude-sonnet-4-20250514',
            providerID: 'anthropic',
            sessionID: 'json-session-a',
            time: { created: 1767312000000 },
            tokens: { input: 999, output: 999 },
        }))

        const databaseInteraction = getUsageInteractions(
            openCodeUsageAdapter.parseFile(databasePath, zeroPricingResolver, discovered(databasePath, 'opencode')),
        )[0]
        const jsonFragments = openCodeUsageAdapter.parseFile(messagePath, zeroPricingResolver, discovered(messagePath, 'opencode'))

        expect(databaseInteraction.usage.inputTokens).toBe(120)
        expect(databaseInteraction.usage.costUSD).toBe(0.03)
        expect(jsonFragments).toHaveLength(0)
    })
})

function discovered(filePath, platform) {
    return {
        cacheSignature: 'codex-speed:standard',
        mtimeMs: 0,
        path: filePath,
        platform,
        size: 0,
    }
}

function createTempDir(prefix) {
    const root = mkdtempSync(join(tmpdir(), `usage-board-${prefix}-`))
    createdRoots.push(root)
    return root
}

function createTempFile(relativePath, lines) {
    const root = createTempDir('file')
    const filePath = join(root, relativePath)
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8')
    return filePath
}

function createJsonFile(relativePath, value) {
    const root = createTempDir('json')
    const filePath = join(root, relativePath)
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, JSON.stringify(value), 'utf8')
    return filePath
}

function createSqliteFile(relativePath, fill) {
    const root = createTempDir('sqlite')
    const filePath = join(root, relativePath)
    mkdirSync(dirname(filePath), { recursive: true })
    const database = new DatabaseSync(filePath)
    fill(database)
    database.close()
    return filePath
}

function getUsageInteractions(fragments) {
    return fragments.flatMap(fragment => fragment.interactions).filter(interaction => interaction.usage)
}

function createConfig(overrides = {}) {
    return {
        version: 'test',
        home: '/tmp',
        ampPaths: [],
        claudeCodePath: '/tmp/claude',
        claudeCodePaths: [],
        codebuffPaths: [],
        copilotPaths: [],
        codexPath: '/tmp/codex',
        droidPaths: [],
        geminiPath: '/tmp/gemini',
        goosePaths: [],
        hermesPaths: [],
        kiloPaths: [],
        kimiPaths: [],
        openClawPaths: [],
        openCodePaths: [],
        piPaths: [],
        qwenPaths: [],
        ...overrides,
    }
}

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
                        models_csv: '',
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
