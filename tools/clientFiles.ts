import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** The 4.8 client's own files this module reads or signs again, each with the fingerprint of the stock file. */

export function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

/**
 * The XOR table of the archive format the plugins use, read from the client itself rather than copied into this repository: the client's
 * `crysystem.dll` holds it. 1056 bytes, as an offset of up to 1023 plus 32 bytes needs.
 */
const XOR_TABLE = {
  file: 'bin64/crysystem.dll',
  offset: 0x2292b0,
  length: 1056,
  sha256: '3deaf093993c3dac87fc43465b07d4b2dc656d3ab49393e66a5b0c12f1b54ce4'
}

export async function readXorTable(clientDir: string): Promise<Buffer> {
  const dll = await readFile(join(clientDir, XOR_TABLE.file))
  const table = dll.subarray(XOR_TABLE.offset, XOR_TABLE.offset + XOR_TABLE.length)
  if (sha256(table) !== XOR_TABLE.sha256) {
    throw new Error(`${XOR_TABLE.file} is not the 4.8 client's: the archive table is not where it should be`)
  }
  return Buffer.from(table)
}

export const PUBLIC_KEY = 'Pub.key'

/**
 * Every archive of the client signed with `Pub.key`. Putting our key there means signing these again with it, so the client still accepts them:
 * their content is never touched, only their `.sig`. A client whose archives differ from the stock ones is refused rather than signed blindly.
 */
export const STOCK_SIGNED_ARCHIVES = [
  { path: 'bin32/bin32.pak', sha256: 'a2e8c3f27390a678f278e4a972d2555bb6828748815444d96be9afd09eaff065' },
  { path: 'Data/func_pet/func_pet.pak', sha256: '3bb6e072aaca44920a712eca3c4fdde5f7368aa58f3c7c51d546263499b8b850' },
  { path: 'Plugin/RelicCalc/RelicCalc.pak', sha256: 'cf26cce84a4997abe47b8eb0be266024cc79b01c69a7e379e3bd51604b98daf7' }
]

export async function checkStockArchives(clientDir: string): Promise<void> {
  for (const archive of STOCK_SIGNED_ARCHIVES) {
    const data = await readFile(join(clientDir, archive.path))
    if (sha256(data) !== archive.sha256) {
      throw new Error(`${archive.path} is not the stock 4.8 file: it would not be signed again blindly`)
    }
  }
}
