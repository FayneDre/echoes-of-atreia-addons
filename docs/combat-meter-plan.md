# Combat meter

Status: in progress: the prototype (step 1) built, unverified in game.

The group's damage and healing in a window of the game, per member, bots included: damage done and per second, healing done and per second,
the healing that went over full health, and each member's skills. Asked for by a tester who plays a healer alongside a damage dealer.

## Why the server counts

The client's Lua has two combat events, `UNIT_ATTACK_DAMAGE` and `UNIT_SKILL_DAMAGE`, which carry an amount without a reliable source, and no
healing event at all; it cannot read the chat or a file either (its ~200 functions, read from `game.dll`). So no addon can count healing on its
own. The server sees every hit and every heal with who gave it: they all go through `CreatureLifeStats.reduceHp(..., attacker)` and
`increaseHp(..., effector)`, the second returning the health actually restored, so overhealing is known too.

The addon shows a page the game server serves, in a browser inside its own window (`CreateWebView`, `LoadUrlWithWebAuth`): the client sends the
session token the server gave it (`CM_SECURITY_TOKEN`), so the page knows whose group to show without a login.

## Steps

1. **Prototype**, built: the addon `CombatMeter` (`/dps` or `/meter` opens a window), and on the server `playerbot/addon/AddonWebServer`
   on port 7790 (`gameserver.playerbot.addon.port`), whose page greets the character the token names. To check in game, in this order:
   - the client still starts with our `Pub.key` and the stock archives signed again with it (else: uninstall, the client is as before);
   - a new plugin folder loads: the chat line "[Combat Meter] loaded" at login (else: the addon goes inside `RelicCalc.pak`);
   - `/dps` opens the window, and the page in it says the character's name (else: the server's log says what the request carried);
   - the page refreshing every second does not slow the game.
2. **The count on the server**: per group, per fight (from the first hit to ten seconds without one) and since the session began; damage and
   healing by member and skill; a bot counts as any member.
3. **The page**: a table by member, a bar each, damage or healing, current fight or session; refreshed every second; as light as possible.
4. **The launcher**: the addons as a list on a page, installed and removed in one click, from this repository's releases; the server address
   given to the addon (today `127.0.0.1`, which only a client on the server's machine reaches).

## Open questions

- How the addon learns the server's address: a signed archive cannot be edited on the player's machine. A client setting the launcher writes and
  the Lua reads (`GetConsole`) is the first thing to try.
- How the window is moved and sized, and whether it can be made transparent over the game.
