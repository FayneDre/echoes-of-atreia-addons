import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { build } from '../tools/build.ts'
import { readXorTable } from '../tools/clientFiles.ts'
import { BACKUP_DIR, install, uninstall, verifyClient } from '../tools/install.ts'
import { readPak } from '../tools/pak.ts'
import { generateSigningKey } from '../tools/signing.ts'
import { copyOfClient, hasClient } from './clientFixture.ts'

async function repoWithAddon(): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), 'echoes-addons-repo-'))
  await mkdir(join(repo, 'addons', 'Hello'), { recursive: true })
  await writeFile(join(repo, 'addons', 'Hello', 'Hello.toc'), '## Title: Hello\nHello.xml\nHello.lua\n')
  await writeFile(join(repo, 'addons', 'Hello', 'Hello.xml'), '<?xml version="1.0" encoding="UTF-8" ?>\n<Screen></Screen>\n')
  await writeFile(join(repo, 'addons', 'Hello', 'Hello.lua'), 'function Hello_OnLoad() end\n')
  return repo
}

describe.skipIf(!hasClient)('build, install and uninstall', () => {
  it('builds an addon the client format reads back, its XML in UTF-16', async () => {
    const client = await copyOfClient()
    const repo = await repoWithAddon()
    await build(repo, client, generateSigningKey())
    const pak = await readFile(join(repo, 'dist', 'client', 'Plugin', 'Hello', 'Hello.pak'))
    const entries = readPak(pak, await readXorTable(client))
    expect(entries.map((entry) => entry.name)).toEqual(['Hello.toc', 'Hello.xml', 'Hello.lua'])
    const xml = entries[1]!.data
    expect(xml.subarray(0, 2).toString('hex')).toBe('fffe')
    expect(xml.subarray(2).toString('utf16le')).toMatch(/^<\?xml version="1.0" encoding="UTF-16" \?>/)
  })

  it('installs so that every signed archive checks, and uninstalls to the stock files byte for byte', async () => {
    const client = await copyOfClient()
    const stockKey = await readFile(join(client, 'Pub.key'))
    const stockSignature = await readFile(join(client, 'bin32', 'bin32.pak.sig'))
    const repo = await repoWithAddon()
    await build(repo, client, generateSigningKey())

    await install(join(repo, 'dist', 'client'), client)
    expect(await verifyClient(client)).toContain('Plugin/Hello/Hello.pak')
    expect(await readFile(join(client, 'Pub.key'))).not.toEqual(stockKey)

    // a second install, a rebuild with the same key say, keeps the stock files in the backup
    await install(join(repo, 'dist', 'client'), client)
    await uninstall(client)
    expect(await readFile(join(client, 'Pub.key'))).toEqual(stockKey)
    expect(await readFile(join(client, 'bin32', 'bin32.pak.sig'))).toEqual(stockSignature)
    expect(existsSync(join(client, 'Plugin', 'Hello'))).toBe(false)
    expect(existsSync(join(client, BACKUP_DIR))).toBe(false)
    expect(await verifyClient(client)).toHaveLength(3)
  })

  it('refuses a client whose signed archives are not the stock ones', async () => {
    const client = await copyOfClient()
    const repo = await repoWithAddon()
    await writeFile(join(client, 'bin32', 'bin32.pak'), 'changed')
    await expect(build(repo, client, generateSigningKey())).rejects.toThrow(/not the stock 4.8 file/)
  })
})
