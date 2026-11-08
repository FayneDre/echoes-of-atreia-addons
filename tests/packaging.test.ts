import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { STOCK_SIGNED_ARCHIVES } from '../tools/clientFiles.ts'
import {
  GAME_DLL,
  GAME_DLL_OUTDATED_SHA256,
  GAME_DLL_PATCHED_SHA256,
  GAME_DLL_STOCK_SHA256,
  PATCH_FILL,
  patchEdits
} from '../tools/gamePatch.ts'

/**
 * The testers install with packaging/install.ps1, which cannot import the TypeScript tools: it carries the same fingerprints and the same patch
 * written again. A change on one side only would ship an install that refuses every client or patches the wrong bytes; tests/install.test.ts
 * also runs the script itself when the client is there.
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

/** The lines of a multi-line `$variable = @( ... )`. */
function listLines(text: string, variable: string): string[] {
  const match = new RegExp(`^\\$${variable} = @\\(\\r?\\n([\\s\\S]*?)^\\)`, 'm').exec(text)
  if (!match) {
    throw new Error(`install.ps1 no longer sets the list $${variable}`)
  }
  return match[1]!.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

describe('install.ps1', () => {
  it('knows the same stock archives as the tools', async () => {
    const text = await script()
    const block = /\$stock = @\{([\s\S]*?)\}/.exec(text)?.[1] ?? ''
    const inScript = Object.fromEntries([...block.matchAll(/'([^']+)'\s*=\s*'([0-9a-f]{64})'/g)].map((m) => [m[1]!, m[2]!]))
    expect(inScript).toEqual(Object.fromEntries(STOCK_SIGNED_ARCHIVES.map((archive) => [archive.path, archive.sha256])))
  })

  it('recognises game.dll as the tools do', async () => {
    const text = await script()
    expect(assigned(text, 'gameDll')).toBe(GAME_DLL)
    expect(assigned(text, 'gameDllStock')).toBe(GAME_DLL_STOCK_SHA256)
    expect(assigned(text, 'gameDllPatched')).toBe(GAME_DLL_PATCHED_SHA256)
    expect(listLines(text, 'gameDllOutdated').map((line) => line.replace(/^'(.*)',?$/, '$1'))).toEqual(GAME_DLL_OUTDATED_SHA256)
  })

  it('patches game.dll as the tools do', async () => {
    const text = await script()
    expect(Number(assigned(text, 'patchFillStart'))).toBe(PATCH_FILL.start)
    expect(Number(assigned(text, 'patchFillEnd'))).toBe(PATCH_FILL.end)
    const lines = listLines(text, 'patchEdits')
    const edits = lines.map((line, index) => {
      const match = /^@\((0x[0-9a-f]+), '([0-9a-f]+)'\)(,?)$/.exec(line)
      if (!match) {
        throw new Error(`not an edit: ${line}`)
      }
      // a comma after each sub-array but the last: without them PowerShell flattens the edits into one list
      expect(match[3], line).toBe(index < lines.length - 1 ? ',' : '')
      return { offset: Number(match[1]), bytes: match[2] }
    })
    expect(edits).toEqual(patchEdits().map((edit) => ({ offset: edit.offset, bytes: edit.bytes.toString('hex') })))
  })
})
