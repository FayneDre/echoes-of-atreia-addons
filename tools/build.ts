import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { checkStockArchives, PUBLIC_KEY, readXorTable, sha256, STOCK_SIGNED_ARCHIVES } from './clientFiles.ts'
import { writePak, type PakEntry } from './pak.ts'
import { publicKeyFile, signatureFile } from './signing.ts'

/**
 * Builds every addon of `addons/` into `dist/client/`, a tree laid out as the client folder is: what an install copies over the client.
 * - `Plugin/<Name>/<Name>.pak` and its `.sig`, for each addon;
 * - `Pub.key`, our key, and the `.sig` of each stock signed archive signed again with it (their content unchanged).
 * And `dist/manifest.json`, each file with its fingerprint, for the launcher.
 */

export interface BuiltFile {
  path: string
  sha256: string
}

/**
 * The files an addon's `.toc` names, in its order, after the `.toc` itself. Lines starting with `##` are its headers.
 */
export function tocFiles(toc: string): string[] {
  return toc
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
}

/** The client reads an addon's XML as UTF-16 with its byte order mark, as the stock plugin is written; the repository keeps UTF-8. */
export function clientText(name: string, text: string): Buffer {
  if (name.toLowerCase().endsWith('.xml')) {
    const declared = text.replace(/^\uFEFF?<\?xml[^>]*\?>/, '<?xml version="1.0" encoding="UTF-16" ?>')
    return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(declared, 'utf16le')])
  }
  return Buffer.from(text, 'utf8')
}

export async function addonEntries(addonDir: string, name: string): Promise<PakEntry[]> {
  const tocName = `${name}.toc`
  const toc = await readFile(join(addonDir, tocName), 'utf8')
  const entries: PakEntry[] = [{ name: tocName, data: clientText(tocName, toc) }]
  for (const file of tocFiles(toc)) {
    entries.push({ name: file, data: clientText(file, await readFile(join(addonDir, file), 'utf8')) })
  }
  return entries
}

export async function build(repoDir: string, clientDir: string, privateKeyPem: string): Promise<BuiltFile[]> {
  await checkStockArchives(clientDir)
  const table = await readXorTable(clientDir)
  const out = join(repoDir, 'dist', 'client')
  await rm(join(repoDir, 'dist'), { recursive: true, force: true })
  const files = new Map<string, Buffer>()

  const addonsDir = join(repoDir, 'addons')
  for (const entry of await readdir(addonsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue
    }
    const name = entry.name
    const pak = writePak(await addonEntries(join(addonsDir, name), name), table)
    files.set(`Plugin/${name}/${name}.pak`, pak)
    files.set(`Plugin/${name}/${name}.pak.sig`, Buffer.from(signatureFile(pak, privateKeyPem), 'latin1'))
  }
  files.set(PUBLIC_KEY, Buffer.from(publicKeyFile(privateKeyPem), 'latin1'))
  for (const archive of STOCK_SIGNED_ARCHIVES) {
    const data = await readFile(join(clientDir, archive.path))
    files.set(`${archive.path}.sig`, Buffer.from(signatureFile(data, privateKeyPem), 'latin1'))
  }

  const built: BuiltFile[] = []
  for (const [path, data] of files) {
    await mkdir(dirname(join(out, path)), { recursive: true })
    await writeFile(join(out, path), data)
    built.push({ path, sha256: sha256(data) })
  }
  await writeFile(join(repoDir, 'dist', 'manifest.json'), `${JSON.stringify({ files: built }, null, 2)}\n`)
  return built
}
