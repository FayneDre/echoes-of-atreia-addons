# Release notes

Written in French, for the testers; [current.en.md](current.en.md) holds the same entries in English, for the launcher and the public
releases. Newest first, each entry headed by its version tag (`## vX.Y.Z-beta.N`). `node tools/cli.ts release` refuses a version whose entry
is missing from either file, and writes the line saying which game server the release needs (from `package.json`) at the top of the
published notes, so an entry does not say it. When this file nears 200 lines, the oldest entries move to `<year>-<month>.md`.

---

## v0.1.0-beta.4 — 08/11/2026

Le compteur de combat fonctionne : la fenêtre montre les dégâts et les soins du groupe, par membre et par compétence, bots compris, comptés
par le serveur de jeu.

**Ce qui change**

- La fenêtre charge la page du serveur : l'installation corrige `bin64/game.dll` du client, qui passait par l'authentification web de
  l'éditeur, disparue aujourd'hui.
- **Combat Meter** dans le menu du jeu, sous **Additional Functions** à côté de Relic Appraiser ; `/dps` (ou `/meter`) l'ouvre et le ferme
  toujours.
- La page est juste sous la barre de titre, en plus gros, et une longue liste de compétences défile.
- Un serveur sur une autre machine se donne au lancement du jeu : `-updsvr:http://<adresse>:7790`.
- L'installation refuse un jeu ouvert, un `game.dll` inconnu ou une sauvegarde illisible avant d'écrire quoi que ce soit, et s'installe
  par-dessus la version précédente sans désinstaller.

**Installer** : fermer le jeu, dézipper, double-cliquer sur `install.bat`. Le jeu doit être lancé en 64 bits (comme le fait le launcher).
`uninstall.bat` remet le client exactement comme avant.
