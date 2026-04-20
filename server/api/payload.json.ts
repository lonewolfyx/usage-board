import { loadClaudeCodeUsage, loadCodexUsage, loadGeminiUsage } from '#shared/platform'

export default defineEventHandler(async () => {
    const runtimeConfig = useRuntimeConfig()
    const config = resolveConfig(runtimeConfig.public)

    const claudeCode = await loadClaudeCodeUsage(config)
    const codex = await loadCodexUsage(config)
    const gemini = await loadGeminiUsage(config)

    return {
        ...config,
        claudeCode,
        codex,
        gemini,
    }
})
