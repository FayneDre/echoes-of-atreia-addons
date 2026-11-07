import { constants, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto'

/**
 * The client checks a signed archive `x.pak` against `x.pak.sig` with the key in `Pub.key`, beside the client:
 * - `Pub.key` is the public key as DER SubjectPublicKeyInfo, in upper-case hexadecimal, on one line without an end of line;
 * - a `.sig` is an RSA PKCS#1 v1.5 signature of the whole archive with SHA-1, written the same way.
 * Checked against the stock files: the stock key verifies the stock plugin's signature this way (tests/signing.test.ts).
 */

/** The stock key's size and exponent, kept: nothing suggests the client accepts another, nothing is gained by trying. */
const MODULUS_BITS = 1024
const PUBLIC_EXPONENT = 17

export function generateSigningKey(): string {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: MODULUS_BITS, publicExponent: PUBLIC_EXPONENT })
  return privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
}

/** The content of `Pub.key` for this private key. */
export function publicKeyFile(privateKeyPem: string): string {
  const der = createPublicKey(createPrivateKey(privateKeyPem)).export({ type: 'spki', format: 'der' })
  return der.toString('hex').toUpperCase()
}

/** The content of the `.sig` of this archive. */
export function signatureFile(archive: Buffer, privateKeyPem: string): string {
  const key = createPrivateKey(privateKeyPem)
  return sign('sha1', archive, { key, padding: constants.RSA_PKCS1_PADDING }).toString('hex').toUpperCase()
}

/** Whether the client would accept this archive with this `.sig` and this `Pub.key`. */
export function verifySignatureFile(archive: Buffer, signature: string, publicKey: string): boolean {
  const key = createPublicKey({ key: Buffer.from(publicKey.trim(), 'hex'), format: 'der', type: 'spki' })
  return verify('sha1', archive, { key, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(signature.trim(), 'hex'))
}
