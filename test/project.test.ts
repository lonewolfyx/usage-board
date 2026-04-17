import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadProjectsUsage } from '~~/src/platform'
import { resolveConfig } from '../src/config'

const config = resolveConfig({
    'host': '127.0.0.1',
    'port': 8888,
    'open': false,
    '--': '',
})

describe('test project usage', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('should ', async () => {
        const data = await loadProjectsUsage(config)
        await expect(JSON.stringify(data)).toMatchFileSnapshot('./project.json')
    })
})
