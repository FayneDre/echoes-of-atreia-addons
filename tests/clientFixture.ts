import { existsSync } from 'node:fs'
import { copyFile, mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * The tests that need the real client's files read them from AION_CLIENT_HOME, never write there: what they change, they change in a copy of the few
 * files concerned. Without a client they are skipped, which the run says.
 */
export const realClient = process.env.AION_CLIENT_HOME ?? 'D:/Jeux/Aion/Aion 4.8 NA'
export const hasClient = existsSync(join(realClient, 'Pub.key'))

const COPIED = [
  'Pub.key',
  'bin64/crysystem.dll',
  'bin32/bin32.pak',
  'bin32/bin32.pak.sig',
  'Data/func_pet/func_pet.pak',
  'Data/func_pet/func_pet.pak.sig',
  'Plugin/RelicCalc/RelicCalc.pak',
  'Plugin/RelicCalc/RelicCalc.pak.sig'
]

/** The stock `game.dll`: the client's own, or the copy its backup keeps once the addons are installed there. */
export const stockGameDll = existsSync(join(realClient, 'EchoesAddonsBackup', 'bin64', 'game.dll'))
  ? join(realClient, 'EchoesAddonsBackup', 'bin64', 'game.dll')
  : join(realClient, 'bin64', 'game.dll')

export async function copyOfClient(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'echoes-addons-client-'))
  for (const path of COPIED) {
    await mkdir(dirname(join(dir, path)), { recursive: true })
    await copyFile(join(realClient, path), join(dir, path))
  }
  await copyFile(stockGameDll, join(dir, 'bin64', 'game.dll'))
  return dir
}
