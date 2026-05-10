# siyuan-ankiLinker

SiYuan flashcard sync plugin for local Anki.

- Plugin ID / manual install folder name: `siyuan-ankiLinker`
- Repository: <https://github.com/imiacc/siyuan-ankiLinker>
- Author: `imiacc`
- Current version: `0.1.5`

## Manual installation note

The repository name and the actual SiYuan plugin ID are both:

- `siyuan-ankiLinker`

When installing manually, make sure the plugin directory is named exactly:

- `siyuan-ankiLinker`

The plugin no longer includes compatibility support for the old `ankiLinker` plugin tag.
If you previously synced notes with that legacy tag, existing notes will not be discovered through that tag anymore after upgrading.
Newly created notes are tagged only with the current plugin tag.

## Sync architecture

This plugin uses the following path:

- SiYuan plugin → local `AnkiConnect` → local `Anki Desktop`
- Then `Anki Desktop` performs its own normal sync to your Anki account/server

Requirements:

1. `Anki Desktop` must be running
2. `Anki Desktop` must be logged in if you want cloud sync
3. `AnkiConnect` must be installed and enabled
4. This plugin talks to a local URL such as `http://127.0.0.1:8765`

## Features

- Uses SiYuan flashcard `cardID` as stable sync identity
- Manual sync from SiYuan to local Anki
- Incremental add / update / delete
- Separate note type selection for QA cards and Cloze cards
- Automatically reads field names from the selected Anki note type and lets you choose them from dropdowns
- Supports routing cards to different Anki decks based on SiYuan document path prefixes
- Sync preview, logs, and local mapping persistence

## Supported card parsing

### QA cards

Supported formats:

- A single block split by `---` or `***`
- Parent/super block QA: first child block is front, remaining child blocks are back

### Cloze cards

Use SiYuan highlight syntax:

```md README.md
The closest planet to the sun is ==Mercury==.
```

It becomes:

```text README.md
The closest planet to the sun is {{c1::Mercury}}.
```

## Sync direction and deletion behavior

### SiYuan → Anki

This plugin is **one-way sync**:

- If a flashcard is added in SiYuan, a note is created in Anki
- If a flashcard is changed in SiYuan, the mapped Anki note is updated
- If a flashcard disappears from SiYuan, the mapped Anki note is deleted

### Anki → SiYuan

No reverse writing is performed:

- Editing an Anki note does not update SiYuan content
- Deleting an Anki note does not delete SiYuan blocks
- If the SiYuan flashcard still exists, the plugin may recreate or remap it on the next sync

## Deck routing by path

The plugin reads each flashcard's SiYuan document path (`hPath`) and matches it against your configured path rules.

Example:

- `/English/Vocabulary` → `English::Vocab`
- `/Math/Linear Algebra` → `Math::LinearAlgebra`

Matching logic:

- first matching `startsWith` rule wins
- if no rule matches, the default deck is used

## Template and field selection

The plugin no longer assumes that:

- QA fields are always `Front / Back`
- Cloze fields are always `Text / Extra`

Instead it:

1. reads the selected Anki note type
2. fetches its field list
3. lets you pick the fields from dropdowns

This helps avoid errors like:

- `cannot create note because it is empty`

## Usage

1. Start local `Anki Desktop`
2. Ensure `AnkiConnect` is installed and enabled
3. Open the plugin panel
4. Detect local connection
5. Refresh decks/models
6. Choose the default deck
7. Choose QA and Cloze note types
8. Choose the target fields from dropdowns
9. Optionally add path-prefix-to-deck rules
10. Generate sync preview
11. Review added / updated / deleted / invalid items
12. Run sync
13. If needed, return to Anki and perform its normal sync

## Preview and note discovery

The plugin discovers its synced Anki notes by the current plugin tag only:

- `siyuan-anki-linker`

It no longer queries the legacy tag:

- `ankiLinker`

If you rely on older notes created only with the legacy tag, re-syncing from SiYuan may create fresh notes under the current tag.

## Uninstall cleanup

When the plugin is fully uninstalled, it removes its own persisted SiYuan plugin data files, including:

- `settings.json`
- `mappings.json`
- legacy `ankilinker-state.json`

This cleanup only happens during full uninstall, not on normal disable, reload, or update, so your settings will not be accidentally lost during routine development or upgrades.

## Build

Install dependencies:

```powershell README.md
D:\Environment\nodejs22\npm.cmd install
```

Build:

```powershell README.md
D:\Environment\nodejs22\npx.cmd vite build
```

Generated output:

- `dist/`
- `package.zip`

