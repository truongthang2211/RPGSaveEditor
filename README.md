# RPG Save Editor – RPG Maker (MV, MZ, VX Ace, VX, XP) and Ren'Py save editor

[![Latest release](https://img.shields.io/github/v/release/truongthang2211/RPGSaveEditor)](https://github.com/truongthang2211/RPGSaveEditor/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/truongthang2211/RPGSaveEditor/total)](https://github.com/truongthang2211/RPGSaveEditor/releases)
[![License](https://img.shields.io/github/license/truongthang2211/RPGSaveEditor)](LICENSE)

**RPG Save Editor** is a free, open-source desktop app for editing **RPG Maker and Ren'Py save files**: change gold,
items, weapons, armors, party stats, switches and variables, or any other value in the save. It works offline, keeps
your save intact, and supports every modern RPG Maker engine and Ren'Py visual novels:

| Engine | Save files |
|---|---|
| RPG Maker MZ | `file1.rmmzsave`, `file2.rmmzsave`, … |
| RPG Maker MV | `file1.rpgsave`, `file2.rpgsave`, … |
| RPG Maker VX Ace | `Save01.rvdata2`, … |
| RPG Maker VX | `Save1.rvdata`, … |
| RPG Maker XP | `Save1.rxdata`, … |
| Ren'Py 7 and 8 | `1-1-LT1.save`, `auto-1-LT1.save`, `quick-1-LT1.save`, … |

**[⬇ Download the latest version for Windows](https://github.com/truongthang2211/RPGSaveEditor/releases/latest)**

## Screenshots

![RPG Save Editor main window: editing items in an RPG Maker save](https://github.com/user-attachments/assets/63712b7e-c9c7-4ddc-ad5a-d7c8c5bea7cd)

![RPG Save Editor in dark mode](https://github.com/user-attachments/assets/25e63f51-1f8c-4c62-b61e-0bed689237ef)

## Features

- **Party**: gold, HP, MP, TP, level, EXP and bonus stats (ATK, DEF, MAT, MDF, AGI, LUK) of every character.
- **Items, weapons and armors**: change how many of each you own, with names read from the game's database.
- **Switches and variables**: turn switches on/off and change variables, with their names from the game.
- **Ren'Py variables**: every game variable (affection points, flags, money, names…) by name, with its type kept.
- **Advanced tab**: browse *every* value in the save as a tree and edit numbers, text and true/false values. Useful
  for games whose plugins or scripts keep data in their own places.
- **Powerful search**: exact text, regular expressions, number comparisons (`>1000`, `100..200`) and paths
  (`party.@gold`, `actors.**.@hp`). See the `?` button in the Advanced tab.
- **Find unknown values** (like Cheat Engine): open a save, play, open the next save, then search for values that
  *changed*, *increased* or *decreased*, and refine the results with each new save.
- **Compare saves**: "Old" and "Gap" columns show how values changed since the previous save of the same game.
- **Safe for your saves**: XP/VX/VX Ace and Ren'Py saves are rewritten losslessly (everything you don't edit is kept
  byte-for-byte), values are kept in the right type, and unsaved changes are never lost by accident.
- **Reads game data automatically**: item, switch and variable names come from the game's `data`/`Data` folder,
  including encrypted archives (`Game.rgssad`, `Game.rgss2a`, `Game.rgss3a`).
- Drag & drop a save onto the window, keyboard shortcuts, light and dark themes, and automatic updates.

## Download and install

1. Download `rpgsaveeditor_x.y.z_x64-setup.exe` from the
   [latest release](https://github.com/truongthang2211/RPGSaveEditor/releases/latest).
2. Run it to install. Windows SmartScreen may warn about an unknown publisher because the app isn't code-signed:
   click **More info → Run anyway**.
3. The app checks for updates when it starts (you can turn this off in **About**) and updates itself in one click.

Requires Windows 10 or 11 (64-bit).

## How to edit an RPG Maker save

1. **Back up your save file first.**
2. Open RPG Save Editor and click the file icon (or press <kbd>Ctrl</kbd>+<kbd>O</kbd>, or drag the save onto the
   window). Saves are usually here, inside the game's folder:
   - **MZ**: `save/` · **MV**: `www/save/`
   - **XP, VX, VX Ace**: the game's main folder (next to `Game.exe`)
   - **Ren'Py**: `game/saves/`, or `%APPDATA%\RenPy\<game name>` (Windows)
3. Edit values in **Party**, **Items**, **Weapons**, **Armors**, **Switches**, **Variables** or **Advanced**.
   Changed values are highlighted.
4. Press <kbd>Ctrl</kbd>+<kbd>S</kbd> to save, then load the save in the game.
   <kbd>Ctrl</kbd>+<kbd>R</kbd> reloads the file from disk.

Ren'Py 8.1 and newer sign their saves, so when you load an edited save the game asks whether you trust it; answer
**Yes**. Ren'Py keeps a copy of each save in both folders above and loads the newest, so editing either copy works. Loading rolls
the game back to the start of the line it was saved on; the editor updates the values Ren'Py restores there too, so
your edits stay.

## Support the project

RPG Save Editor is built in my spare time. If it saved you some grinding, consider buying me a coffee:

[![Buy Me a Coffee](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/truongthang2211)
[![PayPal](https://www.paypalobjects.com/webstatic/mktg/logo/pp_cc_mark_111x69.jpg)](https://www.paypal.me/truongthang2211)

Bug reports and feature requests are welcome in [Issues](https://github.com/truongthang2211/RPGSaveEditor/issues).

## Development

Built with [Tauri 2](https://tauri.app/) (Rust) and [React](https://react.dev/) + TypeScript, styled with
[styled-components](https://styled-components.com/).

### Prerequisites

- [Node.js](https://nodejs.org/) 20.19 or newer (22 LTS recommended)
- [Rust](https://www.rust-lang.org/tools/install) 1.90 or newer
- The system dependencies from the [Tauri prerequisites guide](https://tauri.app/start/prerequisites/)

### Commands

```bash
git clone https://github.com/truongthang2211/RPGSaveEditor.git
cd RPGSaveEditor
npm install

npm run tauri dev     # run the app with hot reload
npm test              # run the tests
npm run tauri build   # build the installer (src-tauri/target/release/bundle)
```

Save formats live in `src/formats/` (one folder per engine, plus a lossless Ruby Marshal reader/writer in
`src/formats/marshal/`).

### Troubleshooting

- **Rust errors**: run `rustup update stable`; if the build still fails, run `cargo clean` in `src-tauri/`.
- **Port 1420 in use**: the dev server needs port 1420; close the other process using it.

### Contributing

Pull requests are welcome. Please run `npm test` and `npm run build` before opening one, and describe how you tested
the change (ideally with a real save from the engine you touched).

## License and disclaimer

Licensed under the [Apache License 2.0](LICENSE).

RPG Save Editor is an unofficial, fan-made tool. It is not affiliated with or endorsed by the makers of RPG Maker.
RPG Maker is a trademark of its respective owners.
