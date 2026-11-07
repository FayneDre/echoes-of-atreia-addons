import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateSigningKey, publicKeyFile, signatureFile, verifySignatureFile } from '../tools/signing.ts'
import { hasClient, realClient } from './clientFixture.ts'

describe('signatures', () => {
  it.skipIf(!hasClient)('verifies the stock plugin with the stock key, which is how the client checks it', async () => {
    const archive = await readFile(join(realClient, 'Plugin/RelicCalc/RelicCalc.pak'))
    const signature = await readFile(join(realClient, 'Plugin/RelicCalc/RelicCalc.pak.sig'), 'latin1')
    const key = await readFile(join(realClient, 'Pub.key'), 'latin1')
    expect(verifySignatureFile(archive, signature, key)).toBe(true)
    expect(verifySignatureFile(Buffer.concat([archive, Buffer.from([0])]), signature, key)).toBe(false)
  })

  it.skipIf(!hasClient)('writes a key and a signature in the stock files form', async () => {
    const stockKey = await readFile(join(realClient, 'Pub.key'), 'latin1')
    const stockSignature = await readFile(join(realClient, 'Plugin/RelicCalc/RelicCalc.pak.sig'), 'latin1')
    const key = generateSigningKey()
    const publicKey = publicKeyFile(key)
    const signature = signatureFile(Buffer.from('archive'), key)
    expect(publicKey).toMatch(/^[0-9A-F]+$/)
    expect(publicKey.length).toBe(stockKey.length)
    // same DER header: a 1024 bit RSA key, exponent included in the length
    expect(publicKey.slice(0, 40)).toBe(stockKey.slice(0, 40))
    expect(signature).toMatch(/^[0-9A-F]+$/)
    expect(signature.length).toBe(stockSignature.length)
  })

  it('signs with a new key what the same key verifies, and nothing else', () => {
    const key = generateSigningKey()
    const archive = Buffer.from('an archive')
    const signature = signatureFile(archive, key)
    expect(verifySignatureFile(archive, signature, publicKeyFile(key))).toBe(true)
    expect(verifySignatureFile(archive, signature, publicKeyFile(generateSigningKey()))).toBe(false)
  })
})
