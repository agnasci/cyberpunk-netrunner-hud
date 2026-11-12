# Netrunner HUD — for Cyberpunk RED

A shared Netrunning HUD for Foundry VTT, for use with the **Cyberpunk RED – CORE** system.
The GM and the Netrunner control the run; everyone else at the table watches it live. The
native character sheet and cyberdeck remain the source of truth.

> **Beta.** Tested on Foundry V12 (12.343) with the Cyberpunk RED – CORE system v0.92.4.
> Other versions have not been tested. The interface is available in English and Brazilian
> Portuguese.

## Installation

In Foundry, go to **Add-on Modules → Install Module** and paste this into *Manifest URL*:

```
https://github.com/agnasci/cyberpunk-netrunner-hud/releases/latest/download/module.json
```

Enable the module in your world. The terminal button in the token controls opens the HUD; the
GM picks the Netrunner and the NET Architecture when starting a run. To build an architecture,
the GM uses the **NET Architecture editor** button at the bottom of the Items tab.

## Features

- NET Architecture editor for the GM: drag node types (Password, File, Control Node, Black ICE)
  onto a grid with the HUD's look, then set each node's DV, Black ICE type, GM note, Black ICE
  actor and enemy NPC Netrunner in a small side panel. It saves to the system's own NET
  Architecture item, warns about nodes with no path to the entry floor, keeps unsaved drafts in
  your browser, and locks nodes that are in use while a run is active.
- NET Architecture shown as a grid, with branches (a–h) and the paths between them. The GM
  reveals nodes fully or on the map only (contents hidden until the Netrunner enters).
- NET Actions limited by Interface rank: Jack In/Out, Backdoor, Control, Eye-Dee, Zap, Slide,
  Pathfinder, Cloak, Virus (lowest floor only), rezzing and attacking with programs.
- Native system rolls. The GM confirms each result, resolves it in one click, or turns on the
  no-confirmation mode.
- Black ICE linked to world actors: lying-in-wait encounters, alternating turns, attacks, and
  damage to the Netrunner's brain or to her programs' REZ (the GM picks the program hit).
- Enemy NPC Netrunners on any node, with initiative and attacks.
- Program rules: one activation per copy per round, neutralized at 0 REZ, Armor/Flak/Shield/
  Superglue once per Netrun.
- Several runs at once (tabs), event log, GM undo and optional sound.

The module **does not include Black ICE stats from the rulebook**: create the Black ICE actors
(and the program items with their damage) in your own world, from the book.

## Development

TypeScript code, tests with Vitest. Commands are in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
(project documentation is in Portuguese).

```
npm ci
npm run check
```

## License and notice

The code is released under the [MIT License](LICENSE).

Netrunner HUD is unofficial content provided under the Homebrew Content Policy of R. Talsorian
Games and is not approved or endorsed by RTG. This content references materials that are the
property of R. Talsorian Games and its licensees.
