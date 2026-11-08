import { readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { TRUSTED_ADDONS } from '../tools/gamePatch.ts'

const repoDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

describe('the addons of this repository', () => {
  it('are all trusted by the patched client', async () => {
    // an addon left out is not loaded at all once its .toc asks for `## Require`: docs/game-dll.md
    const entries = await readdir(join(repoDir, 'addons'), { withFileTypes: true })
    const folders = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    expect([...folders].sort()).toEqual([...TRUSTED_ADDONS].sort())
  })
})
