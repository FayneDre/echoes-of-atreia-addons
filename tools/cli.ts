import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { build } from './build.ts'
import { install, planInstall, uninstall, verifyClient, type InstallPlan } from './install.ts'
import { packageRelease } from './package.ts'
import { makeRelease } from './release.ts'
import { generateSigningKey } from './signing.ts'

/**
 * node tools/cli.ts <command> --client <client folder> [--key <private key>]
 *   keygen     writes a signing key where --key says, if none is there yet (never replaces one: every signed client would need it again)
 *   build      builds the addons into dist/ (needs the client, for its archive table and the stock archives signed again)
 *   package    zips dist/client with the PowerShell install scripts, for someone without these tools
 *   install    puts dist/client over the client, keeping what it replaces; --dry-run says what it would do, writing nothing
 *   uninstall  puts the client back as it was
 *   verify     checks every signed archive of the client against its Pub.key
 *   release    checks, tests, builds and packages the version of package.json with its notes (docs/release-notes); --publish then tags, pushes
 *              and creates the GitHub release
 */

const repoDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultKey = join(process.env.APPDATA ?? homedir(), 'echoes-of-atreia-addons', 'signing-key.pem')

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { client: { type: 'string' }, key: { type: 'string', default: defaultKey }, 'dry-run': { type: 'boolean', default: false }, publish: { type: 'boolean', default: false } }
})
const command = positionals[0]
const client = values.client ?? process.env.AION_CLIENT_HOME

function describePlan(plan: InstallPlan): string[] {
  const dll = { stock: 'patched (kept first in the backup)', outdated: 'patched again from the stock copy the backup keeps', patched: 'left as it is' }
  const lines = [`bin64/game.dll: ${dll[plan.gameDll]}`]
  const groups: [string, string[]][] = [
    ['replaced, the original kept in the backup', plan.replaced],
    ['added', plan.added],
    ['written again over an earlier install', plan.rewritten],
    ['removed, an addon this release no longer carries', plan.removed]
  ]
  for (const [what, paths] of groups) {
    if (paths.length > 0) {
      lines.push(`${what}:`, ...paths.map((path) => `  ${path}`))
    }
  }
  if (plan.gameRunning) {
    lines.push('the game is running: an install would be refused until it is closed')
  }
  return lines
}

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
      if (values['dry-run']) {
        console.log(describePlan(await planInstall(join(repoDir, 'dist', 'client'), needClient())).join('\n'))
        console.log('nothing written (--dry-run)')
        return
      }
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
    case 'release':
      await makeRelease(repoDir, {
        clientDir: needClient(),
        privateKeyPem: await readFile(values.key, 'utf8'),
        publish: values.publish,
        log: (line) => console.log(line)
      })
      return
    default:
      throw new Error('commands: keygen, build, package, install, uninstall, verify, release')
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
