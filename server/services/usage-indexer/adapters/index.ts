import type { ProjectUsagePlatformRecord } from '#shared/types/ai'
import type { UsagePlatformAdapter } from '../platform-adapter'
import { ampUsageAdapter } from './amp'
import { claudeCodeUsageAdapter } from './claude-code'
import { codebuffUsageAdapter } from './codebuff'
import { codexUsageAdapter } from './codex'
import { copilotUsageAdapter } from './copilot'
import { droidUsageAdapter } from './droid'
import { geminiUsageAdapter } from './gemini'
import { gooseUsageAdapter } from './goose'
import { hermesUsageAdapter } from './hermes'
import { kiloUsageAdapter } from './kilo'
import { kimiUsageAdapter } from './kimi'
import { openClawUsageAdapter } from './openclaw'
import { openCodeUsageAdapter } from './opencode'
import { piUsageAdapter } from './pi'
import { qwenUsageAdapter } from './qwen'

export const usagePlatformAdapters: ProjectUsagePlatformRecord<UsagePlatformAdapter> = {
    amp: ampUsageAdapter,
    claudeCode: claudeCodeUsageAdapter,
    codebuff: codebuffUsageAdapter,
    codex: codexUsageAdapter,
    copilot: copilotUsageAdapter,
    droid: droidUsageAdapter,
    gemini: geminiUsageAdapter,
    goose: gooseUsageAdapter,
    hermes: hermesUsageAdapter,
    kilo: kiloUsageAdapter,
    kimi: kimiUsageAdapter,
    openclaw: openClawUsageAdapter,
    opencode: openCodeUsageAdapter,
    pi: piUsageAdapter,
    qwen: qwenUsageAdapter,
}
