# Echoes of Atreia — addons

In-game interface addons for a self-hosted Aion 4.8 server with bots. The Echoes of Atreia launcher installs and removes them; the game server
(`aion-server-playerbots`) serves the data they show.

| Addon | What it shows | State |
|---|---|---|
| [CombatMeter](addons/CombatMeter) | the group's damage and healing, per member, bots included | prototype: a window and a page from the server |

## How the 4.8 client takes an addon

- An addon is `Plugin/<Name>/<Name>.pak`: Lua and XML windows, listed by a `<Name>.toc`, the format of the client's own plugin (`RelicCalc`).
- A `.pak` is a zip whose signatures are replaced and whose first 32 bytes of each file are XORed with a table the client holds in
  `bin64/crysystem.dll`. The tools read the table there: nothing of the client is copied into this repository.
- Each archive is signed: `<Name>.pak.sig` is an RSA PKCS#1 v1.5 signature of the whole archive with SHA-1, checked with the key in `Pub.key`.
  Installing puts our key there and signs the client's three other signed archives again (`bin32.pak`, `func_pet.pak`, `RelicCalc.pak`), their
  content unchanged. No executable is modified.
- The client's Lua cannot tell who healed whom: no healing event, only damage events without a reliable source. So the server counts, and an addon
  shows the server's page in its window (`CreateWebView`, then `LoadUrlWithWebAuth`, which sends the session token the server already gave).

## Tools

Node 24 runs the TypeScript directly.

```
npm install
node tools/cli.ts keygen                       # once: the signing key, in %APPDATA%\echoes-of-atreia-addons, never in this repository
node tools/cli.ts build --client "<client>"    # dist/client, laid out as the client folder, and dist/manifest.json
node tools/cli.ts package                      # dist/EchoesAddons-<version>.zip: dist/client and the PowerShell install scripts
node tools/cli.ts install --client "<client>"  # over the client, what it replaces kept in <client>/EchoesAddonsBackup
node tools/cli.ts uninstall --client "<client>"
node tools/cli.ts verify --client "<client>"   # every signed archive against the Pub.key in place
npm test
```

The tests that need the client's files read them from `AION_CLIENT_HOME` (by default `D:/Jeux/Aion/Aion 4.8 NA`) and only ever change a copy.

## Releases

Pre-releases are tagged `vX.Y.Z-beta.N` on `develop` and carry the zip of `package`; whoever installs it needs neither Node nor these tools
(`install.ps1`, `uninstall.ps1`, instructions in `LISEZMOI.txt`). `main` moves only once a version is validated in game.

## Licence

GPL-3.0-or-later, as the launcher.
