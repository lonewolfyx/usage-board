import type { IConfig, IOptions } from '~~/src/types'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getClaudeCodePaths, getCodexPath, getOpenCodePath } from '~~/src/paths'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export const resolveConfig = (options: IOptions): IConfig => {
    const claudeCodePaths = getClaudeCodePaths()

    return {
        host: options.host,
        port: options.port,
        open: options.open,
        cwd: resolve(__dirname, '../'),
        home: homedir(),
        claudeCodePath: claudeCodePaths[0]!,
        claudeCodePaths,
        openCodePath: getOpenCodePath(),
        codexPath: getCodexPath(),
    }
}
