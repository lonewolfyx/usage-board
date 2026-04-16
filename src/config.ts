import type { IConfig, IOptions } from '~~/src/types'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getClaudeCodePaths, getCodexPath, getGeminiPath, getOpenCodePath } from '~~/src/paths'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export function resolveConfig(options: IOptions): IConfig {
    const claudeCodePaths = getClaudeCodePaths()

    return {
        ...options,
        cwd: resolve(__dirname, '../'),
        home: homedir(),
        claudeCodePath: claudeCodePaths[0]!,
        claudeCodePaths,
        openCodePath: getOpenCodePath(),
        codexPath: getCodexPath(),
        geminiPath: getGeminiPath(),
    }
}
