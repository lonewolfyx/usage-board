import type { IConfig, IRuntimeConfig } from '#shared/types/config'
import { getClaudeCodePaths, getCodexPath, getGeminiPath, getOpenCodePath } from '#shared/utils/paths'

export function resolveConfig(rc: IRuntimeConfig): IConfig {
    const claudeCodePaths = getClaudeCodePaths()
    return {
        version: rc.appVersion,
        home: rc.home,
        claudeCodePath: claudeCodePaths[0]!,
        claudeCodePaths,
        openCodePath: getOpenCodePath(),
        codexPath: getCodexPath(),
        geminiPath: getGeminiPath(),
    }
}
