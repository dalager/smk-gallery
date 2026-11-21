const SHOW_WITHIN = 5; // metres
const MIN_ALIGNMENT = Math.cos((28 * Math.PI) / 180); // within 28 degrees of the view centre

const MATERIAL_NAMES = {
  Gips: 'Plaster',
  Marmor: 'Marble',
  Bronze: 'Bronze',
  Sandsten: 'Sandstone',
  Diorit: 'diorite',
  Træ: 'wood',
};
const english = (name) => MATERIAL_NAMES[name] ?? name;

function line(text) {
  const p = document.createElement('p');
  p.textContent = text;
  return p;
}

function originalLine(original) {
  if (!original || !(original.technique || original.owner)) return null;
  const technique = original.technique ? english(original.technique).toLowerCase() : null;
  return `Original: ${[technique, original.owner].filter(Boolean).join(', ')}`;
}

/** Plaster with a known original elsewhere is a cast; otherwise it is the artist's own plaster. */
function materialLine(item) {
  const material = item.materials[0];
  if (!material) return null;
  return material === 'Gips' && item.original ? 'Plaster cast' : english(material);
}

function render(element, item) {
  const title = document.createElement('h2');
  title.textContent = item.title;

  const facts = [
    item.artists.join(', '),
    [materialLine(item), item.heightCm ? `${item.heightCm} cm` : null]
      .filter(Boolean)
      .join(' · '),
    originalLine(item.original),
  ].filter(Boolean);

  const source = document.createElement('p');
  const safeUrl = /^https:\/\//.test(item.url ?? '') ? item.url : null;
  if (safeUrl) {
    const link = document.createElement('a');
    link.href = safeUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = item.objectNumber;
    source.append(link);
  } else {
    source.append(item.objectNumber);
  }
  source.append(` · SMK Open${item.publicDomain ? ' · Public domain' : ''}`);

  element.replaceChildren(title, ...facts.map(line), source);
}

/**
 * Museum label for the piece the visitor is looking at. Pieces stand close
 * together across the aisle, so "nearest" alone often picks the one behind you.
 */
export function createLabel(element, placements) {
  let current = null;

  /**
   * @param {{x:number,z:number}} position visitor position
   * @param {{x:number,z:number}} forward unit view direction on the floor plane
   */
  function update(position, forward) {
    let best = null;
    let bestAlignment = MIN_ALIGNMENT;
    for (const placement of placements) {
      const dx = placement.x - position.x;
      const dz = placement.z - position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > SHOW_WITHIN || dist === 0) continue;
      const alignment = (dx * forward.x + dz * forward.z) / dist;
      if (alignment > bestAlignment) {
        best = placement;
        bestAlignment = alignment;
      }
    }
    if (best === current) return;
    current = best;
    element.hidden = !best;
    if (best) render(element, best.item);
  }

  return { update };
}
