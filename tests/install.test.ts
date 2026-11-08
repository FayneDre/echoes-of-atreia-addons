import { execFile } from 'node:child_process'
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { build } from '../tools/build.ts'
import { readXorTable, sha256 } from '../tools/clientFiles.ts'
import {
  GAME_DLL,
  GAME_DLL_OUTDATED_SHA256,
  GAME_DLL_PATCHED_SHA256,
  GAME_DLL_STOCK_SHA256,
  PATCH_FILL,
  patchEdits
} from '../tools/gamePatch.ts'
import { BACKUP_DIR, install, uninstall, verifyClient } from '../tools/install.ts'
import { readPak } from '../tools/pak.ts'
import { generateSigningKey } from '../tools/signing.ts'
import { copyOfClient, hasClient } from './clientFixture.ts'

const repoDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

async function repoWithAddon(): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), 'echoes-addons-repo-'))
  await mkdir(join(repo, 'addons', 'Hello'), { recursive: true })
  await writeFile(join(repo, 'addons', 'Hello', 'Hello.toc'), '## Title: Hello\nHello.xml\nHello.lua\n')
  await writeFile(join(repo, 'addons', 'Hello', 'Hello.xml'), '<?xml version="1.0" encoding="UTF-8" ?>\n<Screen></Screen>\n')
  await writeFile(join(repo, 'package.json'), '{ "version": "1.2.3-beta.4" }\n')
  await writeFile(join(repo, 'addons', 'Hello', 'Hello.lua'), 'HELLO_VERSION = "@VERSION@";\nfunction Hello_OnLoad() end\n')
  return repo
}

/** game.dll as the builds before the trusted names left it: the page loading alone. */
async function outdatedGameDll(client: string): Promise<Buffer> {
  const dll = Buffer.from(await readFile(join(client, GAME_DLL)))
  dll.fill(0xcc, PATCH_FILL.start, PATCH_FILL.end)
  patchEdits()[0]!.bytes.copy(dll, PATCH_FILL.start)
  return dll
}

/** A client an earlier build installed: game.dll patched the old way, its stock copy in the backup, and an addon this build no longer carries. */
async function clientInstalledByAnEarlierRelease(client: string): Promise<void> {
  await mkdir(join(client, BACKUP_DIR, 'bin64'), { recursive: true })
  await copyFile(join(client, GAME_DLL), join(client, BACKUP_DIR, GAME_DLL))
  await writeFile(join(client, GAME_DLL), await outdatedGameDll(client))
  await mkdir(join(client, 'Plugin', 'Gone'), { recursive: true })
  await writeFile(join(client, 'Plugin', 'Gone', 'Gone.pak'), 'an addon of an earlier release')
  await writeFile(join(client, BACKUP_DIR, 'backup.json'), JSON.stringify({ replaced: [GAME_DLL], added: ['Plugin/Gone/Gone.pak'] }))
}

/** What a tester unzips: the scripts, as package.ts writes them, beside the built `client/`. */
async function releaseFolder(builtDir: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'echoes-addons-release-'))
  await cp(builtDir, join(dir, 'client'), { recursive: true })
  for (const script of ['install.ps1', 'uninstall.ps1']) {
    const text = await readFile(join(repoDir, 'packaging', script), 'utf8')
    await writeFile(join(dir, script), String.fromCharCode(0xfeff) + text.replace(/\r?\n/g, '\r\n'), 'utf8')
  }
  return dir
}

async function powershell(script: string, client: string): Promise<string> {
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Client', client, '-NoPause']
  const { stdout } = await promisify(execFile)('powershell.exe', args)
  return stdout
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
    expect(entries[2]!.data.toString('utf8')).toContain('HELLO_VERSION = "1.2.3-beta.4";')
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
    expect(sha256(await readFile(join(client, GAME_DLL)))).toBe(GAME_DLL_PATCHED_SHA256)

    // a second install, a rebuild with the same key say, keeps the stock files in the backup
    await install(join(repo, 'dist', 'client'), client)
    await uninstall(client)
    expect(await readFile(join(client, 'Pub.key'))).toEqual(stockKey)
    expect(await readFile(join(client, 'bin32', 'bin32.pak.sig'))).toEqual(stockSignature)
    expect(sha256(await readFile(join(client, GAME_DLL)))).toBe(GAME_DLL_STOCK_SHA256)
    expect(existsSync(join(client, 'Plugin', 'Hello'))).toBe(false)
    expect(existsSync(join(client, BACKUP_DIR))).toBe(false)
    expect(await verifyClient(client)).toHaveLength(3)
  })

  it('patches again a game.dll an earlier release patched, removes the addon it no longer carries, and uninstalls to the stock file', async () => {
    const client = await copyOfClient()
    const repo = await repoWithAddon()
    await build(repo, client, generateSigningKey())
    await clientInstalledByAnEarlierRelease(client)
    expect(GAME_DLL_OUTDATED_SHA256).toContain(sha256(await readFile(join(client, GAME_DLL))))

    await install(join(repo, 'dist', 'client'), client)
    expect(sha256(await readFile(join(client, GAME_DLL)))).toBe(GAME_DLL_PATCHED_SHA256)
    expect(existsSync(join(client, 'Plugin', 'Gone'))).toBe(false)
    const backup = JSON.parse(await readFile(join(client, BACKUP_DIR, 'backup.json'), 'utf8')) as { replaced: string[]; added: string[] }
    expect(backup.added).not.toContain('Plugin/Gone/Gone.pak')
    expect(backup.replaced.filter((path) => path === GAME_DLL)).toHaveLength(1)

    await uninstall(client)
    expect(sha256(await readFile(join(client, GAME_DLL)))).toBe(GAME_DLL_STOCK_SHA256)
  })

  it('refuses a patched game.dll whose stock copy the backup does not hold', async () => {
    const client = await copyOfClient()
    const stockKey = await readFile(join(client, 'Pub.key'))
    const repo = await repoWithAddon()
    await build(repo, client, generateSigningKey())
    await writeFile(join(client, GAME_DLL), await outdatedGameDll(client))
    await expect(install(join(repo, 'dist', 'client'), client)).rejects.toThrow(/no stock copy/)
    expect(await readFile(join(client, 'Pub.key'))).toEqual(stockKey)
  })

  it.skipIf(process.platform !== 'win32')('install.ps1 does what the tools do, from a stock client and from an earlier release', async () => {
    const repo = await repoWithAddon()
    await build(repo, await copyOfClient(), generateSigningKey())
    const release = await releaseFolder(join(repo, 'dist', 'client'))

    const stock = await copyOfClient()
    expect(await powershell(join(release, 'install.ps1'), stock)).toMatch(/Installe : \d+ fichier/)
    expect(sha256(await readFile(join(stock, GAME_DLL)))).toBe(GAME_DLL_PATCHED_SHA256)
    expect(await verifyClient(stock)).toContain('Plugin/Hello/Hello.pak')
    // installing again over its own install leaves it as it is
    await powershell(join(release, 'install.ps1'), stock)
    expect(sha256(await readFile(join(stock, GAME_DLL)))).toBe(GAME_DLL_PATCHED_SHA256)
    await powershell(join(release, 'uninstall.ps1'), stock)
    expect(sha256(await readFile(join(stock, GAME_DLL)))).toBe(GAME_DLL_STOCK_SHA256)
    expect(existsSync(join(stock, BACKUP_DIR))).toBe(false)

    const earlier = await copyOfClient()
    await clientInstalledByAnEarlierRelease(earlier)
    await powershell(join(release, 'install.ps1'), earlier)
    expect(sha256(await readFile(join(earlier, GAME_DLL)))).toBe(GAME_DLL_PATCHED_SHA256)
    expect(existsSync(join(earlier, 'Plugin', 'Gone'))).toBe(false)

    const unknown = await copyOfClient()
    await writeFile(join(unknown, GAME_DLL), 'changed')
    await expect(powershell(join(release, 'install.ps1'), unknown)).rejects.toThrow()
    await rm(release, { recursive: true, force: true })
  }, 120_000)

  it('refuses a game.dll that is neither the stock file nor a patched one, before touching anything', async () => {
    const client = await copyOfClient()
    const stockKey = await readFile(join(client, 'Pub.key'))
    const repo = await repoWithAddon()
    await build(repo, client, generateSigningKey())
    await writeFile(join(client, GAME_DLL), 'changed')
    await expect(install(join(repo, 'dist', 'client'), client)).rejects.toThrow(/neither the stock 4.8 file nor a patched one/)
    expect(await readFile(join(client, 'Pub.key'))).toEqual(stockKey)
  })

  it('refuses a backup it cannot read rather than taking the client for a fresh one', async () => {
    const client = await copyOfClient()
    const stockKey = await readFile(join(client, 'Pub.key'))
    const repo = await repoWithAddon()
    await build(repo, client, generateSigningKey())
    await mkdir(join(client, BACKUP_DIR), { recursive: true })
    await writeFile(join(client, BACKUP_DIR, 'backup.json'), '{ "replaced": [')
    await expect(install(join(repo, 'dist', 'client'), client)).rejects.toThrow(/cannot be read/)
    await expect(uninstall(client)).rejects.toThrow(/cannot be read/)
    expect(await readFile(join(client, 'Pub.key'))).toEqual(stockKey)
  })

  it('refuses a client whose signed archives are not the stock ones', async () => {
    const client = await copyOfClient()
    const repo = await repoWithAddon()
    await writeFile(join(client, 'bin32', 'bin32.pak'), 'changed')
    await expect(build(repo, client, generateSigningKey())).rejects.toThrow(/not the stock 4.8 file/)
  })
})
