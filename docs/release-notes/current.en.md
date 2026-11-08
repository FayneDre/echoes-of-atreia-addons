# Release notes (English)

The English twin of [current.md](current.md): the same entries, headed by the same version tags, in the same order. `node tools/cli.ts release`
refuses a version whose entry is missing from either file, and writes the line saying which game server the release needs (from
`package.json`) at the top of the published notes, so an entry does not say it. When this file nears 200 lines, the oldest entries move to
`<year>-<month>.en.md`, with their French ones.

---

## v0.1.0-beta.4 — 2026-11-08

The combat meter, working: the window shows the group's damage and healing, per member and skill, bots included, served by the game server.

**What is new**

- The window loads the server's page: the installer patches the client's `bin64/game.dll`, whose page loading went through the publisher's
  web sign-on, gone today.
- **Combat Meter** in the game's menu, under **Additional Functions** next to Relic Appraiser; `/dps` (or `/meter`) still opens and closes it.
- The page sits right under the title bar, in larger text, and a long list of skills scrolls.
- A server on another machine is read from the launch option `-updsvr:http://<address>:7790`.
- The install refuses a running game, an unknown `game.dll` or an unreadable backup before writing anything, and installs over the previous
  version without an uninstall.

**Install**: close the game, unzip, double-click `install.bat`. The game must be started in 64 bits (as the launcher does).
`uninstall.bat` puts the client back exactly as it was.
