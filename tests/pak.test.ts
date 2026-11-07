import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readXorTable } from '../tools/clientFiles.ts'
import { readPak, writePak } from '../tools/pak.ts'
import { hasClient, realClient } from './clientFixture.ts'

describe('archives', () => {
  it('reads back what it writes, small and large files alike', () => {
    const table = randomBytes(1056)
    const entries = [
      { name: 'A.toc', data: Buffer.from('## Title: A\nA.lua\n') },
      { name: 'A.lua', data: randomBytes(5000) },
      { name: 'empty.txt', data: Buffer.alloc(0) }
    ]
    expect(readPak(writePak(entries, table), table)).toEqual(entries)
  })

  it('scrambles the head of each file, so a plain zip reader cannot read it', () => {
    const table = Buffer.alloc(1056, 0x5a)
    const pak = writePak([{ name: 'A.lua', data: Buffer.from('x'.repeat(400)) }], table)
    expect(pak.subarray(0, 4).toString('hex')).toBe('afb4fcfb')
    expect(() => readPak(pak, Buffer.alloc(1056))).toThrow()
  })

  it.skipIf(!hasClient)('reads the stock plugin with the table taken from the client', async () => {
    const table = await readXorTable(realClient)
    const entries = readPak(await readFile(join(realClient, 'Plugin/RelicCalc/RelicCalc.pak')), table)
    expect(entries.map((entry) => entry.name)).toEqual(['RelicCalc.lua', 'RelicCalc.toc', 'RelicCalc.xml'])
    expect(entries[1]!.data.toString('utf8')).toContain('## Title: RelicCalc')
    // UTF-16 with its byte order mark: what build.ts writes for an XML
    expect(entries[2]!.data.subarray(0, 2).toString('hex')).toBe('fffe')
  })

  it.skipIf(!hasClient)('writes the stock plugin again so that it reads back the same', async () => {
    const table = await readXorTable(realClient)
    const entries = readPak(await readFile(join(realClient, 'Plugin/RelicCalc/RelicCalc.pak')), table)
    expect(readPak(writePak(entries, table), table)).toEqual(entries)
  })
})
