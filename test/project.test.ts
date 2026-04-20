import { homedir } from 'node:os'

import { loadProjectsUsage } from '#shared/platform/project'
import { resolveConfig } from '#shared/utils/configs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { version } from '../package.json' with { type: 'josn' }

const config = resolveConfig({
    appVersion: version,
    home: homedir(),
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
