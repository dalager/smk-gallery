---
name: smk-design-exhibit
description: Design or rearrange the exhibition rooms of the SMK virtual sculpture gallery - choose a theme, curate sculptures from SMK Open into rooms, name and colour the rooms, write config/sculptures.json, check it fits the floor plan, build the models and look at the result. Use when asked to create a new exhibition, add or remove a room, move, add or swap sculptures, retitle a room, change wall colours, or fix a piece that comes out lying down or facing the wall.
---

# Design exhibit rooms

The gallery is a row of skylit rooms joined by doorways on one axis. Everything a
curator decides lives in one file, `config/sculptures.json`: the rooms (in walking
order) and the sculptures in each. The asset pipeline and the viewer derive the rest,
including placement, plaques and drone tours. This skill is the workflow for changing
that file well.

To find sculptures, use the `smk-explore-sculptures` skill and its
`scripts/smk.mjs`. This skill adds `scripts/check-exhibit.mjs` and the floor-plan
facts in `references/floor-plan.md`.

## Workflow

### 1. Get the brief

Settle, briefly, before searching:
- **Theme or story**: a period, a sculptor, a subject (gods, animals, the body in
  motion), or a revision of the current show.
- **Size**: number of rooms and pieces. Six pieces per room is the house standard;
  two to eight works. More rooms make longer tours (the grand tour is about 15 s a
  room).
- **What stays**: whether to keep the current rooms and change some, or start over.

If the user just says "make an exhibition about X", propose sizes yourself.

### 2. Shortlist

```bash
node skills/smk-explore-sculptures/scripts/smk.mjs search --usable --free-standing --q "<word>"
node skills/smk-explore-sculptures/scripts/smk.mjs show <numbers…>
```

Curate by the rules the current show was built on:
- **Free-standing first.** Statues and groups people can walk round; heads and busts
  only as deliberate accents.
- **Usable data.** Public domain, catalogue height, an STL the pipeline accepts
  (`--usable` checks this).
- **Variety within a room.** Mix standing, seated, reclining, groups and animals, and
  heights, so the room does not read as a line-up of identical figures.
- **Rooms that hang together.** Each room is one idea that can be named in a few
  words. Order rooms as a walk: an arc in time or in story, the strongest room early.
- **Casts and originals.** `KAS` pieces are plaster casts; their story is the
  original (material, museum). `KMS` pieces are SMK's own works in bronze, marble or
  stone. Mixing the two in one room is possible but should be intended.

### 3. Propose before editing

Show the plan as a table per room (room title, object number, what it is, original
or artist, height) and say:
- the reasoning in two or three bullets,
- what was left out on purpose and why (rights, no height, `/` in the number),
- that scan quality and orientation are unchecked until built.

Wait for the user's go-ahead before changing `config/sculptures.json`.

### 4. Write the config

Read `config/sculptures.json` first and edit it in place; keep `lods` as it is.

```json
{ "id": "rome", "name": "Romerne og deres dyr", "wallColor": "#6b5a34" }
{ "objectNumber": "KAS2157", "room": "rome", "up": "z" }
```

- **Rooms are in walking order.** The first is the entrance.
- **Room `id`**: short, lower case, stable (it links sculptures to rooms).
- **Room `name`** is painted above the doorway in large letters. Write it in Danish
  (the plaques come from SMK's Danish data), plain and descriptive, at most about
  30 characters. No wordplay or commentary; the user has already removed an ellipsis
  for being too much.
- **`wallColor`**: deep, muted, a different hue per room so each doorway announces a
  change; existing ones are in `references/floor-plan.md`. Plaster casts are white,
  so walls should be dark enough to set them off.
- **Sculpture order inside a room** alternates sides: 1st left, 2nd right, 3rd left,
  … from the entrance to the far wall. Put the piece meant to be seen first at the
  front and pair pieces that answer each other across the aisle.
- **`up`** (`"x"`, `"y"`, `"z"`) and **`rotateY`** (degrees) correct a scan's
  orientation; leave them out until a build shows they are needed, but keep the ones
  already in the file when moving a piece between rooms.

### 5. Check

```bash
node skills/smk-design-exhibit/scripts/check-exhibit.mjs
```

It validates the file, looks every object up in the SMK API, and estimates whether
each side of each room has wall enough for its pieces and keeps the aisle clear. Fix
errors. Warnings about fit come from catalogue sizes for pieces not built yet, which
overstate them; rerun after building for the measured numbers. `--offline` skips the
API.

### 6. Build

The checker prints the command for pieces not yet built, e.g.

```bash
npm run assets -- KAS353 KAS1026
```

Each new piece downloads about 20 MB from SMK (slow; the server drops connections and
the script resumes). Pieces only moved between rooms need no rebuild of their model,
but run `npm run assets -- <any one number>` or the full `npm run assets` so
`public/gallery.json` picks up the new rooms. A full run re-processes everything from
the cache in `.cache/`.

### 7. Look, and fix orientation

`npm run dev`, then walk through, or jump to a piece with
`?cam=x,z,yaw` (coordinates in `references/floor-plan.md`). For each new piece check:
- **Lying down or upside down**: set `"up"` to the axis that should point up
  (try `"z"` first, then `"x"`), rebuild that piece.
- **Facing the wall or sideways**: set `"rotateY": 90`, `-90` or `180`, rebuild.
- **Wrong size**: the catalogue height is probably missing or wrong; say so.

If you cannot see the browser yourself, ask the user to look and report, or to take
a screenshot with the viewer's screenshot key.

### 8. Finish

Run `npm test` and the checker once more. Tours follow the new layout automatically;
mention that the quick tour (about 45 s) gets brisker with more rooms. Summarise
what changed per room.

## Do not

- Do not touch `src/lib/layout.js` to make a crowded room fit; move pieces instead,
  unless the user asks for a different floor plan.
- Do not use object numbers with `/` unless the user wants the pipeline changed first.
- Do not invent facts for plaques; they come from SMK's catalogue at build time.
