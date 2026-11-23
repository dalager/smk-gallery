# SMK API notes

Public, no key. Docs: <https://www.smk.dk/article/smk-api/>. Browse with photos:
<https://open.smk.dk/art/advanced?q=*&filters=has_3d_file%3Atrue>.

## Endpoints

| Purpose | URL |
|---|---|
| Everything with a 3D file, paged | `https://api.smk.dk/api/v1/art/search/?keys=*&filters=[has_3d_file:true]&offset=0&rows=100` |
| Free-text search within those | `…/art/search/?keys=laokoon&filters=[has_3d_file:true]` |
| One object | `https://api.smk.dk/api/v1/art/?object_number=KAS385` |
| Object page with photo | `https://open.smk.dk/artwork/image/KAS385` |

Encode the brackets (`%5B`, `%5D`) when calling from code. `found` in a search reply
is the total; `rows` tops out at 100 per page.

## Fields that matter

| Field | Notes |
|---|---|
| `object_number` | `KAS…` = Royal Cast Collection (plaster casts), `KMS…` = SMK's own works |
| `titles[0].title` | Danish |
| `object_names[0].name` | Type: Statue, Buste, Hoved, Relief, Statuegruppe, Torso, … |
| `dimensions[]` | `{type, value, unit}`; type is `højde` / `bredde` / `dybde` (height / width / depth); unit usually `centimeter`, value a string |
| `materials`, `techniques` | Of this object, so `Gips` / `Gipsafstøbning` for casts |
| `production[].creator` | Artist; for casts, the original's sculptor when known |
| `original[0]` | For casts: `technique` (original material), `current_owner` (museum), `production_date_notes`, `object_history_note` (find spot) |
| `public_domain`, `rights` | Rights is a URL, usually the CC Public Domain Mark |
| `files_3D[]` | `{url, mime_type: "model/stl", file_size}`; pick the smallest; `file_size` is not always exact |
| `image_thumbnail` | IIIF JPEG of the object |
| `on_display` | Whether it is physically on show at SMK |

## Quirks

- The 3D download server closes connections after a few MB but honours `Range`
  requests; `scripts/download.mjs` resumes until the file is complete.
- Some records lack dimensions (Venus de Milo, KAS434).
- Catalogue width and depth include outstretched arms, so they overstate the
  footprint on the floor. The asset pipeline measures the real base from the scan.
