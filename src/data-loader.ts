import type { TokensConsumptionResult } from '#shared/types/usage-dashboard'
import type { IConfig } from '~~/src/types'
import { loadClaudeCodeUsage, loadCodexUsage, loadGeminiUsage } from '~~/src/platform'

export const resolveTokensConsumption = async (config: IConfig): Promise<TokensConsumptionResult> => {
    const claudeCode = await loadClaudeCodeUsage(config)

    const codex = await loadCodexUsage(config)

    const gemini = await loadGeminiUsage(config)

    return {
        claudeCode,
        codex,
        gemini,
    }
}
