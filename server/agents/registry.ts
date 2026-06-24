import type { AgentAdapter } from '#server/agents/shared/fact'
import type { ProjectUsagePlatform } from '#shared/types/ai'
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

const ADAPTER_CONSTRUCTORS: Record<ProjectUsagePlatform, new (config: IConfig) => AgentAdapter> = {
    amp: AmpAdapter,
    claudeCode: ClaudeCodeAdapter,
    codebuff: CodebuffAdapter,
    codex: CodexAdapter,
    copilot: CopilotAdapter,
    droid: DroidAdapter,
    gemini: GeminiAdapter,
    goose: GooseAdapter,
    hermes: HermesAdapter,
    kilo: KiloAdapter,
    kimi: KimiAdapter,
    openclaw: OpenClawAdapter,
    opencode: OpenCodeAdapter,
    pi: PiAdapter,
    qwen: QwenAdapter,
}

export function createAgentAdapters(config: IConfig): Map<ProjectUsagePlatform, AgentAdapter> {
    const adapters = new Map<ProjectUsagePlatform, AgentAdapter>()

    for (const platform of config.activePlatforms) {
        const Adapter = ADAPTER_CONSTRUCTORS[platform]
        const adapter = new Adapter(config)

        if (adapter.platform !== platform) {
            throw new Error(`Agent adapter platform mismatch: registered ${platform}, adapter declares ${adapter.platform}.`)
        }

        adapters.set(platform, adapter)
    }

    return adapters
}

export function getAgentAdapterForPlatform(adapters: Map<ProjectUsagePlatform, AgentAdapter>, platform: ProjectUsagePlatform) {
    const adapter = adapters.get(platform)

    if (!adapter) {
        throw new Error(`No adapter found for platform: ${platform}`)
    }

    return adapter
}
