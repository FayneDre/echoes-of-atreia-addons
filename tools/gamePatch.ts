import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { sha256 } from './clientFiles.ts'

/**
 * The one change to the client's code an addon page needs. The window's browser opens a page only through the Lua function
 * `LoadUrlWithWebAuth`, which sends it first to the publisher's web sign-on: that service is gone, so the page never loads ("No SSL Enabled",
 * then "RD module Error 17002"). The patch rewrites the function's body so that `LoadUrlWithWebAuth(view, url)`, the view given by
 * `GetWebViewIndex(dialog, widget)`, asks the client's own loader for the address as it is:
 *
 *   sub rsp, 0x28
 *   mov rax, [rcx+0x18]            ; the Lua stack's first argument
 *   lea rdx, [rax+0x20]
 *   cmp rdx, [rcx+0x10]            ; two arguments at least, or nothing is done
 *   ja done
 *   cmp dword [rax+8], 3           ; a number, the view
 *   jne done
 *   cmp dword [rax+0x18], 4        ; a string, the address
 *   jne done
 *   cvttsd2si edx, qword [rax]
 *   mov r8, [rax+0x10]
 *   add r8, 0x18                   ; the string's characters
 *   lea rcx, [rip -> 0x130b850]    ; the browsers' manager every caller passes
 *   call 0x12cc80                  ; LoadUrl(manager, view, address): queues the load
 *   done: xor eax, eax             ; returns nothing to Lua
 *   add rsp, 0x28
 *   ret
 *
 * The rest of the old body is filled with int3. Only the stock 4.8 `game.dll` is patched, recognised by its fingerprint; the file is the client's
 * and stays on the player's machine, the patch is applied there.
 */

export const GAME_DLL = 'bin64/game.dll'
export const GAME_DLL_STOCK_SHA256 = '5334cf2164468678e45fe1a5decf58a0fbc4fd7f22cfdcbb87d28edce8d2c11c'
export const GAME_DLL_PATCHED_SHA256 = 'd1174b32e55e0189194e143c4a3008b54bcc0e2dd62def87c87c2c3865f34d73'
export const FUNCTION_START = 0x6058c0
export const FUNCTION_END = 0x605b93
export const BODY = Buffer.from(
  '4883ec28488b4118488d5020483b5110772483780803751e837818047518f20f2c104c8b40104983c018488d0d5f5fd000e88a73b2ff31c04883c428c3',
  'hex'
)

export function patchedGameDll(stock: Buffer): Buffer {
  if (sha256(stock) !== GAME_DLL_STOCK_SHA256) {
    throw new Error(`${GAME_DLL} is not the stock 4.8 file: it would not be patched blindly`)
  }
  const patched = Buffer.from(stock)
  patched.fill(0xcc, FUNCTION_START, FUNCTION_END)
  BODY.copy(patched, FUNCTION_START)
  return patched
}

export type GameDllState = 'stock' | 'patched'

export async function gameDllState(clientDir: string): Promise<GameDllState> {
  const hash = sha256(await readFile(join(clientDir, GAME_DLL)))
  if (hash === GAME_DLL_STOCK_SHA256) return 'stock'
  if (hash === GAME_DLL_PATCHED_SHA256) return 'patched'
  throw new Error(`${GAME_DLL} is neither the stock 4.8 file nor the patched one: nothing is installed`)
}

/**
 * Patches the client's `game.dll`, keeping the stock file at `backupPath` first unless it is null (a backup holding a stock copy already). A file
 * patched already is left as it is: its stock copy is the one the backup holds, never the patched file.
 */
export async function patchGameDll(clientDir: string, backupPath: string | null): Promise<boolean> {
  if ((await gameDllState(clientDir)) === 'patched') return false
  const stock = await readFile(join(clientDir, GAME_DLL))
  if (backupPath !== null) {
    await mkdir(dirname(backupPath), { recursive: true })
    await copyFile(join(clientDir, GAME_DLL), backupPath)
  }
  await writeFile(join(clientDir, GAME_DLL), patchedGameDll(stock))
  return true
}
