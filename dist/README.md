# siyuan-ankiLinker

SiYuan flashcard sync plugin for local Anki.

- Plugin ID / manual install folder name: `siyuan-ankiLinker`
- Repository: <https://github.com/imiacc/siyuan-ankiLinker>
- Author: `imiacc`
- Current version: `0.1.7`

## Manual installation note

The repository name and the actual SiYuan plugin ID are both:

- `siyuan-ankiLinker`

When installing manually, make sure the plugin directory is named exactly:

- `siyuan-ankiLinker`

The plugin now works only with the current `siyuan-ankiLinker` identity and tag.
It does not read, migrate, or clean up data from older plugin variants.
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
- Config export/import from the top action area
- Deletion diagnostics to inspect whether mappings can be safely deleted
- Improved aligned path-rule summary rows with right-side edit/remove actions

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

## Uninstall cleanup

When the plugin is fully uninstalled, it removes its own persisted SiYuan plugin data files, including:

- `settings.json`
- `mappings.json`

This cleanup only happens during full uninstall, not on normal disable, reload, or update, so your settings will not be accidentally lost during routine development or upgrades.

## What changed in 0.1.7

- Fixed a cloze parsing bug where the old `==(.+?)==` regex was greedy across inline code: the `==` inside `` `needCnt == 0` `` was paired with the first `==` of a real highlight, so the two intended clozes `==O(m+n)==` and `==O(∣Σ∣)==` ended up wrapping the wrong spans and produced garbled Anki cards (`[...] data-ordinal=` fragments).
- Tightened the cloze regex to `==(\S(?:.*?\S)?)==`, which requires non-whitespace adjacent to `==`, matching SiYuan's own highlight syntax.
- Added inline / fenced code masking before cloze replacement, so `==` inside `` `...` `` or ``` ```...``` ``` is no longer treated as a cloze marker.
- Refactored `buildClozeText` and `buildClozePreview` (front/back) to share `applyClozeReplace`, keeping the three paths consistent.
- Rebuilt release artifacts.

## What changed in 0.1.6

- Added config export/import actions in the top toolbar area
- Added deletion diagnostics for mapping safety checks before delete decisions
- Improved path-to-deck rule summary alignment and actions layout
- Improved sync internals with snapshot/tag cache and batched update execution
- Improved Markdown asset link rewriting before writing content to Anki
- Updated uninstall cleanup to fully remove only current `siyuan-ankiLinker` plugin storage
- Updated README and changelog for the current publishable release

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

