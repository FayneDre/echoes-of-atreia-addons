import { copyFile, mkdir, open, readdir, readFile, rm, rmdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { checkStockArchives, PUBLIC_KEY, STOCK_SIGNED_ARCHIVES } from './clientFiles.ts'
import { GAME_DLL, gameDllState, patchGameDll } from './gamePatch.ts'
import { verifySignatureFile } from './signing.ts'

/**
 * Puts a built tree (`dist/client`) over a client, and takes it off again leaving the client as it was.
 * Every client file replaced is kept first in `EchoesAddonsBackup/`, once: installing again over an install keeps the stock files, not ours.
 * The backup's `backup.json` says what was replaced and what was added, which is all an uninstall needs.
 * The client's `game.dll` is patched on the way (see `gamePatch.ts`), its stock file kept like the others.
 */

export const BACKUP_DIR = 'EchoesAddonsBackup'
const BACKUP_MANIFEST = 'backup.json'

interface Backup {
  replaced: string[]
  added: string[]
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function listFiles(dir: string, prefix = ''): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      files.push(...(await listFiles(join(dir, entry.name), path)))
    } else {
      files.push(path)
    }
  }
  return files
}

/**
 * What an earlier install kept. Only an absent manifest means none: one that cannot be read is said, as taking it for a fresh client would keep
 * our own files as the stock ones and lose the real ones at the uninstall.
 */
async function readBackup(clientDir: string): Promise<Backup> {
  const path = join(clientDir, BACKUP_DIR, BACKUP_MANIFEST)
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { replaced: [], added: [] }
    }
    throw error
  }
  try {
    const backup = JSON.parse(text) as Partial<Backup>
    if (!Array.isArray(backup.replaced) || !Array.isArray(backup.added)) {
      throw new Error('a list is missing')
    }
    return { replaced: backup.replaced, added: backup.added }
  } catch (error) {
    throw new Error(`${BACKUP_DIR}/${BACKUP_MANIFEST} cannot be read (${(error as Error).message}): nothing is changed, the stock files it lists would be lost`)
  }
}

/**
 * The running game holds `game.dll` open: refused before anything is written, rather than stopping halfway with the system's lock error. Opening
 * the file for writing changes nothing in it.
 */
async function checkGameClosed(clientDir: string): Promise<void> {
  try {
    const handle = await open(join(clientDir, GAME_DLL), 'r+')
    await handle.close()
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') {
      throw new Error('the game is running: close it first')
    }
    throw error
  }
}

function backupText(backup: Backup): string {
  return `${JSON.stringify(backup, null, 2)}\n`
}

export async function install(builtDir: string, clientDir: string): Promise<string[]> {
  await checkStockArchives(clientDir)
  const backup = await readBackup(clientDir)
  await checkGameClosed(clientDir)
  if ((await gameDllState(clientDir)) === 'patched' && !backup.replaced.includes(GAME_DLL)) {
    throw new Error(`${GAME_DLL} is patched already but the backup has no stock copy of it: an uninstall could not put it back`)
  }
  const files = await listFiles(builtDir)
  for (const path of files) {
    const target = join(clientDir, path)
    if (!backup.replaced.includes(path) && !backup.added.includes(path)) {
      if (await exists(target)) {
        await mkdir(dirname(join(clientDir, BACKUP_DIR, path)), { recursive: true })
        await copyFile(target, join(clientDir, BACKUP_DIR, path))
        backup.replaced.push(path)
      } else {
        backup.added.push(path)
      }
      // written after each file, so an install cut short still knows what to undo
      await mkdir(join(clientDir, BACKUP_DIR), { recursive: true })
      await writeFile(join(clientDir, BACKUP_DIR, BACKUP_MANIFEST), backupText(backup))
    }
    await mkdir(dirname(target), { recursive: true })
    await copyFile(join(builtDir, path), target)
  }
  const keptAlready = backup.replaced.includes(GAME_DLL)
  await patchGameDll(clientDir, keptAlready ? null : join(clientDir, BACKUP_DIR, GAME_DLL))
  if (!keptAlready) {
    backup.replaced.push(GAME_DLL)
    await writeFile(join(clientDir, BACKUP_DIR, BACKUP_MANIFEST), backupText(backup))
  }
  await verifyClient(clientDir)
  return files
}

export async function uninstall(clientDir: string): Promise<void> {
  const backup = await readBackup(clientDir)
  await checkGameClosed(clientDir)
  for (const path of backup.replaced) {
    await copyFile(join(clientDir, BACKUP_DIR, path), join(clientDir, path))
  }
  for (const path of backup.added) {
    await rm(join(clientDir, path), { force: true })
    // the addon's own folder goes with its files; a folder still holding something is left
    await rmdir(dirname(join(clientDir, path))).catch(() => undefined)
  }
  await rm(join(clientDir, BACKUP_DIR), { recursive: true, force: true })
}

/** Every signed archive of the client against the `Pub.key` in place: what the client checks, checked before it does. */
export async function verifyClient(clientDir: string): Promise<string[]> {
  const publicKey = await readFile(join(clientDir, PUBLIC_KEY), 'latin1')
  const archives = STOCK_SIGNED_ARCHIVES.map((archive) => archive.path)
  const pluginDir = join(clientDir, 'Plugin')
  for (const entry of await readdir(pluginDir, { withFileTypes: true })) {
    const path = `Plugin/${entry.name}/${entry.name}.pak`
    if (entry.isDirectory() && !archives.includes(path) && (await exists(join(clientDir, path)))) {
      archives.push(path)
    }
  }
  const refused = []
  for (const path of archives) {
    const archive = await readFile(join(clientDir, path))
    const signature = await readFile(join(clientDir, `${path}.sig`), 'latin1').catch(() => '')
    if (!signature || !verifySignatureFile(archive, signature, publicKey)) {
      refused.push(path)
    }
  }
  if (refused.length > 0) {
    throw new Error(`the client would refuse: ${refused.join(', ')}`)
  }
  return archives
}
