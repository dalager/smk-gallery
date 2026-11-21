const SHOW_WITHIN = 5; // metres
const MIN_ALIGNMENT = Math.cos((28 * Math.PI) / 180); // within 28 degrees of the view centre

function line(text) {
  const p = document.createElement('p');
  p.textContent = text;
  return p;
}

function originalLine(original) {
  if (!original || !(original.technique || original.owner)) return null;
  const technique = original.technique ? original.technique.toLowerCase() : null;
  return `Original: ${[technique, original.owner].filter(Boolean).join(', ')}`;
}

/**
 * Plaques are in Danish, like the catalogue data they are built from.
 * Plaster with a known original elsewhere is a cast; otherwise it is the artist's own plaster.
 */
function materialLine(item) {
  const material = item.materials[0];
  if (!material) return null;
  return material === 'Gips' && item.original ? 'Gipsafstøbning' : material;
}

/**
 * The words on a plaque, shared by the on-page label and the one drawn into videos.
 * @returns {{ title: string, facts: string[], objectNumber: string, credit: string, url: string|null }}
 */
export function plaqueText(item) {
  return {
    title: item.title,
    facts: [
      item.artists.join(', '),
      [materialLine(item), item.heightCm ? `${item.heightCm} cm` : null].filter(Boolean).join(' · '),
      originalLine(item.original),
    ].filter(Boolean),
    objectNumber: item.objectNumber,
    credit: ` · SMK Open${item.publicDomain ? ' · Public domain' : ''}`,
    url: /^https:\/\//.test(item.url ?? '') ? item.url : null,
  };
}

function render(element, item) {
  const text = plaqueText(item);
  const title = document.createElement('h2');
  title.textContent = text.title;

  const source = document.createElement('p');
  if (text.url) {
    const link = document.createElement('a');
    link.href = text.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = text.objectNumber;
    source.append(link);
  } else {
    source.append(text.objectNumber);
  }
  source.append(text.credit);

  element.replaceChildren(title, ...text.facts.map(line), source);
}

/**
 * Museum label for the piece the visitor is looking at. Pieces stand close
 * together across the aisle, so "nearest" alone often picks the one behind you.
 */
export function createLabel(element, placements) {
  let current = null;

  /** Puts up the plaque for a sculpture, or takes it down with null. */
  function show(item) {
    if (item === current) return;
    current = item;
    element.hidden = !item;
    if (item) render(element, item);
  }

  /**
   * Picks the plaque from where the visitor stands and looks.
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
    show(best?.item ?? null);
  }

  return { update, show };
}
