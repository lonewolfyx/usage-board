import type { ProjectUsagePlatform } from '#shared/types/ai'
import type { Buffer } from 'node:buffer'
import type { UsageSourceFile } from './fact'
import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { glob } from 'glob'

export async function discoverSourceFiles(platform: ProjectUsagePlatform, patterns: string[]) {
    const paths = (await Promise.all(patterns.map(pattern => glob(pattern, {
        absolute: true,
        nodir: true,
    })))).flat()
    const uniquePaths = Array.from(new Set(paths)).sort((left, right) => left.localeCompare(right))

    return uniquePaths.flatMap((path): UsageSourceFile[] => {
        try {
            const stat = statSync(path)
            return [{
                cacheSignature: createHash('sha1').update(`${stat.size}:${stat.mtimeMs}`).digest('hex'),
                mtimeMs: stat.mtimeMs,
                path,
                platform,
                size: stat.size,
            }]
        }
        catch {
            return []
        }
    })
}

export function readJsonFile<T>(filePath: string): T | null {
    try {
        const parsed = JSON.parse(readFileSync(filePath, 'utf8'))
        return parsed as T
    }
    catch {
        return null
    }
}

export function readJsonlObjects<T>(filePath: string, marker?: Buffer) {
    const file = readFileSync(filePath)
    const records: T[] = []
    let lineStart = 0

    for (let index = 0; index <= file.length; index += 1) {
        if (index !== file.length && file[index] !== 10) {
            continue
        }

        const line = file.subarray(lineStart, index)
        lineStart = index + 1

        if (line.length === 0 || (marker && !line.includes(marker))) {
            continue
        }

        try {
            records.push(JSON.parse(line.toString('utf8')) as T)
        }
        catch {
        }
    }

    return records
}
