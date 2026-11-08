# Echoes of Atreia — addons

In-game interface addons for a self-hosted Aion 4.8 server with bots. The Echoes of Atreia launcher installs and removes them; the game server
(`aion-server-playerbots`) serves the data they show.

| Addon | What it shows | State |
|---|---|---|
| [CombatMeter](addons/CombatMeter) | the group's damage and healing, per member and skill, bots included | beta: verified in game on the server's machine |

## How the 4.8 client takes an addon

- An addon is `Plugin/<Name>/<Name>.pak`: Lua and XML windows, listed by a `<Name>.toc`, the format of the client's own plugin (`RelicCalc`).
- A `.pak` is a zip whose signatures are replaced and whose first 32 bytes of each file are XORed with a table the client holds in
  `bin64/crysystem.dll`. The tools read the table there: nothing of the client is copied into this repository.
- Each archive is signed: `<Name>.pak.sig` is an RSA PKCS#1 v1.5 signature of the whole archive with SHA-1, checked with the key in `Pub.key`.
  Installing puts our key there and signs the client's three other signed archives again (`bin32.pak`, `func_pet.pak`, `RelicCalc.pak`), their
  content unchanged.
- The client's Lua cannot tell who healed whom: no healing event, only damage events without a reliable source. So the server counts, and an addon
  shows the server's page in its window: `CreateWebView(dialog, widget)`, then `LoadUrlWithWebAuth(GetWebViewIndex(dialog, widget), url)`.
- That call went through the publisher's web sign-on, which is gone, and an addon gets the client's menu and console functions only if the client
  trusts it as one of the publisher's plugins. Installing patches `bin64/game.dll` for both ([docs/game-dll.md](docs/game-dll.md),
  [tools/gamePatch.ts](tools/gamePatch.ts)): the call loads the address as it is, and our addons' names take free slots of the client's list of
  trusted plugins. **A new addon gets its name in `TRUSTED_ADDONS`**, or the client does not load it (a test says so).
- Only the stock file is patched, recognised by its fingerprint, on the player's machine; the stock file is kept with the others and put back by
  the uninstall. A file an earlier build patched is patched again from that copy. The 32-bit client (`bin32/game.dll`) is not patched:
  launched in 32 bits, an addon's window stays empty. The launcher starts the 64-bit one.
- What an addon may call is asked for in its `.toc`: `## Require: string`, `menu`, `console` (the groups are in docs/game-dll.md).
- An entry of the game's menu, under "Additional Functions": `RegisterMenu(label, "/command", icon)`, the command run by a click and the icon a
  skin of the client's (`v5_start_menu_<n>_up`), as the stock `RelicCalc` does. The call is made last and through `pcall`, a refusal said in the
  chat when the character enters the world.
- The page is the server's on the same machine (`http://127.0.0.1:7790`) unless the client is launched with `-updsvr:http://<host>:<port>`, an
  option whose text the client keeps and uses for nothing else, and which the addon reads (`GetConsole("g_launcherUpdateURL")`, hence
  `## Require: console`).
- Each addon has its own Lua globals: one cannot read another's tables.

## Tools

Node 24 runs the TypeScript directly.

```
npm install
node tools/cli.ts keygen                       # once: the signing key, in %APPDATA%\echoes-of-atreia-addons, never in this repository
node tools/cli.ts build --client "<client>"    # dist/client, laid out as the client folder, and dist/manifest.json
node tools/cli.ts package                      # dist/EchoesAddons-<version>.zip: dist/client and the PowerShell install scripts
node tools/cli.ts install --client "<client>"  # over the client, what it replaces kept in <client>/EchoesAddonsBackup
node tools/cli.ts install --dry-run --client "<client>"  # what an install would do, nothing written (install.ps1 -DryRun alike)
node tools/cli.ts uninstall --client "<client>"
node tools/cli.ts verify --client "<client>"   # every signed archive against the Pub.key in place
node tools/cli.ts release --client "<client>"  # checks, tests, builds and packages a release with its notes; --publish publishes it
npm test
```

The tests that need the client's files read them from `AION_CLIENT_HOME` (by default `D:/Jeux/Aion/Aion 4.8 NA`) and only ever change a copy.

## Releases

Everything happens on `main`. Pre-releases are tagged `vX.Y.Z-beta.N` and carry the zip of `package`; whoever installs it needs neither Node
nor these tools (`install.ps1`, `uninstall.ps1`, instructions in `LISEZMOI.txt`).

A release is made by `node tools/cli.ts release` ([tools/release.ts](tools/release.ts) says what it refuses): the version of `package.json`,
an entry in [docs/release-notes/current.md](docs/release-notes/current.md) and its English twin, `npm test`, then the zip, `dist/manifest.json`
and the notes, published with `--publish`.

**The server a release needs** is said in `package.json` (`echoes.minimumServer`, the first server release serving the pages, and
`echoes.addonApiLevel`, the level of the pages it needs). The build writes both into `dist/manifest.json` and into the addons (the chat says it
at the first opening of a window), the release into the first line of its notes; the server's own `manifest.json` carries the level it offers
(`addonApiLevel`), for the launcher to compare.

## Licence

GPL-3.0-or-later, as the launcher.
