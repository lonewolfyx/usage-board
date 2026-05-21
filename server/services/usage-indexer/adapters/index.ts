import type { ProjectUsagePlatformRecord } from '#shared/types/ai'
import type { UsagePlatformAdapter } from '../platform-adapter'
import { claudeCodeUsageAdapter } from './claude-code'
import { codexUsageAdapter } from './codex'
import { geminiUsageAdapter } from './gemini'

export const usagePlatformAdapters: ProjectUsagePlatformRecord<UsagePlatformAdapter> = {
    claudeCode: claudeCodeUsageAdapter,
    codex: codexUsageAdapter,
    gemini: geminiUsageAdapter,
}
