# siyuan-ankiLinker

[简体中文](./README_zh_CN.md)

SiYuan flashcard one-way sync plugin for local Anki.

- Plugin ID / manual install folder: `siyuan-ankiLinker`
- Repository: <https://github.com/imiacc/imiacc/siyuan-ankiLinker>
- Author: `imiacc`

## Overview

This plugin pushes SiYuan flashcards into your local Anki instance through `AnkiConnect`. After the local notes are populated, Anki Desktop performs its own normal sync to your account/server.

The sync direction is strictly **SiYuan → Anki**. The plugin never writes back into SiYuan.

## Requirements

1. `Anki Desktop` must be running.
2. `Anki Desktop` must be signed in if you want cloud sync.
3. `AnkiConnect` add-on must be installed and enabled.
4. The plugin talks to a local URL such as `http://127.0.0.1:8765`.

## Manual installation

The repository name and plugin ID are both `siyuan-ankiLinker`. When installing manually, name the plugin directory exactly `siyuan-ankiLinker`.

The plugin only reads/writes data tagged with its current identity (`siyuan-anki-linker`). It does not migrate or clean up data from older plugin variants.

## Features

- Uses SiYuan flashcard `cardID` as the stable sync identity; falls back to `blockID` when a card identifier is unavailable.
- Manual sync from SiYuan to local Anki, with incremental add / update / delete.
- Separate note type and field mapping for QA cards and Cloze cards.
- Reads field names from the selected Anki note type — fields are chosen from a dropdown to avoid typos.
- Routes flashcards into different Anki decks by SiYuan document path prefix.
- Sync preview, sync logs, local mapping persistence.
- Config export / import in the top toolbar.
- Deletion diagnostics: inspect orphaned mappings and whether deletion is safe before running sync.
- Path-rule summary view with edit / done states and right-aligned action buttons.
- Sync progress indicator: shows `Sync Progress: Ready / Syncing N% / Done` under the sync preview panel, useful when the card count grows large.

## Supported card formats

The plugin decides per-flashcard which format to apply.

### Super blocks (parent / container blocks)

If the flashcard block is a SiYuan super block (its kramdown begins with `{{{<layout>`), the plugin **always** uses the structural QA approach:

- First child block → front
- Remaining child blocks (joined) → back

Cloze detection is intentionally **skipped** for super blocks. This prevents `==` inside a child code block (for example `if (i == 0 && j == 0)`) from being misread as a cloze marker on the merged container content.

### Separator-based QA (single block)

For a single non-super-block flashcard, a horizontal separator splits front and back:

- `---` (three or more dashes)
- `***` (three or more asterisks)

### Cloze (single block)

SiYuan highlight syntax is converted to Anki Cloze:

```md
The closest planet to the sun is ==Mercury==.
```

becomes

```text
The closest planet to the sun is {{c1::Mercury}}.
```

The cloze regex requires `==` to be adjacent to non-whitespace on both sides, matching SiYuan's own highlight rule. Inline `` `…` `` and fenced ```` ```…``` ```` code spans are masked before cloze detection, so `==` inside code never becomes a cloze marker.

### Fallback child block

For non-super-blocks that have multiple direct children (e.g. some list-shaped flashcards), the plugin also tries first-child-as-front, rest-as-back as a fallback after separator and cloze detection fail.

## Sync semantics

### SiYuan → Anki

- New flashcard in SiYuan → new note in Anki.
- Changed flashcard in SiYuan → mapped Anki note is updated.
- Flashcard removed from SiYuan → mapped Anki note is deleted (when sources are reliable; see *Deletion safety* below).

### Anki → SiYuan

Nothing. Editing or deleting an Anki note never touches SiYuan. If the SiYuan flashcard still exists on the next sync, the plugin may recreate or remap the Anki note.

### Deletion safety

The plugin only marks an Anki note for deletion when its flashcard sources (SQL `cards` table and / or flashcard block scan) are reliable. If those sources return empty or unreliable data, deletions are suppressed so that an Anki side is never wiped out by a transient SiYuan-side read failure.

## Deck routing by document path

Each flashcard's owning document path (`hPath`) is matched against your configured rules:

- `/English/Vocabulary` → `English::Vocab`
- `/Math/Linear Algebra` → `Math::LinearAlgebra`

Matching is `startsWith`. The first matching rule wins. If no rule matches, the default target deck is used.

## Template and field selection

The plugin does not assume any specific field layout. For each chosen note type it:

1. Reads the note type from Anki.
2. Fetches its field list.
3. Lets you pick the QA front / back fields (or Cloze text / extra fields) from dropdowns.

This avoids errors such as `cannot create note because it is empty` caused by manually typed field names.

## Asset link rewriting

When writing content to Anki, SiYuan `/assets/…` references are rewritten to absolute URLs against the current SiYuan host, so images and attachments resolve correctly from Anki's renderer.

## Usage

1. Start local Anki Desktop.
2. Ensure `AnkiConnect` is installed and enabled.
3. Open the plugin panel.
4. Click **Detect Local Connection**.
5. Click **Refresh Decks / Note Types**.
6. Choose the default deck.
7. Choose QA and Cloze note types.
8. Choose the target fields from the dropdowns.
9. (Optional) Add path-prefix → deck rules.
10. Click **Generate Sync Preview**.
11. Review added / updated / deleted / invalid items.
12. Click **Run Sync**.
13. (Optional) Return to Anki and run its normal sync to your account.

## Tags

Notes synced by this plugin carry two stable tags so they can be recovered and matched even if the local mapping file is lost:

- `siyuan-anki-linker` — plugin identity tag, used to locate all notes owned by the plugin.
- `siyuan-card:<cardID>` — per-card identity tag, used to relink a SiYuan flashcard to its existing Anki note.

A `siyuan` tag is also written for general filtering.

## Uninstall cleanup

A full uninstall removes the plugin's own persisted data:

- `settings.json`
- `mappings.json`

Disable / reload / upgrade does not touch this data, so routine development and version upgrades do not wipe your config.

## Build

```powershell
D:\Environment\nodejs22\npm.cmd install
D:\Environment\nodejs22\npx.cmd vite build
```

Generated output:

- `dist/`
- `package.zip`

See [CHANGELOG.md](./CHANGELOG.md) for version history and [develops.md](./develops.md) for development log.
