# What the installer changes in game.dll

Status: done: both patches verified in game on 8 November 2026 (the page loads in the window, "Combat Meter" under "Additional Functions").

The addons need two changes to the client's code, both in `bin64/game.dll` of the 4.8 client, written by
[tools/gamePatch.ts](../tools/gamePatch.ts) and, for the testers, by [packaging/install.ps1](../packaging/install.ps1) (a test holds the two
together). This page says what each change does and how it was found, so that the next one does not start from nothing.

## Reading the file

- Image base `0x10000000`. The first section (its name is obfuscated, there is no `.text`) maps relative address to file offset one for one, so
  every address below is both.
- The Lua functions the client gives plugins are registered by name: the UTF-16 or ASCII name, then the code that pushes the C function. A
  cross-reference search on a name's address finds its registration, and from there its group (below).
- Tools used: capstone (Python) for the disassembly, a decoder for the client's binary XML and a `.pak` extractor (both from the pak format of
  [tools/pak.ts](../tools/pak.ts)). None is kept here: they read client files, which never enter this repository.

## Patch 1: the page loads

`LoadUrlWithWebAuth(view, url)` is the only Lua call that loads a page in an addon's browser, and it first sends the address to the publisher's web
sign-on, which is gone ("No SSL Enabled", then "RD module Error 17002"). Its body (`0x6058c0..0x605b93`) is replaced by 61 bytes that call the
client's own loader with the address as it is (the instructions are in gamePatch.ts), and the rest is filled with `int3`.

## Patch 2: the client trusts our addons

### The permission groups

A plugin's Lua does not get every function. When its `.toc` is read, each `## Require: <keyword>` line (keywords in UTF-16 at `0xc705d0`, read at
`0x624475`) sets a bit of a pending-permission field of the plugin's record (`[record+0xb8]`). When the plugin's Lua environment is made, each bit
adds a group of functions:

| Keyword | Bit | Functions it adds | Granted at |
|---|---|---|---|
| `socket` | 1 | `socket.core`, `mime.core` | `0x6204e0` |
| `string` | 2 | `GetAionStr` and the game's text functions | `0x6207a0` |
| `console` | 4 | `GetConsole`, `SetConsole` | `0x620aa0` |
| `menu` | 8 | `RegisterMenu`, `RegisterPCMenu`, ..., `DownloadPlugin` | `0x620cb0` |
| `file` | 0x20 | the screenshot functions | `0x621560` |

Without `## Require: menu`, `RegisterMenu` is nil. Without `## Require: console`, so is `GetConsole`, which is why reading `-updsvr` never worked
before the addon asked for it.

### The trusted list

The bits are only honoured for the publisher's own plugins. At `0xed7010` the client holds a list of ten absolute pointers to plugin names, then
a null: NewsReader (slot 0), PowerBook, PowerBookHistory, Ranking, AionPic, PluginManager, RelicCalc (6), IngameBrowser, AionPicManager, WebGame (9).
The list is read in four places:

- `0x62b715`, right after the `.toc` is parsed: a plugin **not** in the list whose record has pending permissions is not queued for loading at
  all. This is why an addon that says `## Require: menu` loaded nothing, not even its slash commands.
- `0x625b2a`, when the Lua environment is made: the groups are granted (`0x624840`) only to a listed plugin.
- `0x626e00`: a second grant path, for an environment made again.
- `0x6294a6`: a general "is this plugin the publisher's" helper, with 18 callers.

So an unlisted addon either asks and is not loaded, or does not ask and has none of the functions.

### The change

The 4.8 client carries one of the ten plugins, RelicCalc; the nine other slots name plugins that are not there. Each of our addons takes one of
them, in the order of `FREE_SLOTS` (WebGame first, RelicCalc's slot never): its name is written in patch 1's `int3` fill from `0x605b00`, and the
slot is made to point at it. The four checks then see our addon as the publisher's, and nothing else of the client changes.

**A new addon goes in `TRUSTED_ADDONS`** (gamePatch.ts). `tests/build.test.ts` refuses an addon folder missing from it; the patched file's
fingerprint changes, the old one goes to `GAME_DLL_OUTDATED_SHA256`, and install.ps1 takes the new edits (`tests/packaging.test.ts` says which).
Nine addons fit.

## What an install does with game.dll

| The file found | What happens |
|---|---|
| the stock file | kept in `EchoesAddonsBackup/bin64/game.dll`, then patched |
| patched as this release does | left as it is |
| patched by an earlier build (`GAME_DLL_OUTDATED_SHA256`) | patched again from the stock copy the backup keeps |
| patched, but no stock copy in the backup | refused: an uninstall could not put it back |
| anything else | refused before anything is written |

The result is checked against `GAME_DLL_PATCHED_SHA256`; install.ps1 puts the stock file back if it differs. The uninstall copies the stock file back.

## The trials, for the record

The menu entry took four trials in game. Each was a guess at a single check; the first three each missed one of the four places above.

1. The pending bits were set at `0x60e67e`, a path that grants flags to something other than plugins: no effect.
2. The grant at `0x626ea5` was forced: that path runs only when the environment is made again, which it never was. No effect.
3. The grant at `0x625b67` was forced: the plugin never got there, as the gate at `0x62b75d` (in the check at `0x62b715`) had already left it
   out. The addon did not load.
4. Every read of `[record+0xb8]` was listed (with the SIB and `r12` encodings a plain search misses) and every use of the list with them: the four
   places share one list, so one name in it answers all four. The entry appeared under "Additional Functions", `/dps` and `/relic` both worked.

A shared Lua table between addons (`EchoesAddons`, for an addon listing the others) was tried too: each plugin has its own globals, so one addon
cannot see another's. A list of the installed addons would have to come from elsewhere (the game server, say).
