import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { sha256 } from './clientFiles.ts'

/**
 * The changes to the client's code the addons need, both in `bin64/game.dll`; docs/game-dll.md says how each was found.
 *
 * 1. Loading a page. The window's browser opens a page only through the Lua function `LoadUrlWithWebAuth`, which sends it first to the
 *    publisher's web sign-on: that service is gone, so the page never loads ("No SSL Enabled", then "RD module Error 17002"). The function's
 *    body is rewritten so that `LoadUrlWithWebAuth(view, url)`, the view given by `GetWebViewIndex(dialog, widget)`, asks the client's own
 *    loader for the address as it is:
 *
 *      sub rsp, 0x28
 *      mov rax, [rcx+0x18]            ; the Lua stack's first argument
 *      lea rdx, [rax+0x20]
 *      cmp rdx, [rcx+0x10]            ; two arguments at least, or nothing is done
 *      ja done
 *      cmp dword [rax+8], 3           ; a number, the view
 *      jne done
 *      cmp dword [rax+0x18], 4        ; a string, the address
 *      jne done
 *      cvttsd2si edx, qword [rax]
 *      mov r8, [rax+0x10]
 *      add r8, 0x18                   ; the string's characters
 *      lea rcx, [rip -> 0x130b850]    ; the browsers' manager every caller passes
 *      call 0x12cc80                  ; LoadUrl(manager, view, address): queues the load
 *      done: xor eax, eax             ; returns nothing to Lua
 *      add rsp, 0x28
 *      ret
 *
 *    The rest of the old body is filled with int3.
 *
 * 2. The trusted plugins. A plugin gets the functions its `.toc` asks for (`## Require: menu`, for `RegisterMenu`) only when its name is in
 *    the client's list of the publisher's plugins; any other plugin that asks is not loaded at all. Our addons take the slots of publisher
 *    plugins the client does not carry: each name is written in the int3 fill of patch 1, and the slot points at it.
 *
 * Only the stock 4.8 `game.dll` is patched, recognised by its fingerprint; the file is the client's and stays on the player's machine, the patch
 * is applied there. packaging/install.ps1 applies the same edits (tests/packaging.test.ts holds the two together).
 */

export const GAME_DLL = 'bin64/game.dll'
export const GAME_DLL_STOCK_SHA256 = '5334cf2164468678e45fe1a5decf58a0fbc4fd7f22cfdcbb87d28edce8d2c11c'
/** The stock file with every edit below: what an install leaves. A change to the edits changes it, and moves the old one to OUTDATED. */
export const GAME_DLL_PATCHED_SHA256 = 'c61d2570eb6fb23527aacf6ca11e431c898cecde741432dcc22cadbcd0a3b284'
/**
 * The file as earlier builds patched it, recognised so that installing over one patches the stock copy the backup keeps again:
 * the page loading alone, before the trusted names (the builds after 0.1.0-beta.3, which patched nothing).
 */
export const GAME_DLL_OUTDATED_SHA256 = ['d1174b32e55e0189194e143c4a3008b54bcc0e2dd62def87c87c2c3865f34d73']

/** The DLL's preferred base: a pointer of its data is this plus a relative address (the loader moves both together if it relocates it). */
const IMAGE_BASE = 0x10000000

/** Patch 1: the body of LoadUrlWithWebAuth, its first instructions replaced and the rest filled with int3. */
const FUNCTION_START = 0x6058c0
const FUNCTION_END = 0x605b93
const BODY = Buffer.from(
  '4883ec28488b4118488d5020483b5110772483780803751e837818047518f20f2c104c8b40104983c018488d0d5f5fd000e88a73b2ff31c04883c428c3',
  'hex'
)

/** Patch 2: the list, ten pointers to plugin names and a null, read wherever the client asks whether a plugin is the publisher's. */
const TRUSTED_LIST = 0xed7010
/**
 * The slots of publisher plugins the 4.8 client does not carry, in the order our addons take them: WebGame, AionPicManager, IngameBrowser,
 * PluginManager, AionPic, Ranking, PowerBookHistory, PowerBook, NewsReader. Slot 6, RelicCalc, is the one installed plugin and is kept.
 */
const FREE_SLOTS = [9, 8, 7, 5, 4, 3, 2, 1, 0]
/** Where the names go: in patch 1's int3 fill, after the body. */
const NAMES_START = 0x605b00

/**
 * Every addon of this repository, by its folder's name: the client trusts them as it trusts the publisher's plugins. An addon missing here
 * that asks for `## Require` is not loaded by the client at all (tests/build.test.ts refuses one).
 */
export const TRUSTED_ADDONS = ['CombatMeter']

/** The old body's bytes, filled with int3 before the edits are written: the first thing done to the stock file. */
export const PATCH_FILL = { start: FUNCTION_START, end: FUNCTION_END }

export interface PatchEdit {
  offset: number
  bytes: Buffer
}

/**
 * The bytes written over the stock file after the fill, at their file offsets (the code section maps file offset to relative address one for
 * one): the new body, each addon's name, each slot pointing at its name.
 */
export function patchEdits(): PatchEdit[] {
  if (TRUSTED_ADDONS.length > FREE_SLOTS.length) {
    throw new Error(`the client's list has ${FREE_SLOTS.length} free slots, ${TRUSTED_ADDONS.length} addons need one`)
  }
  const edits: PatchEdit[] = [{ offset: FUNCTION_START, bytes: BODY }]
  let at = NAMES_START
  TRUSTED_ADDONS.forEach((name, index) => {
    const text = Buffer.from(`${name}\0`, 'latin1')
    if (at + text.length > FUNCTION_END) {
      throw new Error('the addons\' names no longer fit in the room patch 1 leaves')
    }
    const pointer = Buffer.alloc(8)
    pointer.writeBigUInt64LE(BigInt(IMAGE_BASE + at))
    edits.push({ offset: at, bytes: text }, { offset: TRUSTED_LIST + 8 * FREE_SLOTS[index]!, bytes: pointer })
    at += text.length
  })
  return edits
}

export function patchedGameDll(stock: Buffer): Buffer {
  if (sha256(stock) !== GAME_DLL_STOCK_SHA256) {
    throw new Error(`${GAME_DLL} is not the stock 4.8 file: it would not be patched blindly`)
  }
  const patched = Buffer.from(stock)
  patched.fill(0xcc, PATCH_FILL.start, PATCH_FILL.end)
  for (const edit of patchEdits()) {
    edit.bytes.copy(patched, edit.offset)
  }
  return patched
}

/** `outdated`: patched by an earlier release, to be patched again from the stock copy its backup keeps. */
export type GameDllState = 'stock' | 'patched' | 'outdated'

export async function gameDllState(clientDir: string): Promise<GameDllState> {
  const hash = sha256(await readFile(join(clientDir, GAME_DLL)))
  if (hash === GAME_DLL_STOCK_SHA256) return 'stock'
  if (hash === GAME_DLL_PATCHED_SHA256) return 'patched'
  if (GAME_DLL_OUTDATED_SHA256.includes(hash)) return 'outdated'
  throw new Error(`${GAME_DLL} is neither the stock 4.8 file nor a patched one: nothing is installed`)
}
