import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { isDirectorySync } from 'path-type'

/**
 * Default OpenCode data directory path (~/.local/share/opencode)
 */
const DEFAULT_OPENCODE_PATH = '.local/share/opencode'

const CODEX_HOME_ENV = 'CODEX_HOME'

const OPENCODE_CONFIG_DIR_ENV = 'OPENCODE_DATA_DIR'

const USER_HOME_DIR = homedir()

const DEFAULT_CODEX_DIR = join(USER_HOME_DIR, '.codex')

export const getOpenCodePath = (): string | null => {
    // Check environment variable first
    const envPath = process.env[OPENCODE_CONFIG_DIR_ENV]
    if (envPath != null && envPath.trim() !== '') {
        const normalizedPath = resolve(envPath)
        if (isDirectorySync(normalizedPath)) {
            return normalizedPath
        }
    }

    // Use default path
    const defaultPath = join(USER_HOME_DIR, DEFAULT_OPENCODE_PATH)
    if (isDirectorySync(defaultPath)) {
        return defaultPath
    }

    return null
}

export const getCodexPath = (): string => {
    const codexHomeEnv = process.env[CODEX_HOME_ENV]?.trim()
    return codexHomeEnv != null && codexHomeEnv !== '' ? resolve(codexHomeEnv) : DEFAULT_CODEX_DIR
}
