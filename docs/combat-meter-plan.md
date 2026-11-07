# Combat meter

Status: built, unverified: the count and the page in a real fight, a client on another machine than the server, the launcher's part (step 4).

The group's damage and healing in a window of the game, per member, bots included: damage done and per second, healing done and per second,
the healing that went over full health, and each member's skills. Asked for by a tester who plays a healer alongside a damage dealer.

## Why the server counts

The client's Lua has two combat events, `UNIT_ATTACK_DAMAGE` and `UNIT_SKILL_DAMAGE`, which carry an amount without a reliable source, and no
healing event at all; it cannot read the chat or a file either (its ~200 functions, read from `game.dll`). So no addon can count healing on its
own. The server sees every hit and every heal with who gave it: they all go through `CreatureLifeStats.reduceHp(..., attacker)` and
`increaseHp(..., effector)`.

## How the page reaches the window

- The addon creates the view (`CreateWebView("CombatMeter", "CombatMeterBrowser")`, global functions naming the dialog and the widget) and loads
  the page in it by its index (`LoadUrlWithWebAuth(GetWebViewIndex(...), url)`).
- The stock `LoadUrlWithWebAuth` sends the page to the publisher's web sign-on, which is gone: the browser shows "No SSL Enabled", then the client
  "RD module Error 17002". Pointing the sign-on strings at the server (a language archive) did not help, the sign-on fails in the client first.
  The installer patches the function to load the address as it is ([tools/gamePatch.ts](../tools/gamePatch.ts)).
- The browser carries nothing of the game session. The addon names its character (`?name=`, from `UnitName("player")`), and the server shows that
  character's page only to a request from the address its game connection comes from (the server's own addresses counting as one).
- The server's address: `127.0.0.1:7790` by default, else the launch option `-updsvr:http://<host>:<port>` (read with `GetConsole`).

## Steps

1. **Prototype**: done 2026-11-07, verified in game on the server's machine (the window shows "Hello <name>").
2. **The count on the server**: built (`playerbot/addon/CombatMeter`): damage and healing by member and skill, overhealing, a summon's numbers to its
   master; players, and bots while in a team with a player; per second over the time in combat (a pause over five seconds does not count);
   since the team's last reset.
3. **The page**: built (`CombatMeterPage`): damage or healing, a bar per member, per second and share, overhealing; a click on a member shows its
   skills; refreshed every 1.5 s; a reset button for the team.
4. **The launcher**: the addons as a list on a page, installed and removed in one click, from this repository's releases; `-updsvr:` given when
   the server is on another machine.

## Open questions

- How the window is moved and sized, and whether it can be made transparent over the game.
- A fight-by-fight view (today: since the reset).
