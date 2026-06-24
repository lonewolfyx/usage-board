import type { IConfig, IRuntimeConfig } from '#shared/types/config'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import {
    getAmpPaths,
    getClaudeCodePaths,
    getCodebuffPaths,
    getCodexPath,
    getCopilotPaths,
    getDroidPaths,
    getGoosePaths,
    getHermesPaths,
    getKiloPaths,
    getKimiPaths,
    getOpenClawPaths,
    getOpenCodePaths,
    getPiPaths,
    getQwenPaths,
} from '#shared/utils/paths'
import { detectActivePlatforms } from '#shared/utils/platform-detect'

export async function resolveConfig(rc: IRuntimeConfig): Promise<IConfig> {
    const claudeCodePaths = getClaudeCodePaths()
    return {
        version: rc.appVersion,
        home: rc.home,
        ampPaths: getAmpPaths(),
        claudeCodePath: claudeCodePaths[0]!,
        claudeCodePaths,
        codebuffPaths: getCodebuffPaths(),
        copilotPaths: getCopilotPaths(),
        codexPath: getCodexPath(),
        droidPaths: getDroidPaths(),
        geminiPath: resolve(homedir(), '.gemini'),
        goosePaths: getGoosePaths(),
        hermesPaths: getHermesPaths(),
        kiloPaths: getKiloPaths(),
        kimiPaths: getKimiPaths(),
        openClawPaths: getOpenClawPaths(),
        openCodePaths: getOpenCodePaths(),
        piPaths: getPiPaths(),
        qwenPaths: getQwenPaths(),
        activePlatforms: await detectActivePlatforms(),
    }
}
