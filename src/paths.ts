import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { isDirectorySync } from 'path-type'

/**
 * Default OpenCode data directory path (~/.local/share/opencode)
 */
const DEFAULT_OPENCODE_PATH = '.local/share/opencode'

const OPENCODE_CONFIG_DIR_ENV = 'OPENCODE_DATA_DIR'

const USER_HOME_DIR = homedir()

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
