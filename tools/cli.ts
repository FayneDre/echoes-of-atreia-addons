import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { build } from './build.ts'
import { install, uninstall, verifyClient } from './install.ts'
import { packageRelease } from './package.ts'
import { generateSigningKey } from './signing.ts'

/**
 * node tools/cli.ts <command> --client <client folder> [--key <private key>]
 *   keygen     writes a signing key where --key says, if none is there yet (never replaces one: every signed client would need it again)
 *   build      builds the addons into dist/ (needs the client, for its archive table and the stock archives signed again)
 *   package    zips dist/client with the PowerShell install scripts, for someone without these tools
 *   install    puts dist/client over the client, keeping what it replaces
 *   uninstall  puts the client back as it was
 *   verify     checks every signed archive of the client against its Pub.key
 */

const repoDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultKey = join(process.env.APPDATA ?? homedir(), 'echoes-of-atreia-addons', 'signing-key.pem')

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { client: { type: 'string' }, key: { type: 'string', default: defaultKey } }
})
const command = positionals[0]
const client = values.client ?? process.env.AION_CLIENT_HOME

function needClient(): string {
  if (!client) {
    throw new Error('--client <the client folder> (or AION_CLIENT_HOME) is needed')
  }
  return resolve(client)
}

async function main(): Promise<void> {
  switch (command) {
    case 'keygen': {
      try {
        await readFile(values.key)
        console.log(`a key is already there, kept: ${values.key}`)
      } catch {
        await mkdir(dirname(values.key), { recursive: true })
        await writeFile(values.key, generateSigningKey(), { mode: 0o600 })
        console.log(`key written: ${values.key}`)
      }
      return
    }
    case 'build': {
      const key = await readFile(values.key, 'utf8')
      for (const file of await build(repoDir, needClient(), key)) {
        console.log(`${file.sha256.slice(0, 12)}  ${file.path}`)
      }
      return
    }
    case 'package': {
      const zip = await packageRelease(repoDir)
      console.log(`package written: ${zip}`)
      return
    }
    case 'install': {
      const files = await install(join(repoDir, 'dist', 'client'), needClient())
      console.log(`installed ${files.length} file(s); every signed archive checks against the new Pub.key`)
      return
    }
    case 'uninstall':
      await uninstall(needClient())
      console.log('the client is back as it was')
      return
    case 'verify':
      for (const archive of await verifyClient(needClient())) {
        console.log(`ok  ${archive}`)
      }
      return
    default:
      throw new Error('commands: keygen, build, package, install, uninstall, verify')
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
