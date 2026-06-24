import type { ProjectUsagePlatform } from '#shared/types/ai'
import type { AgentType } from '#shared/utils/vendor-agents'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { detectInstalledAgents } from '#shared/utils/vendor-agents'

const home = homedir()

const PLATFORM_TO_VERCEL_AGENT: Record<ProjectUsagePlatform, AgentType | null> = {
    claudeCode: 'claude-code',
    codex: 'codex',
    gemini: 'gemini-cli',
    opencode: 'opencode',
    amp: 'amp',
    droid: 'droid',
    codebuff: null,
    hermes: 'hermes-agent',
    pi: 'pi',
    goose: 'goose',
    openclaw: 'openclaw',
    kilo: 'kilo',
    copilot: 'github-copilot',
    kimi: 'kimi-code-cli',
    qwen: 'qwen-code',
}

const VERCEL_AGENT_TO_PLATFORM = new Map(
    Object.entries(PLATFORM_TO_VERCEL_AGENT)
        .filter(([, v]) => v !== null)
        .map(([platform, agentType]) => [agentType!, platform as ProjectUsagePlatform]),
)

function detectCodebuff(): boolean {
    const paths = [
        join(home, '.config', 'manicode', 'projects'),
        join(home, '.config', 'manicode-dev', 'projects'),
        join(home, '.config', 'manicode-staging', 'projects'),
    ]
    return paths.some(p => existsSync(p))
}

export async function detectActivePlatforms(): Promise<ProjectUsagePlatform[]> {
    const installed = await detectInstalledAgents()
    const active: ProjectUsagePlatform[] = []

    for (const agentType of installed) {
        const platform = VERCEL_AGENT_TO_PLATFORM.get(agentType)
        if (platform) {
            active.push(platform)
        }
    }

    if (detectCodebuff()) {
        active.push('codebuff')
    }

    return active
}
