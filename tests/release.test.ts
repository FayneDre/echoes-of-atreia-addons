import { describe, expect, it } from 'vitest'
import { compareVersions, notesEntry, releaseNotes, versionKey } from '../tools/release.ts'

describe('release', () => {
  it('orders versions as semantic versioning does, a beta before its release', () => {
    const ordered = ['0.1.0-beta.2', 'v0.1.0-beta.10', '0.1.0', '0.1.1-beta.1', '0.2.0'].map((v) => versionKey(v)!)
    for (let i = 1; i < ordered.length; i++) {
      expect(compareVersions(ordered[i - 1]!, ordered[i]!)).toBeLessThan(0)
    }
    expect(versionKey('0.1')).toBeNull()
    expect(versionKey('0.1.0-rc.1')).toBeNull()
  })

  it('reads the entry of a tag, without its heading or the separator after it', () => {
    const text = '# Notes\r\n\r\n---\r\n\r\n## v0.2.0 — 2026-11-09\r\n\r\nSecond.\r\n\r\n---\r\n\r\n## v0.1.0 — 2026-11-08\r\n\r\nFirst.\r\n'
    expect(notesEntry(text, 'v0.2.0')).toBe('Second.')
    expect(notesEntry(text, 'v0.1.0')).toBe('First.')
    expect(notesEntry(text, 'v0.1')).toBeNull()
    expect(notesEntry(text, 'v0.3.0')).toBeNull()
  })

  it('leads the published notes with the server the release needs', () => {
    const notes = releaseNotes({ version: '0.2.0', minimumServer: '0.1.0-beta.4', addonApiLevel: 1 }, 'English.', 'Français.')
    expect(notes.en.split('\n')[0]).toBe('Needs game server v0.1.0-beta.4 or later (addon pages level 1).')
    expect(notes.fr.split('\n')[0]).toContain('v0.1.0-beta.4')
    expect(notes.body.indexOf('English.')).toBeLessThan(notes.body.indexOf('<details>'))
    expect(notes.body).toContain('Français.')
  })
})
