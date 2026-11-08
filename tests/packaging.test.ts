import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { STOCK_SIGNED_ARCHIVES } from '../tools/clientFiles.ts'
import { BODY, FUNCTION_END, FUNCTION_START, GAME_DLL, GAME_DLL_PATCHED_SHA256, GAME_DLL_STOCK_SHA256 } from '../tools/gamePatch.ts'

/**
 * The testers install with packaging/install.ps1, which cannot import the TypeScript tools: it carries the same fingerprints and the same patch
 * written again. A change on one side only would ship an install that refuses every client or patches the wrong bytes, which no other test sees.
 */

const repoDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

async function script(): Promise<string> {
  return readFile(join(repoDir, 'packaging', 'install.ps1'), 'utf8')
}

function assigned(text: string, variable: string): string {
  const match = new RegExp(`^\\$${variable} = (.+)$`, 'm').exec(text)
  if (!match) {
    throw new Error(`install.ps1 no longer sets $${variable}`)
  }
  return match[1]!.trim().replace(/^'(.*)'$/, '$1')
}

describe('install.ps1', () => {
  it('knows the same stock archives as the tools', async () => {
    const text = await script()
    const block = /\$stock = @\{([\s\S]*?)\}/.exec(text)?.[1] ?? ''
    const inScript = Object.fromEntries([...block.matchAll(/'([^']+)'\s*=\s*'([0-9a-f]{64})'/g)].map((m) => [m[1]!, m[2]!]))
    expect(inScript).toEqual(Object.fromEntries(STOCK_SIGNED_ARCHIVES.map((archive) => [archive.path, archive.sha256])))
  })

  it('patches game.dll as the tools do', async () => {
    const text = await script()
    expect(assigned(text, 'gameDll')).toBe(GAME_DLL)
    expect(assigned(text, 'gameDllStock')).toBe(GAME_DLL_STOCK_SHA256)
    expect(assigned(text, 'gameDllPatched')).toBe(GAME_DLL_PATCHED_SHA256)
    expect(Number(assigned(text, 'patchStart'))).toBe(FUNCTION_START)
    expect(Number(assigned(text, 'patchEnd'))).toBe(FUNCTION_END)
    expect(assigned(text, 'patchBody')).toBe(BODY.toString('hex'))
  })
})
