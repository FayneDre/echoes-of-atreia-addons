import { execFile } from 'node:child_process'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { readRelease } from './build.ts'

/**
 * The zip a release carries: `client/` as the build laid it out, the PowerShell scripts that install and remove it without these tools, and the
 * instructions. Windows PowerShell 5.1 reads a script without a byte order mark in the ANSI code page, so the scripts get one.
 */

const SCRIPTS = ['install.ps1', 'uninstall.ps1']
/** What a person double-clicks: a downloaded, unsigned script is refused by PowerShell's execution policy, a batch file passing Bypass is not. */
const LAUNCHERS = ['install.bat', 'uninstall.bat']
const README = 'LISEZMOI.txt'
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff)

function windowsLines(text: string): string {
  return text.replace(/\r?\n/g, '\r\n')
}

export async function packageRelease(repoDir: string): Promise<string> {
  const { version } = await readRelease(repoDir)
  const stage = join(repoDir, 'dist', 'package')
  await rm(stage, { recursive: true, force: true })
  await mkdir(stage, { recursive: true })
  await cp(join(repoDir, 'dist', 'client'), join(stage, 'client'), { recursive: true })
  for (const script of SCRIPTS) {
    const text = windowsLines(await readFile(join(repoDir, 'packaging', script), 'utf8'))
    await writeFile(join(stage, script), text.startsWith(BYTE_ORDER_MARK) ? text : BYTE_ORDER_MARK + text, 'utf8')
  }
  for (const launcher of LAUNCHERS) {
    await writeFile(join(stage, launcher), windowsLines(await readFile(join(repoDir, 'packaging', launcher), 'utf8')), 'utf8')
  }
  await writeFile(join(stage, README), windowsLines(await readFile(join(repoDir, 'packaging', README), 'utf8')), 'utf8')

  const zip = join(repoDir, 'dist', `EchoesAddons-${version}.zip`)
  await rm(zip, { force: true })
  // Windows' own tar writes zip archives (-a picks the format from the name); a GNU tar first on the PATH (Git's) does not
  const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:/Windows', 'System32', 'tar.exe') : 'tar'
  await promisify(execFile)(tar, ['-a', '-c', '-f', zip, '-C', stage, 'client', ...SCRIPTS, ...LAUNCHERS, README])
  return zip
}
