import type { TokensConsumptionResult } from '#shared/types/usage-dashboard'
import type { IConfig } from '~~/src/types'
import { loadClaudeCodeUsage, loadCodexUsage, loadGeminiUsage } from '~~/src/platform'
import { version } from '../package.json' with { type: 'json' }

export async function resolveTokensConsumption(config: IConfig): Promise<TokensConsumptionResult> {
    const claudeCode = await loadClaudeCodeUsage(config)

    const codex = await loadCodexUsage(config)

    const gemini = await loadGeminiUsage(config)

    return {
        version,
        claudeCode,
        codex,
        gemini,
    }
}
