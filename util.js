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
