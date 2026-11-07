import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib'

/**
 * The client's archive format: a zip whose four signatures are replaced and whose first 32 bytes of every stored file are XORed with a table the
 * client carries (see clientFiles.ts). Everything else is plain zip, deflate included.
 */

export interface PakEntry {
  name: string
  data: Buffer
}

const LOCAL = Buffer.from('afb4fcfb', 'hex')
const CENTRAL = Buffer.from('afb4fefd', 'hex')
const END = Buffer.from('afb4faf9', 'hex')

/** The fields the stock plugin carries, kept as they are: nothing in an archive of ours should look different to the client. */
const ZIP_VERSION = 0x14
const DOS_TIME = 0
const DOS_DATE = 0x3221
const EXTERNAL_ATTRIBUTES = 0x21
const DEFLATE = 8
const STORED = 0

const SCRAMBLED_BYTES = 32
const TABLE_INDEX_MASK = 1023

/** XORs the head of a stored file in place; the same call scrambles and unscrambles. */
function scramble(data: Buffer, table: Buffer): void {
  const offset = data.length & TABLE_INDEX_MASK
  for (let i = 0; i < Math.min(SCRAMBLED_BYTES, data.length); i++) {
    data[i]! ^= table[offset + i]!
  }
}

export function writePak(entries: PakEntry[], table: Buffer): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'latin1')
    const compressed = deflateRawSync(entry.data, { level: 9 })
    scramble(compressed, table)
    const crc = crc32(entry.data)

    const local = Buffer.alloc(30)
    LOCAL.copy(local, 0)
    local.writeUInt16LE(ZIP_VERSION, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(DEFLATE, 8)
    local.writeUInt16LE(DOS_TIME, 10)
    local.writeUInt16LE(DOS_DATE, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, name, compressed)

    const central = Buffer.alloc(46)
    CENTRAL.copy(central, 0)
    central.writeUInt16LE(ZIP_VERSION, 4)
    central.writeUInt16LE(ZIP_VERSION, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(DEFLATE, 10)
    central.writeUInt16LE(DOS_TIME, 12)
    central.writeUInt16LE(DOS_DATE, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(entry.data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(EXTERNAL_ATTRIBUTES, 38)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)

    offset += local.length + name.length + compressed.length
  }
  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  END.copy(end, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}

export function readPak(pak: Buffer, table: Buffer): PakEntry[] {
  const entries: PakEntry[] = []
  let pos = 0
  while (pos + 30 <= pak.length && pak.subarray(pos, pos + 4).equals(LOCAL)) {
    const flags = pak.readUInt16LE(pos + 6)
    const method = pak.readUInt16LE(pos + 8)
    const crc = pak.readUInt32LE(pos + 14)
    const compressedSize = pak.readUInt32LE(pos + 18)
    const nameLength = pak.readUInt16LE(pos + 26)
    const extraLength = pak.readUInt16LE(pos + 28)
    if (flags & 8) {
      throw new Error('archives with data descriptors are not supported')
    }
    const name = pak.toString('latin1', pos + 30, pos + 30 + nameLength)
    const start = pos + 30 + nameLength + extraLength
    const stored = Buffer.from(pak.subarray(start, start + compressedSize))
    scramble(stored, table)
    if (method !== DEFLATE && method !== STORED) {
      throw new Error(`${name}: compression method ${method} is not supported`)
    }
    const data = method === DEFLATE ? inflateRawSync(stored) : stored
    if (crc32(data) !== crc) {
      throw new Error(`${name}: wrong checksum (another table, or a damaged archive)`)
    }
    entries.push({ name, data })
    pos = start + compressedSize
  }
  if (!pak.subarray(pos, pos + 4).equals(CENTRAL)) {
    throw new Error('not a client archive')
  }
  return entries
}
