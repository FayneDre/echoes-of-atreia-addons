import { exec, execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { build, readRelease, type Release } from './build.ts'
import { packageRelease } from './package.ts'

/**
 * Makes a release of the addons as `tools/tag-patch.ps1` makes one of the server, refusing, each time saying why:
 * - a version that is not X.Y.Z or X.Y.Z-beta.N, that is tagged already, or that is not above the highest version tagged;
 * - another branch than `main` (the one branch of this repository), a working tree with uncommitted changes;
 * - docs/release-notes/current.md (French) or current.en.md (English) with no entry headed `## v<version>`;
 * - a failed `npm test`.
 * Then builds, packages, and writes into `dist/release/` the notes the launcher reads (`notes.en.md`, `notes.fr.md`) and the release body
 * (English, then the French in a `<details>` block). The notes' first line is written here, not by hand: the game server the release needs,
 * from package.json, which a hand-written line once got wrong. With `publish`, tags, pushes `main` and the tag, and creates the GitHub release
 * (a pre-release for a beta) with the zip, the manifest and the notes; otherwise prints the commands.
 */

const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/
const run = promisify(execFile)

/** Sorts as semantic versioning does: a beta before the release it leads to. Null for anything else. */
export function versionKey(version: string): number[] | null {
  const match = VERSION.exec(version.replace(/^v/, ''))
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? Number.MAX_SAFE_INTEGER : Number(match[4])]
}

export function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i]! - b[i]!
  }
  return 0
}

/** The entry headed `## <tag>` of a notes file, without its heading, up to the next entry or the separator before it. */
export function notesEntry(text: string, tag: string): string | null {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const start = lines.findIndex((line) => line === `## ${tag}` || line.startsWith(`## ${tag} `))
  if (start < 0) return null
  let end = lines.findIndex((line, index) => index > start && line.startsWith('## '))
  if (end < 0) end = lines.length
  const body = lines.slice(start + 1, end).join('\n').replace(/\n-{3,}\s*$/, '').trim()
  return body === '' ? null : body
}

export interface ReleaseNotes {
  en: string
  fr: string
  body: string
}

/** The notes as published: each led by the server the release needs, the body English first and the French folded under it. */
export function releaseNotes(release: Release, en: string, fr: string): ReleaseNotes {
  const server = `v${release.minimumServer}`
  const notesEn = `Needs game server ${server} or later (addon pages level ${release.addonApiLevel}).\n\n${en}`
  const notesFr = `Il faut le serveur de jeu ${server} ou plus récent (pages des addons, niveau ${release.addonApiLevel}).\n\n${fr}`
  return { en: notesEn, fr: notesFr, body: `${notesEn}\n\n<details>\n<summary>Français</summary>\n\n${notesFr}\n\n</details>\n` }
}

async function git(repoDir: string, ...args: string[]): Promise<string> {
  const { stdout } = await run('git', ['-C', repoDir, ...args])
  return stdout.trim()
}

export interface ReleaseOptions {
  clientDir: string
  privateKeyPem: string
  publish: boolean
  log: (line: string) => void
}

export async function makeRelease(repoDir: string, options: ReleaseOptions): Promise<void> {
  const release = await readRelease(repoDir)
  const key = versionKey(release.version)
  if (!key) throw new Error(`package.json's version ${release.version} is neither X.Y.Z nor X.Y.Z-beta.N`)
  const tag = `v${release.version}`
  const preRelease = release.version.includes('-beta.')

  const branch = await git(repoDir, 'rev-parse', '--abbrev-ref', 'HEAD')
  if (branch !== 'main') throw new Error(`releases are made from main, and this is ${branch}`)
  if (await git(repoDir, 'status', '--porcelain')) throw new Error('the working tree has uncommitted changes: commit them first')
  const tags = (await git(repoDir, 'tag', '--list', 'v*')).split('\n').filter(Boolean)
  if (tags.includes(tag)) throw new Error(`${tag} is tagged already: raise the version in package.json`)
  const highest = tags.map((t) => ({ t, k: versionKey(t) })).filter((v) => v.k !== null).sort((a, b) => compareVersions(a.k!, b.k!)).pop()
  if (highest && compareVersions(highest.k!, key) >= 0) throw new Error(`${tag} is not above ${highest.t}, the highest version tagged`)

  const entries: Record<'en' | 'fr', string> = { en: '', fr: '' }
  for (const [language, file] of [['fr', 'current.md'], ['en', 'current.en.md']] as const) {
    const text = await readFile(join(repoDir, 'docs', 'release-notes', file), 'utf8').catch(() => '')
    const entry = notesEntry(text, tag)
    if (!entry) throw new Error(`docs/release-notes/${file} has no entry headed '## ${tag}': write it in both files and commit them`)
    entries[language] = entry
  }

  options.log('npm test...')
  // npm is a batch file on Windows, which only a shell starts: given as one command line, with nothing of ours in it
  await promisify(exec)('npm test', { cwd: repoDir }).catch((error: { stdout?: string }) => {
    throw new Error(`npm test failed:\n${(error.stdout ?? '').split('\n').slice(-30).join('\n')}`)
  })
  options.log('build and package...')
  await build(repoDir, options.clientDir, options.privateKeyPem)
  const zip = await packageRelease(repoDir)

  const notes = releaseNotes(release, entries.en, entries.fr)
  const out = join(repoDir, 'dist', 'release')
  await mkdir(out, { recursive: true })
  await writeFile(join(out, 'notes.en.md'), `${notes.en}\n`)
  await writeFile(join(out, 'notes.fr.md'), `${notes.fr}\n`)
  await writeFile(join(out, 'body.md'), notes.body)

  const assets = [zip, join(repoDir, 'dist', 'manifest.json'), join(out, 'notes.en.md'), join(out, 'notes.fr.md')]
  const gh = ['release', 'create', tag, ...(preRelease ? ['--prerelease'] : []), '--verify-tag', '--title', tag, '--notes-file', join(out, 'body.md'), ...assets]
  if (!options.publish) {
    options.log(`ready: ${tag}, notes in ${out}. To publish (or run again with --publish):`)
    options.log(`  git tag -a ${tag} -m ${tag} && git push origin main ${tag}`)
    options.log(`  gh ${gh.map((arg) => (arg.includes(' ') ? `"${arg}"` : arg)).join(' ')}`)
    return
  }
  await git(repoDir, 'tag', '-a', tag, '-m', tag)
  await git(repoDir, 'push', 'origin', 'main', tag)
  const { stdout } = await run('gh', gh, { cwd: repoDir })
  options.log(`published: ${stdout.trim()}`)
}
