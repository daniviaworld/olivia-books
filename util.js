// Utilidades compartidas: sanitizado de HTML, imágenes e hidratación.

const ALLOWED = new Set(['P','DIV','BR','H1','H2','H3','H4','STRONG','B','EM','I','U','S','UL','OL','LI','BLOCKQUOTE','IMG','HR','SPAN']);
const DROP = new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','LINK','META','NOSCRIPT','TEMPLATE']);
const CLASSES = new Set(['sz-s','sz-m','sz-l','pagebreak']);
const ALIGN = new Set(['left','center','right','justify']);

function cleanNode(n) {
  if (n.nodeType === 3) return document.createTextNode(n.textContent);
  if (n.nodeType !== 1) return null;
  if (DROP.has(n.tagName)) return null;
  if (!ALLOWED.has(n.tagName)) {
    const f = document.createDocumentFragment();
    n.childNodes.forEach(c => { const r = cleanNode(c); if (r) f.append(r); });
    return f;
  }
  const e = document.createElement(n.tagName.toLowerCase());
  if (n.tagName === 'IMG') {
    const id = n.getAttribute('data-img');
    if (!id || !/^[A-Za-z0-9_-]{1,40}$/.test(id)) return null;
    e.setAttribute('data-img', id);
  }
  (n.getAttribute('class') || '').split(/\s+/).forEach(c => { if (CLASSES.has(c)) e.classList.add(c); });
  const ta = (n.style && n.style.textAlign) || '';
  if (ALIGN.has(ta)) e.style.textAlign = ta;
  if (n.tagName !== 'IMG' && n.tagName !== 'BR' && n.tagName !== 'HR') {
    n.childNodes.forEach(c => { const r = cleanNode(c); if (r) e.append(r); });
  }
  return e;
}

/** Devuelve HTML limpio (solo etiquetas permitidas, sin scripts ni eventos). */
export function sanitize(html) {
  const d = new DOMParser().parseFromString(String(html || ''), 'text/html');
  const out = document.createElement('div');
  d.body.childNodes.forEach(n => { const c = cleanNode(n); if (c) out.append(c); });
  return out.innerHTML;
}

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** Rellena el src de las imágenes con los datos guardados en Firestore. */
export function hydrate(root, imgs) {
  root.querySelectorAll('img[data-img]').forEach(i => {
    const it = imgs.get(i.getAttribute('data-img'));
    i.src = it ? it.data : '';
    if (!i.alt) i.alt = 'Ilustración';
  });
}

/** Quita los src (datos pesados) antes de guardar el capítulo. */
export function dehydrate(html) {
  const d = document.createElement('div');
  d.innerHTML = sanitize(html);
  d.querySelectorAll('img').forEach(i => i.removeAttribute('src'));
  return d.innerHTML;
}

/** Comprime una imagen a JPEG para que quepa en Firestore (<1 MB por documento). */
export async function compressImage(file, maxSide = 1200, quality = 0.78) {
  const bmp = await createImageBitmap(file);
  let { width: w, height: h } = bmp;
  const k = Math.min(1, maxSide / Math.max(w, h));
  w = Math.round(w * k); h = Math.round(h * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  let q = quality, data = c.toDataURL('image/jpeg', q);
  while (data.length > 850000 && q > 0.35) { q -= 0.1; data = c.toDataURL('image/jpeg', q); }
  return { data, w, h };
}

export const wordCount = html => {
  const d = document.createElement('div'); d.innerHTML = html;
  const t = (d.textContent || '').trim();
  return t ? t.split(/\s+/).length : 0;
};

/* =====================================================================
   🎨 Arte incluido en la app: portadas, ilustraciones (todo dibujado a mano en SVG)
   ===================================================================== */
export const svgUrl = s => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
const svg = (w, h, inner) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${inner}</svg>`;
const pine = (x, y, s) => `<g><polygon points="${x},${y - 110 * s} ${x - 45 * s},${y - 30 * s} ${x + 45 * s},${y - 30 * s}" fill="#145a43"/><polygon points="${x},${y - 70 * s} ${x - 58 * s},${y + 20 * s} ${x + 58 * s},${y + 20 * s}" fill="#145a43"/><rect x="${x - 8 * s}" y="${y + 20 * s}" width="${16 * s}" height="${30 * s}" fill="#4e342e"/></g>`;
const flower = (cx, cy, pr, pc, cc) => `<g fill="${pc}">${[0, 1, 2, 3, 4, 5, 6, 7].map(i => { const a = i * Math.PI / 4; return `<circle cx="${cx + Math.cos(a) * pr}" cy="${cy + Math.sin(a) * pr}" r="${pr * 0.7}"/>`; }).join('')}</g><circle cx="${cx}" cy="${cy}" r="${pr * 0.8}" fill="${cc}"/>`;
const stars = pts => pts.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff"/>`).join('');
const spark = (x, y, s, c) => `<path d="M${x} ${y - s} L${x + s * .25} ${y - s * .25} L${x + s} ${y} L${x + s * .25} ${y + s * .25} L${x} ${y + s} L${x - s * .25} ${y + s * .25} L${x - s} ${y} L${x - s * .25} ${y - s * .25}Z" fill="${c}"/>`;
const cloud = (x, y, s, c = '#fff') => `<g fill="${c}"><ellipse cx="${x}" cy="${y}" rx="${70 * s}" ry="${26 * s}"/><circle cx="${x - 24 * s}" cy="${y - 20 * s}" r="${28 * s}"/><circle cx="${x + 18 * s}" cy="${y - 26 * s}" r="${34 * s}"/></g>`;

export const COVERS = [
  { id: 'bosque', name: 'Bosque mágico', fg: '#fff3c4', outline: 'rgba(0,0,30,.45)', svg: svg(600, 900,
    `<rect width="600" height="900" fill="#172554"/>${stars([[70, 380, 3], [180, 430, 2.5], [330, 360, 3], [545, 310, 3], [420, 480, 2.5], [110, 530, 2], [250, 470, 2]])}
    <circle cx="480" cy="410" r="56" fill="#fff3c4"/><circle cx="502" cy="394" r="50" fill="#172554"/>
    <path d="M0 640 Q150 540 300 620 T600 590 V900 H0Z" fill="#2f8f6b"/>${pine(90, 640, 1.2)}${pine(190, 670, 0.8)}${pine(500, 650, 1.1)}${pine(410, 690, 0.7)}
    <path d="M0 770 Q300 690 600 780 V900 H0Z" fill="#1b5e45"/>
    <g fill="#ffe58a"><circle cx="150" cy="560" r="12" opacity=".25"/><circle cx="150" cy="560" r="4"/><circle cx="300" cy="700" r="12" opacity=".25"/><circle cx="300" cy="700" r="4"/><circle cx="440" cy="560" r="12" opacity=".25"/><circle cx="440" cy="560" r="4"/><circle cx="90" cy="780" r="4"/><circle cx="520" cy="800" r="4"/></g>`) },
  { id: 'mar', name: 'Mar y barco', fg: '#0b3a66', outline: 'rgba(255,255,255,.75)', svg: svg(600, 900,
    `<rect width="600" height="900" fill="#8ed1fc"/><circle cx="450" cy="430" r="96" fill="#fff3c4" opacity=".6"/><circle cx="450" cy="430" r="70" fill="#ffd54f"/>${cloud(120, 420, 1)}${cloud(470, 330, .8)}
    <path d="M0 640 Q75 610 150 640 T300 640 T450 640 T600 640 V900 H0Z" fill="#3aa0e0"/>
    <rect x="238" y="470" width="8" height="170" fill="#6d4c2f"/><polygon points="246,480 246,630 340,630" fill="#fff"/><polygon points="238,500 238,630 160,630" fill="#ffeab0"/><polygon points="238,470 238,500 202,485" fill="#ff5c8a"/><path d="M150 635 L335 635 L300 700 L185 700Z" fill="#ff7a59"/>
    <path d="M0 720 Q100 690 200 720 T400 720 T600 720 V900 H0Z" fill="#2579c4"/><path d="M0 810 Q120 780 240 810 T480 810 T720 810 V900 H0Z" fill="#1b5fa8"/>`) },
  { id: 'espacio', name: 'Espacio', fg: '#ffffff', outline: 'rgba(0,0,40,.5)', svg: svg(600, 900,
    `<rect width="600" height="900" fill="#1b1464"/>${stars([[60, 400, 2], [150, 380, 3], [260, 420, 2], [330, 360, 2.5], [520, 380, 3], [570, 470, 2], [90, 640, 2.5], [300, 840, 2], [540, 840, 3], [480, 440, 2]])}${spark(500, 420, 14, '#ffe58a')}${spark(90, 470, 10, '#ffe58a')}
    <g transform="rotate(-18 400 600)"><ellipse cx="400" cy="600" rx="190" ry="44" fill="none" stroke="#ffd54f" stroke-width="14"/></g>
    <circle cx="400" cy="600" r="120" fill="#ff8fc7"/><path d="M290 570 Q400 540 510 570 M285 620 Q400 590 515 620" stroke="#ff6eb0" stroke-width="12" fill="none"/>
    <g transform="rotate(-18 400 600)"><path d="M210 600 A190 44 0 0 0 590 600" fill="none" stroke="#ffd54f" stroke-width="14"/></g>
    <circle cx="130" cy="740" r="56" fill="#6ee7b7"/><circle cx="110" cy="725" r="10" fill="#34c79a"/><circle cx="150" cy="765" r="14" fill="#34c79a"/>
    <g transform="translate(170 560) rotate(28) scale(1.25)"><polygon points="-14,22 0,76 14,22" fill="#ffd54f"/><polygon points="-30,0 -58,44 -30,26" fill="#ff5c8a"/><polygon points="30,0 58,44 30,26" fill="#ff5c8a"/><path d="M0 -92 Q32 -52 32 24 L-32 24 Q-32 -52 0 -92Z" fill="#fff"/><circle cx="0" cy="-34" r="13" fill="#8ed1fc" stroke="#5b3fd1" stroke-width="4"/></g>`) },
  { id: 'castillo', name: 'Castillo', fg: '#3b2a9c', outline: 'rgba(255,255,255,.75)', svg: svg(600, 900,
    `<rect width="600" height="900" fill="#bfe3ff"/>${cloud(110, 420, .9)}${cloud(500, 380, 1)}<path d="M0 760 Q300 660 600 760 V900 H0Z" fill="#7ed39a"/>
    <g transform="translate(0 70)"><rect x="170" y="520" width="260" height="190" fill="#d9d4f0"/><rect x="140" y="470" width="70" height="240" fill="#c9c2ec"/><rect x="390" y="470" width="70" height="240" fill="#c9c2ec"/><rect x="255" y="400" width="90" height="170" fill="#d9d4f0"/>
    <polygon points="132,470 218,470 175,395" fill="#ff5c8a"/><polygon points="382,470 468,470 425,395" fill="#ff5c8a"/><polygon points="245,400 355,400 300,300" fill="#ff5c8a"/>
    <rect x="298" y="262" width="4" height="40" fill="#6d4c2f"/><polygon points="302,262 302,284 338,273" fill="#ffd54f"/>
    <path d="M270 710 V640 Q300 600 330 640 V710Z" fill="#5b3fd1"/><rect x="165" y="520" width="20" height="26" rx="10" fill="#5b3fd1"/><rect x="415" y="520" width="20" height="26" rx="10" fill="#5b3fd1"/><rect x="290" y="440" width="20" height="30" rx="10" fill="#5b3fd1"/></g>
    <path d="M0 830 Q300 770 600 840 V900 H0Z" fill="#5cc487"/>`) },
  { id: 'jardin', name: 'Jardín de flores', fg: '#a02c63', outline: 'rgba(255,255,255,.8)', svg: svg(600, 900,
    `<rect width="600" height="900" fill="#fff1f6"/><circle cx="520" cy="400" r="46" fill="#ffd54f" opacity=".7"/>
    <g stroke="#3aa76d" stroke-width="10" fill="none" stroke-linecap="round"><path d="M150 680 Q140 760 150 860"/><path d="M330 620 Q350 740 330 860"/><path d="M470 730 Q480 800 470 860"/></g>
    <ellipse cx="120" cy="770" rx="34" ry="14" fill="#3aa76d" transform="rotate(-25 120 770)"/><ellipse cx="360" cy="750" rx="38" ry="15" fill="#3aa76d" transform="rotate(25 360 750)"/>
    ${flower(150, 640, 42, '#ff8fc7', '#ffd54f')}${flower(330, 560, 55, '#ffb86b', '#ff5c8a')}${flower(470, 700, 38, '#b79cff', '#ffe58a')}
    <g transform="translate(300 400)"><ellipse cx="-34" cy="-14" rx="38" ry="26" fill="#ff9ccf" transform="rotate(-25 -34 -14)"/><ellipse cx="34" cy="-14" rx="38" ry="26" fill="#ff9ccf" transform="rotate(25 34 -14)"/><ellipse cx="-26" cy="26" rx="28" ry="20" fill="#b79cff" transform="rotate(25 -26 26)"/><ellipse cx="26" cy="26" rx="28" ry="20" fill="#b79cff" transform="rotate(-25 26 26)"/><rect x="-5" y="-30" width="10" height="72" rx="5" fill="#5b3fd1"/><path d="M-2 -30 Q-16 -56 -26 -58 M2 -30 Q16 -56 26 -58" stroke="#5b3fd1" stroke-width="3" fill="none"/></g>
    <path d="M0 830 Q150 790 300 830 T600 820 V900 H0Z" fill="#8fdcab"/>`) },
  { id: 'montanas', name: 'Montañas', fg: '#4a2fc4', outline: 'rgba(255,255,255,.75)', svg: svg(600, 900,
    `<rect width="600" height="900" fill="#ffe2b8"/><circle cx="300" cy="570" r="140" fill="#ffb878" opacity=".55"/><circle cx="300" cy="570" r="105" fill="#ff9f5a"/>
    <polygon points="0,730 150,520 280,650 400,480 600,710 600,900 0,900" fill="#8c7ae6"/><polygon points="120,560 150,520 180,560 165,556 150,570 135,556" fill="#fff"/><polygon points="372,525 400,480 430,525 414,520 400,534 386,520" fill="#fff"/>
    <polygon points="0,810 200,610 360,790 480,650 600,800 600,900 0,900" fill="#5b3fd1"/><polygon points="168,642 200,610 232,642 216,638 200,652 184,638" fill="#fff"/>
    <path d="M0 830 Q300 790 600 840 V900 H0Z" fill="#2e9e6b"/>${pine(90, 830, .6)}${pine(150, 850, .45)}${pine(520, 840, .6)}
    <path d="M120 400 q14 -14 28 0 q14 -14 28 0 M440 360 q10 -10 20 0 q10 -10 20 0" stroke="#4a2fc4" stroke-width="4" fill="none" stroke-linecap="round"/>`) },
  { id: 'arcoiris', name: 'Arcoíris', fg: '#e0457b', outline: 'rgba(255,255,255,.85)', svg: svg(600, 900,
    `<rect width="600" height="900" fill="#fff7d6"/>${['#ff5c5c', '#ff9f5a', '#ffd54f', '#5cc487', '#4aa3ff', '#9b6bff'].map((c, i) => `<path d="M${300 - (290 - i * 36)} 720 A${290 - i * 36} ${290 - i * 36} 0 0 1 ${300 + (290 - i * 36)} 720" fill="none" stroke="${c}" stroke-width="38"/>`).join('')}
    ${cloud(95, 740, 1.2)}${cloud(505, 740, 1.2)}${spark(90, 420, 16, '#ffd54f')}${spark(520, 470, 12, '#ff9ccf')}${spark(300, 400, 10, '#9b6bff')}
    <path d="M0 830 Q150 790 300 830 T600 820 V900 H0Z" fill="#bfe9c9"/>`) }
];

const ill = inner => svg(200, 200, inner);
export const ILLUS = [
  { id: 'arbol', name: 'Árbol', svg: ill(`<rect x="90" y="120" width="20" height="62" rx="4" fill="#8d5a3b"/><circle cx="100" cy="85" r="52" fill="#3aa76d"/><circle cx="68" cy="108" r="34" fill="#2e9e6b"/><circle cx="132" cy="108" r="34" fill="#2e9e6b"/><circle cx="100" cy="60" r="30" fill="#5cc487"/><circle cx="85" cy="88" r="5" fill="#ff5c8a"/><circle cx="120" cy="98" r="5" fill="#ff5c8a"/><circle cx="110" cy="66" r="5" fill="#ff5c8a"/>`) },
  { id: 'flor', name: 'Flor', svg: ill(`<path d="M100 110 Q95 150 100 188" stroke="#3aa76d" stroke-width="8" fill="none" stroke-linecap="round"/><ellipse cx="78" cy="156" rx="22" ry="9" fill="#3aa76d" transform="rotate(-30 78 156)"/><ellipse cx="124" cy="140" rx="22" ry="9" fill="#3aa76d" transform="rotate(30 124 140)"/>${flower(100, 80, 28, '#ff8fc7', '#ffd54f')}`) },
  { id: 'sol', name: 'Sol', svg: ill(`${[...Array(12)].map((_, i) => { const a = i * Math.PI / 6; return `<line x1="${100 + Math.cos(a) * 58}" y1="${100 + Math.sin(a) * 58}" x2="${100 + Math.cos(a) * 82}" y2="${100 + Math.sin(a) * 82}" stroke="#ffb300" stroke-width="9" stroke-linecap="round"/>`; }).join('')}<circle cx="100" cy="100" r="46" fill="#ffd54f"/><circle cx="84" cy="92" r="5" fill="#6d4c2f"/><circle cx="116" cy="92" r="5" fill="#6d4c2f"/><path d="M80 112 Q100 134 120 112" stroke="#6d4c2f" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="76" cy="108" r="7" fill="#ff9f5a" opacity=".6"/><circle cx="124" cy="108" r="7" fill="#ff9f5a" opacity=".6"/>`) },
  { id: 'luna', name: 'Luna', svg: ill(`<defs><mask id="m"><rect width="200" height="200" fill="#fff"/><circle cx="128" cy="86" r="62" fill="#000"/></mask></defs><circle cx="92" cy="104" r="72" fill="#ffd54f" mask="url(#m)"/>${spark(150, 50, 14, '#ffd54f')}${spark(165, 130, 9, '#ffd54f')}${spark(125, 170, 7, '#ffd54f')}`) },
  { id: 'estrella', name: 'Estrella', svg: ill(`<polygon points="${[...Array(10)].map((_, i) => { const a = (-90 + 36 * i) * Math.PI / 180, r = i % 2 ? 36 : 84; return `${(100 + Math.cos(a) * r).toFixed(1)},${(108 + Math.sin(a) * r).toFixed(1)}`; }).join(' ')}" fill="#ffd54f" stroke="#f5b800" stroke-width="5" stroke-linejoin="round"/><circle cx="86" cy="104" r="4" fill="#6d4c2f"/><circle cx="114" cy="104" r="4" fill="#6d4c2f"/><path d="M88 120 Q100 130 112 120" stroke="#6d4c2f" stroke-width="4" fill="none" stroke-linecap="round"/>`) },
  { id: 'casita', name: 'Casita', svg: ill(`<rect x="128" y="52" width="16" height="36" fill="#b4aadc"/><rect x="50" y="95" width="100" height="78" fill="#ffe0b2"/><polygon points="38,100 100,45 162,100" fill="#ff5c8a"/><rect x="88" y="126" width="26" height="47" rx="3" fill="#8d5a3b"/><rect x="60" y="110" width="22" height="22" rx="3" fill="#8ed1fc"/><rect x="118" y="110" width="22" height="22" rx="3" fill="#8ed1fc"/><circle cx="108" cy="150" r="2.5" fill="#ffd54f"/>`) },
  { id: 'nube', name: 'Nube', svg: ill(`<g fill="#9ccaf2"><ellipse cx="100" cy="124" rx="76" ry="34"/><circle cx="66" cy="100" r="36"/><circle cx="112" cy="88" r="46"/><circle cx="144" cy="112" r="30"/></g><g fill="#e3f2ff"><ellipse cx="100" cy="122" rx="70" ry="30"/><circle cx="66" cy="100" r="32"/><circle cx="112" cy="88" r="42"/><circle cx="144" cy="112" r="26"/></g>`) },
  { id: 'mariposa', name: 'Mariposa', svg: ill(`<ellipse cx="66" cy="78" rx="44" ry="30" fill="#ff9ccf" transform="rotate(-25 66 78)"/><ellipse cx="134" cy="78" rx="44" ry="30" fill="#ff9ccf" transform="rotate(25 134 78)"/><ellipse cx="74" cy="128" rx="32" ry="22" fill="#b79cff" transform="rotate(25 74 128)"/><ellipse cx="126" cy="128" rx="32" ry="22" fill="#b79cff" transform="rotate(-25 126 128)"/><circle cx="62" cy="76" r="8" fill="#fff" opacity=".7"/><circle cx="138" cy="76" r="8" fill="#fff" opacity=".7"/><rect x="94" y="64" width="12" height="84" rx="6" fill="#5b3fd1"/><path d="M98 66 Q84 40 72 38 M102 66 Q116 40 128 38" stroke="#5b3fd1" stroke-width="4" fill="none" stroke-linecap="round"/>`) },
  { id: 'corazon', name: 'Corazón', svg: ill(`<path d="M100 172 C16 112 28 38 80 44 C95 46 100 60 100 60 C100 60 105 46 120 44 C172 38 184 112 100 172Z" fill="#ff5c8a"/><ellipse cx="66" cy="68" rx="14" ry="9" fill="#fff" opacity=".45" transform="rotate(-30 66 68)"/>`) },
  { id: 'castillo', name: 'Castillo', svg: ill(`<rect x="62" y="96" width="76" height="76" fill="#d9d4f0"/><rect x="40" y="80" width="30" height="92" fill="#c9c2ec"/><rect x="130" y="80" width="30" height="92" fill="#c9c2ec"/><polygon points="36,80 74,80 55,48" fill="#ff5c8a"/><polygon points="126,80 164,80 145,48" fill="#ff5c8a"/><polygon points="84,96 116,96 100,60" fill="#ff5c8a"/><rect x="99" y="42" width="2.5" height="20" fill="#6d4c2f"/><polygon points="101.5,42 101.5,52 116,47" fill="#ffd54f"/><path d="M88 172 V140 Q100 124 112 140 V172Z" fill="#5b3fd1"/><rect x="48" y="104" width="14" height="18" rx="7" fill="#5b3fd1"/><rect x="138" y="104" width="14" height="18" rx="7" fill="#5b3fd1"/>`) },
  { id: 'pez', name: 'Pez', svg: ill(`<polygon points="140,100 186,64 186,136" fill="#ff7a59"/><ellipse cx="92" cy="100" rx="58" ry="40" fill="#ff9f5a"/><path d="M80 62 Q100 36 118 64Z" fill="#ff7a59"/><path d="M96 78 Q112 100 96 122" stroke="#ffb878" stroke-width="6" fill="none" stroke-linecap="round"/><circle cx="62" cy="92" r="9" fill="#fff"/><circle cx="60" cy="92" r="4.5" fill="#333"/><path d="M48 112 Q58 120 68 114" stroke="#c25b34" stroke-width="4" fill="none" stroke-linecap="round"/><g fill="none" stroke="#8ed1fc" stroke-width="3"><circle cx="30" cy="60" r="7"/><circle cx="46" cy="40" r="5"/></g>`) },
  { id: 'cohete', name: 'Cohete', svg: ill(`<g transform="translate(100 104) rotate(35)"><polygon points="-14,44 0,92 14,44" fill="#ffd54f"/><polygon points="-30,22 -56,66 -30,48" fill="#ff5c8a"/><polygon points="30,22 56,66 30,48" fill="#ff5c8a"/><path d="M0 -76 Q32 -36 32 46 L-32 46 Q-32 -36 0 -76Z" fill="#fff" stroke="#d9d4f0" stroke-width="3"/><circle cx="0" cy="-18" r="13" fill="#8ed1fc" stroke="#5b3fd1" stroke-width="4"/></g>${spark(40, 40, 10, '#ffd54f')}${spark(168, 150, 8, '#ff9ccf')}`) }
];

function wrapText(ctx, text, maxW) {
  const words = String(text || '').split(/\s+/).filter(Boolean), lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur); return lines;
}
async function loadSvg(s) { const i = new Image(); i.src = svgUrl(s); await i.decode(); return i; }

/** Dibuja una portada de la app con el título y la autora encima. Devuelve un JPEG (data URL). */
export async function renderCover(d, title, author, W = 600, H = 900, q = 0.85) {
  const img = await loadSvg(d.svg), k = W / 600;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  let fs = 66 * k, lines;
  for (;;) { ctx.font = `700 ${fs}px Georgia, 'Times New Roman', serif`; lines = wrapText(ctx, title || 'Mi libro', W - 100 * k); if (lines.length <= 4 || fs <= 26 * k) break; fs -= 4 * k; }
  const lh = fs * 1.2, top = 190 * k - (lines.length * lh) / 2 + lh / 2;
  lines.forEach((ln, i) => { const y = top + i * lh; ctx.lineWidth = fs * 0.16; ctx.strokeStyle = d.outline; ctx.strokeText(ln, W / 2, y); ctx.fillStyle = d.fg; ctx.fillText(ln, W / 2, y); });
  if (author) { ctx.font = `italic 600 ${30 * k}px Georgia, serif`; ctx.lineWidth = 5 * k; ctx.strokeStyle = d.outline; ctx.strokeText(author, W / 2, H - 46 * k); ctx.fillStyle = d.fg; ctx.fillText(author, W / 2, H - 46 * k); }
  return c.toDataURL('image/jpeg', q);
}

/** Convierte una ilustración en PNG con fondo transparente, lista para guardarla como imagen del libro. */
export async function renderIllus(il, size = 500) {
  const img = await loadSvg(il.svg);
  const c = document.createElement('canvas'); c.width = c.height = size;
  c.getContext('2d').drawImage(img, 0, 0, size, size);
  return { data: c.toDataURL('image/png'), w: size, h: size, key: il.id };
}

/* =====================================================================
   ✒️ Pluma: el ayudante de chat (preguntas y respuestas guiadas, sin internet)
   ===================================================================== */
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const pick = a => a[Math.floor(Math.random() * a.length)];
const IDEAS = [
  'Tu personaje encuentra una puerta secreta en el jardín. ¿Qué hay detrás? 🚪',
  '¿Y si un día los animales del bosque pudieran hablar? ¿Qué le dirían a tu personaje? 🦊',
  'Tu personaje recibe una carta sin nombre. ¿Quién la ha escrito y qué dice? ✉️',
  'Imagina que tu personaje encuentra un mapa del tesoro dentro de un libro viejo. 🗺️',
  'Un día se despierta y tiene un superpoder muy pequeño. ¿Cuál es? ✨',
  '¿Y si llega un nuevo amigo al pueblo y es muy distinto a todos? Cuenta cómo se hacen amigos. 🤝',
  'Escribe qué pasa en una noche en la que la luna se cae del cielo. 🌙',
  'Tu personaje pierde algo muy importante. ¿Cómo lo busca? ¿Quién le ayuda? 🔍',
  'Hay un ruido misterioso en el desván. ¿Qué es? 🏠',
  'Cuenta el mejor cumpleaños de tu personaje… y qué sale mal. 🎂'
];
const TIPS = [
  'Cuenta lo que se ve, se oye y se huele. Por ejemplo: “El bosque olía a pino y se oía el río”. 🌲',
  'Dale un nombre a cada personaje y di cómo es: ¿es valiente?, ¿es despistado?, ¿tiene miedo a algo? 🦸',
  'Hablar hace la historia más viva. Prueba un diálogo: cada vez que alguien habla, empieza una línea nueva. 💬',
  'Al empezar un capítulo, cuenta algo que despierte curiosidad. ¡Que el lector quiera seguir leyendo! 👀',
  'No repitas siempre la misma palabra. Si has puesto “bonito”, prueba con “precioso” o “brillante”. 🎨',
  'Cada capítulo puede acabar con una pregunta o un misterio que se resuelva en el siguiente. 🕵️',
  'Un párrafo es un trozo de texto sobre una idea. Cuando cambias de idea, pulsa Enter y empieza otro. 📄',
  'Lee tu texto en voz alta. Si algo suena raro, probablemente se puede escribir mejor. 🗣️',
  'Empieza las frases con mayúscula y termínalas con punto. Y recuerda los signos ¿ ? y ¡ ! al principio y al final. ✍️',
  'Pon un título que dé ganas de abrir el libro. ¡Piensa en tres títulos y elige el mejor! 📚'
];
export const BOT_CHIPS = [['¿Cómo pongo capítulos?', 'capitulos'], ['¿Cómo pongo un dibujo?', 'imagen'], ['¿Cómo cambio la portada?', 'portada'], ['¿Cómo corrijo las faltas?', 'ortografia'], ['No sé qué escribir…', 'idea'], ['Un consejo para escribir', 'consejo'], ['¿Cómo lo comparto?', 'compartir']];
const T = {
  hola: () => ({ html: '¡Hola! 👋 Soy <b>Pluma</b> ✒️, tu ayudante. Te puedo explicar cómo se usa la app, darte <b>ideas</b> para escribir y consejos. ¿Qué quieres saber?' }),
  capitulos: () => ({ html: '📚 Un libro se separa en <b>capítulos</b>. Hay dos formas:<br>1️⃣ Toca en el texto, justo donde quieres que empiece el capítulo nuevo, y pulsa <b>✂️ Capítulo nuevo aquí</b>.<br>2️⃣ O deja que yo te diga dónde cortar.', acts: [['💡 Sugerir capítulos', 'cuts']] }),
  titulo: () => ({ html: '🔠 Para poner un título dentro del texto, pon el cursor en esa línea y pulsa <b>🔠 Título</b>.<br>El nombre de cada capítulo se escribe arriba, en la línea grande. El título del libro está en <b>⚙️ Ajustes del libro</b>.' }),
  imagen: () => ({ html: '🖼 Pulsa <b>🖼 Dibujo</b>. Puedes subir una foto o un dibujo tuyo, o elegir una <b>ilustración de la app</b>. Toca la imagen para hacerla más grande o más pequeña.', acts: [['🎨 Ver ilustraciones', 'illus']] }),
  portada: () => ({ html: '📕 La portada es la imagen de la primera página. Puedes subir un dibujo tuyo o elegir una <b>portada de la app</b>, que lleva tu título y tu nombre.', acts: [['🖼 Elegir portada', 'cover']] }),
  ortografia: () => ({ html: '🔤 Mientras escribes, el móvil <b>subraya en rojo</b> lo que está mal. Si enciendes el <b>Corrector</b>, te digo si esa parte está bien ✅ o tiene fallos ⚠️ y toca la palabra para arreglarla. Con <b>🧚 Ayudante → Revisar ortografía</b> reviso todo el capítulo.', acts: [['🔤 Corrector en vivo', 'live'], ['🧚 Revisar todo', 'spell']] }),
  paginas: () => ({ html: '📄 Los <b>números de página</b> salen solos cuando pulsas <b>👁 Leer</b> o cuando haces el PDF. Si quieres empezar una hoja nueva, pulsa <b>📄 Hoja nueva</b>.', acts: [['👁 Ver mi libro', 'read']] }),
  guardar: () => ({ html: '✅ Todo se <b>guarda solo</b> mientras escribes. Mira arriba: pone “✅ Todo guardado”. Si borras algo sin querer, pulsa <b>↶ Deshacer</b>.' }),
  compartir: () => ({ html: '⤴ Pulsa el botón <b>⤴</b> de arriba. Allí puedes crear un <b>PDF</b>, un <b>Word</b> o un <b>ePub</b>, y enviar el enlace por <b>WhatsApp</b> o <b>Telegram</b>.' }),
  publicar: () => ({ html: '👨‍👩‍👧 Para que tu familia lo lea: <b>⚙️ Ajustes del libro</b> → activa <b>Dejar que la familia lo lea</b>. Cada persona tiene que registrarse y ser aprobada en <b>👤 → Familia y accesos</b>.' }),
  deshacer: () => ({ html: '↶ Pulsa <b>Deshacer</b> y vuelves atrás. Si cortaste mal un capítulo: <b>➕ Más → Unir con el capítulo de antes</b>.' }),
  listo: () => ({ html: '✅ Te preparo una lista con lo que le falta a tu libro: portada, títulos, capítulos, dibujos…', acts: [['✅ Ver la lista', 'ready']] }),
  idea: () => ({ html: '🎲 <b>Idea para tu historia:</b><br>' + pick(IDEAS), acts: [['🎲 Otra idea', 'idea']] }),
  consejo: () => ({ html: '✨ <b>Consejo:</b><br>' + pick(TIPS), acts: [['✨ Otro consejo', 'tip']] }),
  gracias: () => ({ html: '¡De nada! 😊 Sigue escribiendo, ¡tu libro va a quedar genial!' }),
  nada: () => ({ html: '🤔 No lo he entendido bien. Prueba a preguntarlo con otras palabras o toca uno de los botones de abajo.' })
};
const RULES = [
  ['hola', /^(hola|buenas|buenos|hey|ey|que tal)\b/], ['gracias', /\b(gracias|genial|guay|perfecto)\b/],
  ['idea', /\b(idea|ideas|inspir|que escribo|no se que escribir|bloque|seguir la historia|que pongo)\b/],
  ['consejo', /\b(consejo|consejos|mejorar|escribir mejor|truco|trucos|tip)\b/],
  ['capitulos', /\b(capitulo|capitulos|cortar|corto|dividir|partir|separar)\b/],
  ['portada', /\b(portada|cubierta)\b/],
  ['imagen', /\b(imagen|imagenes|dibujo|dibujos|foto|fotos|ilustracion|ilustraciones|ilustrar)\b/],
  ['ortografia', /\b(falta|faltas|ortografia|acento|acentos|tilde|tildes|corrige|corrector|corregir|subray|rojo)\b/],
  ['titulo', /\b(titulo|titulos|encabezado)\b/],
  ['paginas', /\b(pagina|paginas|numero|numeros|numerar|hoja|hojas)\b/],
  ['compartir', /\b(compartir|comparto|pdf|word|epub|enviar|mandar|whatsapp|telegram|descargar|imprimir)\b/],
  ['publicar', /\b(publicar|publico|familia|abuelos?|leerlo|que lo lean)\b/],
  ['listo', /\b(listo|terminado|acabado|me falta|que falta)\b/],
  ['guardar', /\b(guardar|guarda|guardado|perder|perdi|borre|borrado)\b/],
  ['deshacer', /\b(deshacer|error|equivoque|equivoc|arreglar|unir|volver atras|mal)\b/]
];
/** input: '#tema' para pedir un tema concreto, o texto libre del usuario. */
export function botReply(input) {
  if (String(input).startsWith('#')) { const id = String(input).slice(1); return (T[id === 'tip' ? 'consejo' : id] || T.nada)(); }
  const t = norm(input);
  for (const [id, re] of RULES) if (re.test(t)) return T[id]();
  return T.nada();
}

/* =====================================================================
   📚 Biblioteca propia: libros PDF / ePub guardados SOLO en este dispositivo
   ===================================================================== */
const PDFJS_BASE = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/';
let pdfjsP = null, jszipP = null;
export function loadPdfJs() {
  return (pdfjsP ??= (async () => {
    const lib = await import(PDFJS_BASE + 'pdf.min.mjs');
    const txt = await (await fetch(PDFJS_BASE + 'pdf.worker.min.mjs')).text();
    lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([txt], { type: 'text/javascript' }));
    return lib;
  })().catch(() => { pdfjsP = null; throw new Error('No se pudo cargar el lector de PDF (¿sin conexión?)'); }));
}
export function loadJSZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  return (jszipP ??= new Promise((ok, ko) => {
    const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
    s.onload = () => ok(window.JSZip); s.onerror = () => { jszipP = null; ko(new Error('No se pudo cargar el lector de ePub (¿sin conexión?)')); };
    document.head.append(s);
  }));
}

/* ----- almacenamiento local (IndexedDB), una biblioteca por cuenta ----- */
export function libDB(uid) {
  return new Promise((ok, ko) => {
    const r = indexedDB.open('ob-lib-' + uid, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('meta', { keyPath: 'id' }); r.result.createObjectStore('files', { keyPath: 'id' }); };
    r.onerror = () => ko(r.error);
    r.onsuccess = () => {
      const db = r.result, run = (stores, mode, fn) => new Promise((res, rej) => {
        const tx = db.transaction(stores, mode); let out; tx.oncomplete = () => res(out); tx.onerror = tx.onabort = () => rej(tx.error);
        out = fn(tx);
      }), req = rq => new Promise((res, rej) => { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
      ok({
        all: () => run('meta', 'readonly', tx => req(tx.objectStore('meta').getAll())).then(r => r),
        meta: id => run('meta', 'readonly', tx => req(tx.objectStore('meta').get(id))),
        file: id => run('files', 'readonly', tx => req(tx.objectStore('files').get(id))).then(r => r?.blob),
        add: (m, blob) => run(['meta', 'files'], 'readwrite', tx => { tx.objectStore('meta').put(m); tx.objectStore('files').put({ id: m.id, blob }); }),
        update: m => run('meta', 'readwrite', tx => { tx.objectStore('meta').put(m); }),
        remove: id => run(['meta', 'files'], 'readwrite', tx => { tx.objectStore('meta').delete(id); tx.objectStore('files').delete(id); })
      });
    };
  });
}

/* ----- nombre de archivo → título, autor, colección y número ----- */
export const normKey = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const tidy = s => (s || '').replace(/\s{2,}/g, ' ').replace(/^[\s\-–—_.,:;]+|[\s\-–—_.,:;]+$/g, '').trim();
export function parseName(fn) {
  let s = fn.replace(/\.(pdf|epub)$/i, '').replace(/_+/g, ' ');
  s = s.replace(/\s*[(\[]\s*(?:z-?lib(?:\.org)?|www\.[^)\]]+|[^)\]]*(?:spanish|español|castellano|edition|edici[oó]n|epub|pdf|retail|ebook|libgen)[^)\]]*)\s*[)\]]/gi, '');
  s = tidy(s); const out = { title: s, author: '', series: '', seriesNo: null }; let m;
  const num = v => parseInt(v, 10);
  if ((m = s.match(/^(.+?)\s*[(\[]\s*(.+?)\s*(?:#|n[ºo°]\.?\s*|vol\.?\s*|libro\s*|book\s*|tomo\s*)(\d{1,3})\s*[)\]]\s*(?:[-–—:]\s*(.+))?$/i))) {
    out.series = tidy(m[2]); out.seriesNo = num(m[3]); out.title = tidy(m[1] + (m[4] ? ' - ' + m[4] : ''));
  } else if ((m = s.match(/^(.+?)\s*[-–—]\s*0*(\d{1,3})\s*[-–—]\s*(.+)$/))) {
    out.series = tidy(m[1]); out.seriesNo = num(m[2]); out.title = tidy(m[3]);
  } else if ((m = s.match(/^(.+?)[\s,:-]+(?:libro|vol(?:umen)?\.?|tomo|book|n[ºo°]\.?|#)\s*0*(\d{1,3})(?:\s*[-–—:.]\s*(.+))?$/i))) {
    out.series = tidy(m[1]); out.seriesNo = num(m[2]); out.title = tidy(m[3] || s);
  } else if ((m = s.match(/^(.+?)\s+0*(\d{1,2})$/)) && m[1].split(/\s+/).length >= 2) {
    out.series = tidy(m[1]); out.seriesNo = num(m[2]); out.title = s;
  } else if ((m = s.match(/^([^-–—]{3,40}?)\s+[-–—]\s+(.+)$/)) && !/\d/.test(m[1]) && m[1].split(/\s+/).length <= 4) {
    out.author = tidy(m[1]); out.title = tidy(m[2]);
  }
  if (out.series && out.series.length < 2) { out.series = ''; out.seriesNo = null; }
  return out;
}

/* ----- miniatura de una imagen (Blob) para las portadas ----- */
export async function thumbOf(blob, w = 320) {
  try {
    const bmp = await createImageBitmap(blob), k = Math.min(1, w / bmp.width);
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
    return c.toDataURL('image/jpeg', 0.75);
  } catch { return ''; }
}

/* ----- ePub ----- */
const lname = e => e.localName || e.nodeName.replace(/^.*:/, '');
const kids = (el, n) => [...el.getElementsByTagName('*')].filter(e => lname(e) === n);
const resolvePath = (base, href) => { try { return decodeURIComponent(new URL(href.split('#')[0], 'http://x/' + base).pathname.slice(1)); } catch { return href; } };
const parseX = (txt, type = 'application/xhtml+xml') => { const d = new DOMParser().parseFromString(txt, type); return d.getElementsByTagName('parsererror').length ? new DOMParser().parseFromString(txt, 'text/html') : d; };

async function epubOpen(blob) {
  const JSZip = await loadJSZip(), zip = await JSZip.loadAsync(blob);
  const cont = zip.file('META-INF/container.xml'); if (!cont) throw new Error('No es un ePub válido');
  const rootEl = kids(parseX(await cont.async('string'), 'text/xml'), 'rootfile')[0], opfPath = rootEl?.getAttribute('full-path'); if (!opfPath) throw new Error('ePub sin índice');
  const opf = parseX(await zip.file(opfPath).async('string'), 'text/xml'), dir = opfPath.includes('/') ? opfPath.replace(/\/[^/]*$/, '/') : '';
  const manifest = new Map();
  kids(opf, 'item').forEach(i => manifest.set(i.getAttribute('id'), { id: i.getAttribute('id'), path: resolvePath(dir + 'x', i.getAttribute('href') || ''), type: i.getAttribute('media-type') || '', props: i.getAttribute('properties') || '' }));
  const spine = kids(opf, 'itemref').map(r => manifest.get(r.getAttribute('idref'))).filter(Boolean);
  return { zip, opf, dir, manifest, spine };
}
const firstText = (opf, n) => { const e = kids(opf, n)[0]; return e ? e.textContent.trim() : ''; };
export async function epubInfo(blob) {
  const { zip, opf, manifest, spine } = await epubOpen(blob);
  const info = { title: firstText(opf, 'title'), author: kids(opf, 'creator').map(e => e.textContent.trim()).filter(Boolean).join(', '), series: '', seriesNo: null, cover: '' };
  const metas = kids(opf, 'meta');
  const cal = metas.find(m => m.getAttribute('name') === 'calibre:series'); if (cal) { info.series = (cal.getAttribute('content') || '').trim(); const ix = metas.find(m => m.getAttribute('name') === 'calibre:series_index'); const v = parseFloat(ix?.getAttribute('content')); if (!isNaN(v)) info.seriesNo = v; }
  else { const col = metas.find(m => m.getAttribute('property') === 'belongs-to-collection'); if (col) { info.series = col.textContent.trim(); const id = col.getAttribute('id'); const gp = id && metas.find(m => m.getAttribute('refines') === '#' + id && m.getAttribute('property') === 'group-position'); const v = parseFloat(gp?.textContent); if (!isNaN(v)) info.seriesNo = v; } }
  let cov = manifest.get(metas.find(m => m.getAttribute('name') === 'cover')?.getAttribute('content') || '') || [...manifest.values()].find(i => /cover-image/.test(i.props)) || [...manifest.values()].find(i => /^image\//.test(i.type) && /cover|portada/i.test(i.id + i.path));
  if (!cov) { const first = spine[0] && zip.file(spine[0].path); if (first) { const txt = await first.async('string'); const m = txt.replace(/<(head|style|script)[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, '').trim().length < 120 && txt.match(/(?:src|href)\s*=\s*["']([^"']+\.(?:jpe?g|png|gif|webp))["']/i); if (m) cov = { path: resolvePath(spine[0].path, m[1]) }; } }
  const f = cov && zip.file(cov.path); if (f) info.cover = await thumbOf(await f.async('blob'));
  return info;
}

const KEEP = new Set('p div span h1 h2 h3 h4 h5 h6 em strong b i u s sub sup br hr ul ol li dl dt dd blockquote pre code table thead tbody tfoot tr td th caption figure figcaption a img small big cite q abbr'.split(' '));
const SKIP = new Set('script style link meta head title audio video iframe object embed form input button select textarea noscript'.split(' '));
const escA = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escT = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function styleOf(el) {
  const st = el.getAttribute('style') || '', out = []; let m;
  if ((m = st.match(/text-align\s*:\s*(left|right|center|justify)/i))) out.push('text-align:' + m[1].toLowerCase());
  if ((m = st.match(/text-indent\s*:\s*(-?[\d.]+)(em|px|%)/i)) && Math.abs(parseFloat(m[1])) < (m[2] === 'px' ? 80 : m[2] === '%' ? 20 : 4)) out.push(`text-indent:${m[1]}${m[2]}`);
  if (/font-style\s*:\s*italic/i.test(st)) out.push('font-style:italic');
  if (/font-weight\s*:\s*(bold|[6-9]00)/i.test(st)) out.push('font-weight:700');
  const cls = el.getAttribute('class') || '';
  if (!out.some(x => x.startsWith('text-align'))) { if (/(^|[\s_-])(center|centre|centered|centrado|centro)([\s_-]|$)/i.test(cls)) out.push('text-align:center'); else if (/(^|[\s_-])(right|derecha)([\s_-]|$)/i.test(cls)) out.push('text-align:right'); }
  if (/(^|[\s_-])(italic|cursiva)([\s_-]|$)/i.test(cls) && !out.includes('font-style:italic')) out.push('font-style:italic');
  return out.length ? ` style="${out.join(';')}"` : '';
}

/** Convierte un ePub en secciones limpias para el lector paginado. */
export async function epubToBook(blob) {
  const { zip, opf, manifest, spine } = await epubOpen(blob);
  const info = await epubInfo(blob).catch(() => ({}));
  const imgPaths = [], imgIdx = new Map(), anchorMap = new Map(), urls = [];
  const idxOf = p => { if (!imgIdx.has(p)) { imgIdx.set(p, imgPaths.length); imgPaths.push(p); } return imgIdx.get(p); };
  const spineIdx = new Map(spine.map((s, i) => [s.path, i]));
  const tocRaw = [];
  const nav = [...manifest.values()].find(i => /\bnav\b/.test(i.props)), ncx = [...manifest.values()].find(i => /dtbncx/.test(i.type) || /\.ncx$/.test(i.path));
  try {
    if (nav && zip.file(nav.path)) {
      const nd = parseX(await zip.file(nav.path).async('string')), navEl = kids(nd, 'nav').find(n => /toc/.test((n.getAttribute('epub:type') || n.getAttribute('type') || '')) ) || kids(nd, 'nav')[0];
      const walk = (el, depth) => { for (const c of el.children) { const n = lname(c); if (n === 'a') tocRaw.push({ title: c.textContent.replace(/\s+/g, ' ').trim(), href: c.getAttribute('href') || '', depth }); else walk(c, n === 'ol' || n === 'ul' ? depth + (el === navEl ? 0 : 1) : depth); } };
      if (navEl) walk(navEl, 0);
    } else if (ncx && zip.file(ncx.path)) {
      const nd = parseX(await zip.file(ncx.path).async('string'), 'text/xml');
      const walk = (el, depth) => { for (const c of el.children) if (lname(c) === 'navPoint') { const t = kids(c, 'text')[0], ct = kids(c, 'content')[0]; if (t && ct) tocRaw.push({ title: t.textContent.replace(/\s+/g, ' ').trim(), href: ct.getAttribute('src') || '', depth }); walk(c, depth + 1); } };
      const nm = kids(nd, 'navMap')[0]; if (nm) walk(nm, 0);
    }
  } catch (e) { console.warn('índice del ePub', e); }
  const tocBase = (nav || ncx)?.path || '';
  const tocPaths = new Set(tocRaw.map(t => resolvePath(tocBase, t.href)));

  const sections = [];
  for (let i = 0; i < spine.length; i++) {
    const it = spine[i]; if (/\bnav\b/.test(it.props) || !/html|xml/.test(it.type) || !zip.file(it.path)) continue;
    const doc = parseX(await zip.file(it.path).async('string')), body = kids(doc, 'body')[0] || doc.documentElement;
    const sid = 's' + i;
    const hid = (p, f) => anchorMap.set(p + '#' + f, `e${i}_${f}`);
    const conv = node => {
      if (node.nodeType === 3) return escT(node.nodeValue);
      if (node.nodeType !== 1) return '';
      const n = lname(node).toLowerCase();
      if (SKIP.has(n)) return '';
      if (n === 'svg') { const im = kids(node, 'image')[0]; const h = im && (im.getAttribute('xlink:href') || im.getAttribute('href')); return h ? `<img data-ep="${idxOf(resolvePath(it.path, h))}" alt="">` : ''; }
      const inner = () => [...node.childNodes].map(conv).join('');
      if (n === 'img') { const s = node.getAttribute('src'); return s && !/^data:|^https?:/.test(s) ? `<img data-ep="${idxOf(resolvePath(it.path, s))}" alt="${escA(node.getAttribute('alt') || '')}">` : ''; }
      const id = node.getAttribute('id'), idA = id ? ` id="e${i}_${escA(id)}"` : ''; if (id) hid(it.path, id);
      if (n === 'a') {
        const href = node.getAttribute('href') || '';
        if (!href) return `<span${idA}>${inner()}</span>`;
        if (/^https?:|^mailto:/i.test(href)) return `<a href="${escA(href)}" target="_blank" rel="noopener noreferrer">${inner()}</a>`;
        const p = href.startsWith('#') ? it.path : resolvePath(it.path, href), f = href.includes('#') ? href.split('#')[1] : '';
        return `<a href="#" data-go="${escA(p + '#' + f)}"${idA}>${inner()}</a>`;
      }
      if (n === 'center') return `<div style="text-align:center"${idA}>${inner()}</div>`;
      if (!KEEP.has(n)) return (id ? `<span${idA}></span>` : '') + inner();
      if ((n === 'p' || n === 'div' || n === 'span') && !node.textContent.trim() && !node.querySelector('img,svg,image')) return id ? `<span${idA}></span>` : '';
      const extra = (n === 'td' || n === 'th') ? [...['colspan', 'rowspan']].map(a => node.getAttribute(a) ? ` ${a}="${escA(node.getAttribute(a))}"` : '').join('') : '';
      if (n === 'br' || n === 'hr') return `<${n}${idA}>`;
      return `<${n}${idA}${styleOf(node)}${extra}>${inner()}</${n}>`;
    };
    const html = conv(body).trim();
    anchorMap.set(it.path + '#', sid);
    const hasHead = /^\s*(?:<[^>]+>\s*)*<h[1-3][\s>]/i.test(html);
    sections.push({ id: sid, path: it.path, html, nb: !(hasHead || tocPaths.has(it.path) || i === 0) });
  }
  // imágenes → blob URLs
  const blobs = await Promise.all(imgPaths.map(async p => { const f = zip.file(p); if (!f) return ''; const type = manifest.size ? ([...manifest.values()].find(m => m.path === p)?.type || '') : ''; const b = await f.async('blob'); const u = URL.createObjectURL(type ? new Blob([b], { type }) : b); urls.push(u); return u; }));
  sections.forEach(s => { s.html = s.html.replace(/data-ep="(\d+)"/g, (_, n) => blobs[+n] ? `src="${blobs[+n]}" class="ei"` : 'hidden'); });
  // portada propia: si la primera sección es solo una imagen se quita (el lector ya muestra la portada)
  let cover = '';
  if (sections[0] && !sections[0].html.replace(/<[^>]*>/g, '').trim() && (sections[0].html.match(/<img/g) || []).length === 1) { cover = (sections[0].html.match(/src="([^"]+)"/) || [])[1] || ''; sections.shift(); }
  if (!cover && info.cover) cover = info.cover;
  // índice
  const toc = tocRaw.map(t => { const p = resolvePath(tocBase, t.href), f = t.href.includes('#') ? t.href.split('#')[1] : ''; const target = anchorMap.get(p + '#' + f) || anchorMap.get(p + '#') || null; return target ? { title: t.title || 'Capítulo', depth: Math.min(t.depth, 2), target } : null; }).filter(Boolean);
  return { title: info.title || firstText(opf, 'title'), author: info.author || '', lang: firstText(opf, 'language'), cover, sections: sections.filter(s => s.html), toc, anchorMap, urls };
}

/* ----- PDF: metadatos, número de páginas y miniatura de la portada ----- */
const badPdfTitle = t => !t || t.length < 3 || /^(microsoft word|untitled|sin t[ií]tulo|document\d*)/i.test(t) || /\.(docx?|indd|pdf|tex|rtf|odt|qxd|pub)$/i.test(t);
/* Portada de un PDF: elige la primera página con imagen (no una hoja casi vacía) y recorta los márgenes blancos */
async function coverOf(doc) {
  let best = null;
  for (let i = 1; i <= Math.min(doc.numPages, 4); i++) {
    const page = await doc.getPage(i), v0 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: 420 / v0.width });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const x = c.getContext('2d', { willReadFrequently: true }); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: x, viewport: vp }).promise;
    const W = c.width, H = c.height, d = x.getImageData(0, 0, W, H).data; let ink = 0, x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) { const o = (y * W + xx) * 4; if (d[o] < 232 || d[o + 1] < 232 || d[o + 2] < 232) { ink++; if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    const cov = ink / (W * H);
    if (!best || cov > best.cov) best = { c, cov, x0, y0, x1, y1, W, H };
    if (cov >= 0.12) break;
  }
  const { c, W, H } = best; let { x0, y0, x1, y1 } = best;
  const pad = Math.round(W * 0.015); x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W, x1 + pad); y1 = Math.min(H, y1 + pad);
  let sx = 0, sy = 0, sw = W, sh = H;
  if (best.cov >= 0.05 && (x1 - x0) * (y1 - y0) >= 0.35 * W * H && (x1 - x0) >= 0.45 * W) { sx = x0; sy = y0; sw = x1 - x0; sh = y1 - y0; }
  const k = Math.min(1, 320 / sw), o = document.createElement('canvas'); o.width = Math.round(sw * k); o.height = Math.round(sh * k);
  const ox = o.getContext('2d'); ox.fillStyle = '#fff'; ox.fillRect(0, 0, o.width, o.height); ox.drawImage(c, sx, sy, sw, sh, 0, 0, o.width, o.height);
  return o.toDataURL('image/jpeg', 0.78);
}
export async function pdfCover(blob) {
  const pdfjs = await loadPdfJs(), url = URL.createObjectURL(blob);
  try { const doc = await pdfjs.getDocument({ url }).promise; const r = await coverOf(doc); doc.destroy(); return r; } finally { URL.revokeObjectURL(url); }
}
export async function pdfInfo(blob) {
  const pdfjs = await loadPdfJs(), url = URL.createObjectURL(blob);
  try {
    const doc = await pdfjs.getDocument({ url }).promise;
    const md = await doc.getMetadata().catch(() => null), inf = md?.info || {};
    const cover = await coverOf(doc);
    const out = { title: badPdfTitle((inf.Title || '').trim()) ? '' : inf.Title.trim(), author: /^(anonymous|an[oó]nimo|unknown|desconocid|admin|user|usuario|author|autor$|owner|pc$|windows|microsoft|calibre|adobe|root|default|none|null)/i.test((inf.Author || '').trim()) || (inf.Author || '').trim().length < 3 ? '' : (inf.Author || '').trim().slice(0, 80), pages: doc.numPages, cover };
    doc.destroy(); return out;
  } finally { URL.revokeObjectURL(url); }
}

/* ===== Revisor de diálogos y signos (reglas propias, sin internet) ===== */
const DV = { dijo: 'dijo', respondio: 'respondió', exclamo: 'exclamó', pregunto: 'preguntó', contesto: 'contestó', grito: 'gritó', susurro: 'susurró', anadio: 'añadió', explico: 'explicó', comento: 'comentó', murmuro: 'murmuró', replico: 'replicó', penso: 'pensó', pidio: 'pidió', dijeron: 'dijeron', respondieron: 'respondieron', exclamaron: 'exclamaron', preguntaron: 'preguntaron', contestaron: 'contestaron', gritaron: 'gritaron', susurraron: 'susurraron' };
const dvKey = w => (w || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-zñ]/g, '').replace('ñ', 'n');
const dvWords = s => s.replace(/[.!?…,;:¿¡"«»]/g, ' ').split(/\s+/).filter(Boolean);
const dvVerbAt = ws => ws.findIndex(w => dvKey(w) in DV);
const dvIsTag = s => { const ws = dvWords(s), i = dvVerbAt(ws); return ws.length > 0 && ws.length <= 8 && i >= 0 && i <= 3; };
const dvFixVerb = s => s.replace(/[A-Za-zÁÉÍÓÚáéíóúñÑ]+/g, w => (dvKey(w) in DV && w === w.toLowerCase()) ? DV[dvKey(w)] : (dvKey(w) in DV ? DV[dvKey(w)].replace(/^./, c => c.toUpperCase()) : w));
const dvSplit = s => (s.match(/[^.!?…]+[.!?…]+[,;]?|[^.!?…]+$/g) || []).map(x => x.trim()).filter(Boolean);
const DV_NARR = /^(cuando|despu[eé]s|luego|entonces|mientras|al\s|y\s+cuando|esa\s|aquel)\b/i;
const DV_L = 'A-Za-zÁÉÍÓÚÜÑáéíóúüñ';

function dvPunct(s) {
  s = s.replace(/\s+/g, ' ').trim()
    .replace(/\s+([,.;:!?…])/g, '$1').replace(/([¿¡])\s+/g, '$1')
    .replace(/([!?])\.+(?!\.)/g, '$1').replace(/([!?])\.(?=\s|$)/g, '$1')
    .replace(new RegExp('([,;:.!?…])(?=[' + DV_L + '¿¡])', 'g'), '$1 ');
  const chunks = s.match(/[^.!?…]*[.!?…]+[,;]?|[^.!?…]+$/g) || [s];
  return chunks.map(c => {
    if (c.includes('?') && !c.includes('¿')) c = c.replace(/^(\s*)/, '$1¿');
    if (c.includes('¿') && !c.includes('?')) c = c.replace(/¿/g, '').replace(/^(\s*)Cuándo\b/, '$1Cuando');
    if (c.includes('!') && !c.includes('¡')) c = c.replace(/^(\s*)/, '$1¡');
    if (c.includes('¡') && !c.includes('!')) c = c.replace(/¡/g, '');
    return c.replace(new RegExp('^(\\s*[¿¡"«(]*)([a-záéíóúñü])'), (m, a, b) => a + b.toUpperCase());
  }).join('').replace(/\s+/g, ' ').trim();
}

/* Recibe el texto de un párrafo y devuelve las líneas ya arregladas (cada línea = un párrafo). */
export function fixDialogue(raw) {
  let t = raw.replace(/\s+/g, ' ').trim(); if (!t) return [t];
  const clear = /^[-–—]|\s[-–—]|[.!?…:,;¿¡"»)][-–—]/.test(t);
  t = t.replace(/[-–—]+/g, (m, off, str) => {
    const p = str[off - 1] || '', n = str[off + m.length] || '';
    if (/\d/.test(p) && /\d/.test(n)) return m;
    if (!p || /\s/.test(p) || /[.!?…:,;¿¡"»)]/.test(p)) return '\u0001';
    if (new RegExp('[' + DV_L + ']').test(p)) { if (!n || /[.,;:!?¿¡\s]/.test(n)) return '\u0001'; if (clear && new RegExp('[' + DV_L + '¿¡]').test(n)) return '\u0001'; }
    return m;
  });
  const pieces = t.split('\u0001').map(s => s.trim());
  if (pieces.length === 2 && !pieces[0]) {   // línea con raya que en realidad es solo narración: «—Su madre respondió.»
    const ss = dvSplit(pieces[1]), ws = dvWords(pieces[1]), vi = dvVerbAt(ws);
    if (ss.length === 1 && !/[¿?¡!]/.test(pieces[1]) && vi >= 0 && ((dvIsTag(ss[0])) || (DV_NARR.test(pieces[1]) && vi >= ws.length - 4))) {
      let s = dvFixVerb(dvPunct(pieces[1])).replace(/[.,;:]+$/, '') + ':'; return [s];
    }
  }
  const items = [], last = () => items[items.length - 1];
  const addN = s => { s = (s || '').replace(/^[.,;:\s]+/, '').trim(); if (s) items.push({ k: 'n', t: s }); };
  pieces.forEach((piece, i) => {
    if (i === 0) return addN(piece);
    if (!piece) return;
    const prevS = items.length && last().k === 's' && !last().tag;
    if (/^[.,;:]/.test(piece) || (prevS && (dvKey(piece.split(/\s+/)[0]) in DV))) {
      const ss = dvSplit(piece.replace(/^[.,;:\s]+/, ''));
      if (prevS && ss.length && dvIsTag(ss[0])) last().tag = ss.shift();
      return addN(ss.join(' '));
    }
    const ss = dvSplit(piece), keep = []; let tag = '', rest = [];
    for (let k = 0; k < ss.length; k++) {
      const s = ss[k];
      if (k > 0 && dvIsTag(s)) {
        const leadIn = k === ss.length - 1 && !/[.!?…]$/.test(s) && i < pieces.length - 1;
        if (leadIn) rest = ss.slice(k); else { tag = s; rest = ss.slice(k + 1); }
        break;
      }
      if (k > 0 && DV_NARR.test(s)) { rest = ss.slice(k); break; }
      keep.push(s);
    }
    items.push({ k: 's', t: keep.join(' '), tag });
    addN(rest.join(' '));
  });
  const lines = [];
  items.forEach((it, idx) => {
    if (it.k === 'n') {
      let s = dvPunct(it.t); const nx = items[idx + 1];
      if (nx && nx.k === 's') {
        const ws = dvWords(s), vi = dvVerbAt(ws);
        if (vi >= 0 && vi >= ws.length - 4) s = dvFixVerb(s).replace(/[.,;:]+$/, '') + ':';
      }
      if (!/[.!?…:]$/.test(s)) s += '.';
      if (lines.length && lines[lines.length - 1].n) lines[lines.length - 1].t += ' ' + s; else lines.push({ n: 1, t: s });
    } else {
      let b = dvPunct(it.t).replace(/([^.!?…])[.,;:]+$/, '$1').replace(/([!?…])[.,;:]+$/, '$1');
      if (it.tag) {
        let g = dvPunct(it.tag).replace(/[.,;:!?…]+$/, ''); g = dvFixVerb(g);
        if (dvKey(g.split(' ')[0]) in DV) g = g.replace(/^./, c => c.toLowerCase());
        lines.push({ t: '—' + b + ' —' + g + '.' });
      } else { if (!/[.!?…]$/.test(b)) b += '.'; lines.push({ t: '—' + b }); }
    }
  });
  return lines.map(l => l.t);
}
