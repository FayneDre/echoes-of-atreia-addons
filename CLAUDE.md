# Echoes of Atreia — addons

In-game addons for the Aion 4.8 client. The launcher (`echoes-of-atreia-launcher`, locally `D:\Jeux\Aion\echoes-of-atreia-launcher`) installs
them; the game server (`aion-server-playerbots`, locally `D:\Jeux\Aion\source\aion-server-4.8`) serves their data. Work on either happens in
its own repository, never here. [README.md](README.md) says how the client takes an addon; [docs/](docs) holds each addon's plan and what the installer changes in the client ([game-dll.md](docs/game-dll.md)).

## Rules

- Never copy a file of the client into this repository: the tools read what they need from the client.
- The signing key never enters the repository (`*.pem` is ignored); `keygen` never replaces an existing key.
- A tool that writes into a client keeps first what it replaces, and its undo gives the stock files back byte for byte (tests/install.test.ts).
- A new addon gets its name in `TRUSTED_ADDONS` (tools/gamePatch.ts): the client loads no other plugin that asks for `## Require`
  ([docs/game-dll.md](docs/game-dll.md)). Changing the patch moves the old patched fingerprint to `GAME_DLL_OUTDATED_SHA256` and the edits to
  `packaging/install.ps1`; the tests say which.
- The server a release needs lives in `package.json` (`echoes.minimumServer`, `echoes.addonApiLevel`): raise them with an addon that needs newer
  pages. A release is made with `node tools/cli.ts release`, its notes in `docs/release-notes/` (French and English), never by hand.
- Before calling something done: `npm test`. What only the game can show (an addon loading, a window opening) is checked in game and said so.

## Conventions

- Commits in English, short, no co-author or AI attribution line. Never name a person in code, docs or commits.
- Doc files stay under ~200 lines.
