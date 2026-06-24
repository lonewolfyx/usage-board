import type { AgentAdapter } from '#server/agents/shared/fact'
import type { ProjectUsagePlatform, ProjectUsagePlatformRecord } from '#shared/types/ai'
import type { IConfig } from '#shared/types/config'
import { AmpAdapter } from './amp/adapter'
import { ClaudeCodeAdapter } from './claude-code/adapter'
import { CodebuffAdapter } from './codebuff/adapter'
import { CodexAdapter } from './codex/adapter'
import { CopilotAdapter } from './copilot/adapter'
import { DroidAdapter } from './droid/adapter'
import { GeminiAdapter } from './gemini/adapter'
import { GooseAdapter } from './goose/adapter'
import { HermesAdapter } from './hermes/adapter'
import { KiloAdapter } from './kilo/adapter'
import { KimiAdapter } from './kimi/adapter'
import { OpenClawAdapter } from './openclaw/adapter'
import { OpenCodeAdapter } from './opencode/adapter'
import { PiAdapter } from './pi/adapter'
import { QwenAdapter } from './qwen/adapter'

export function createAgentAdapters(config: IConfig): ProjectUsagePlatformRecord<AgentAdapter> {
    const adapters = {
        amp: new AmpAdapter(config),
        claudeCode: new ClaudeCodeAdapter(config),
        codebuff: new CodebuffAdapter(config),
        codex: new CodexAdapter(config),
        copilot: new CopilotAdapter(config),
        droid: new DroidAdapter(config),
        gemini: new GeminiAdapter(config),
        goose: new GooseAdapter(config),
        hermes: new HermesAdapter(config),
        kilo: new KiloAdapter(config),
        kimi: new KimiAdapter(config),
        openclaw: new OpenClawAdapter(config),
        opencode: new OpenCodeAdapter(config),
        pi: new PiAdapter(config),
        qwen: new QwenAdapter(config),
    }

    for (const [platform, adapter] of Object.entries(adapters) as Array<[ProjectUsagePlatform, AgentAdapter]>) {
        if (adapter.platform !== platform) {
            throw new Error(`Agent adapter platform mismatch: registered ${platform}, adapter declares ${adapter.platform}.`)
        }
    }

    return adapters
}

export function getAgentAdapterForPlatform(adapters: ProjectUsagePlatformRecord<AgentAdapter>, platform: ProjectUsagePlatform) {
    return adapters[platform]
}
