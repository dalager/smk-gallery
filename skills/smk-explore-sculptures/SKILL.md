---
name: smk-explore-sculptures
description: Explore the sculptures in SMK Open (Statens Museum for Kunst) that have a 3D scan - search by type, theme, height, material, artist or the original's museum, look up a single object, and check whether it can go into the virtual gallery. Use when asked what sculptures SMK has, to find candidates for a room or theme, to look up an object number such as KAS385 or KMS6004, or why a piece can or cannot be used.
---

# Explore SMK sculptures with 3D scans

SMK Open publishes about 370 objects with an STL scan, nearly all plaster casts of
antique and Renaissance sculpture (object numbers `KAS…`) plus some of SMK's own
works (`KMS…`). This skill finds and describes them. It does not change the project;
to put pieces into the gallery, use the `smk-design-exhibit` skill.

## Tool

`scripts/smk.mjs` in this skill's folder. Node 18 or later, no dependencies.
Run it from anywhere inside the project; it finds the project root itself.

```bash
node skills/smk-explore-sculptures/scripts/smk.mjs types
node skills/smk-explore-sculptures/scripts/smk.mjs search --usable --free-standing --unused --sort height
node skills/smk-explore-sculptures/scripts/smk.mjs search --q "michelangelo" --usable
node skills/smk-explore-sculptures/scripts/smk.mjs search --type statuegruppe
node skills/smk-explore-sculptures/scripts/smk.mjs search --q louvre --min-height 150 --json
node skills/smk-explore-sculptures/scripts/smk.mjs show KAS385 KAS66
```

`node …/smk.mjs help` lists every filter. The first run downloads the list of 3D
objects (four API pages) into `.cache/smk-3d-index.json`; later runs use that copy.
Pass `--refresh` when the user wants current data.

In the table, `*` after an object number means `config/sculptures.json` already uses
it, `MB` is the smallest STL on offer and `PD` is public domain.

## How to search

- **Search in Danish.** Titles, types and materials are Danish: Statue, Statuegruppe,
  Buste, Hoved, Relief, Torso; Gips (plaster), Marmor, Bronze; "Stående", "Siddende",
  "Liggende" (standing, seated, reclining). Translate the user's English into these.
  `--q` matches every word, so prefer one or two good words over a phrase.
- **Casts are about their originals.** For a `KAS` cast the interesting facts are the
  original's material and museum (`originalMaterial`, `originalOwner` in `show`):
  `--q vatican` finds nothing, `--q "pio clementino"` or `--q chiaramonti` does.
  The `artist` field holds the original sculptor when known (Michelangelo, Polyklet).
- **Start broad, then narrow.** `types` first if the user has no idea what exists;
  then `search` with `--usable --free-standing`; then `show` on the shortlist.
- **Use `--json`** when you need to group or count results yourself.

## Whether a piece is usable

`--usable` and the `usableProblems` list in `show` apply the rules the gallery's
asset pipeline needs. Explain them plainly when a piece is ruled out:

| Problem | Why it matters | Way round it |
|---|---|---|
| not public domain | The gallery is meant to be shareable | Leave it out (two such objects: KAS499, KMS5823) |
| no height in catalogue | The scan has no units; the height sets real-world scale | Usable only if the user accepts a guessed scale |
| no STL | Nothing to build from | A local STL could be named with `"source"` |
| STL above 45 MB | Slow to download; SMK's server drops long downloads | Fine if the user is patient |
| `/` in object number | The pipeline rejects it (e.g. Michelangelo's Medici tomb figures, `KAS112/2`) | Needs a small change to `scripts/build-assets.mjs` |

`--free-standing` drops reliefs, heads, busts, masks and fragments, which work badly
in the middle of a room. Busts and heads are still fine as accents: a colossal head
(KAS101, Caesar) or a head of David (KAS2232) holds a plinth well.

Things the metadata cannot tell you: scan quality (unfinished backs, holes) and which
way the scan faces. Say so when recommending a piece you have not seen built.

## Presenting results

Give a short table: object number, what it is (in English, with the Danish title if
useful), the original's museum or the artist, height. Link to the object page
(`url`, `https://open.smk.dk/artwork/image/<objectNumber>`) so the user can see the
photo. Mention anything that rules a piece out rather than silently dropping it.

API fields, endpoints and quirks are in `references/api.md`.
