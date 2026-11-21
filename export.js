// Exportar (PDF, Word, ePub) y compartir (WhatsApp, Telegram, sistema).
import { sanitize, hydrate, esc } from './util.js';

const CDN = {
  docx: ['https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js', 'docx'],
  jszip: ['https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', 'JSZip']
};
const loading = {};
function lib(name) {
  const [url, g] = CDN[name];
  if (window[g]) return Promise.resolve(window[g]);
  return (loading[name] ??= new Promise((ok, ko) => {
    const s = document.createElement('script'); s.src = url;
    s.onload = () => ok(window[g]); s.onerror = () => { delete loading[name]; ko(new Error('No se pudo cargar ' + name + ' (¿sin conexión?)')); };
    document.head.append(s);
  }));
}

const slug = t => (t || 'libro').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'libro';
// DOMParser crea un documento inerte: las imágenes no se descargan al procesarlas
const parseHtml = html => new DOMParser().parseFromString(sanitize(html), 'text/html').body;
const dataToBytes = url => Uint8Array.from(atob(url.split(',')[1]), c => c.charCodeAt(0));
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

/* ---------------- PDF (impresión paginada con números de página) ---------------- */
export async function exportPDF({ book, chapters, imgs }) {
  const root = document.getElementById('print-root');
  root.innerHTML = `<div class="p-cover">${book.coverData ? `<img src="${book.coverData}" alt="">` : ''}<h1>${esc(book.title)}</h1><p><i>${esc(book.author || '')}</i></p></div>
    <div class="p-toc"><h1 class="p-title">Índice</h1><ol>${chapters.map(c => `<li>${esc(c.title)}</li>`).join('')}</ol></div>` +
    chapters.map(c => `<section class="p-chap"><h1 class="p-title">${esc(c.title)}</h1>${sanitize(c.html)}</section>`).join('');
  hydrate(root, imgs);
  await Promise.all([...root.querySelectorAll('img')].map(i => i.decode?.().catch(() => {})));
  const prevTitle = document.title; document.title = book.title;
  const done = () => { root.innerHTML = ''; document.title = prevTitle; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
}

/* ---------------- Word (.docx) ---------------- */
export async function buildDocx({ book, chapters, imgs }) {
  const D = await lib('docx');
  const A = D.AlignmentType, WIDTH = { 'sz-s': 220, 'sz-m': 380, 'sz-l': 520 };
  let listN = 0;
  const alignOf = el => ({ center: A.CENTER, right: A.RIGHT, justify: A.JUSTIFIED, left: A.LEFT }[el.style?.textAlign]);

  const imageRun = el => {
    const it = imgs.get(el.getAttribute('data-img')); if (!it) return null;
    const cls = ['sz-s', 'sz-m', 'sz-l'].find(c => el.classList.contains(c)) || 'sz-m';
    const w = WIDTH[cls], h = Math.round(w * (it.h / it.w));
    return new D.ImageRun({ data: dataToBytes(it.data), transformation: { width: w, height: h }, type: it.data.startsWith('data:image/png') ? 'png' : 'jpg' });
  };
  function inline(node, f = {}) {
    const out = [];
    node.childNodes.forEach(n => {
      if (n.nodeType === 3) { if (n.textContent) out.push(new D.TextRun({ text: n.textContent, bold: f.b, italics: f.i, underline: f.u ? {} : undefined, strike: f.s })); return; }
      if (n.nodeType !== 1) return;
      const t = n.tagName;
      if (t === 'BR') out.push(new D.TextRun({ break: 1 }));
      else if (t === 'IMG') { const r = imageRun(n); if (r) out.push(r); }
      else inline(n, { ...f, b: f.b || t === 'STRONG' || t === 'B', i: f.i || t === 'EM' || t === 'I', u: f.u || t === 'U', s: f.s || t === 'S' }).forEach(x => out.push(x));
    });
    return out;
  }
  function blocks(root, opt = {}) {
    const out = [];
    root.childNodes.forEach(n => {
      if (n.nodeType === 3) { if (n.textContent.trim()) out.push(new D.Paragraph({ children: [new D.TextRun(n.textContent)], spacing: { after: 140 } })); return; }
      if (n.nodeType !== 1) return;
      const t = n.tagName;
      if (/^H[1-4]$/.test(t)) {
        out.push(new D.Paragraph({ heading: [D.HeadingLevel.HEADING_2, D.HeadingLevel.HEADING_2, D.HeadingLevel.HEADING_3, D.HeadingLevel.HEADING_4][+t[1] - 1], children: inline(n), alignment: alignOf(n), spacing: { before: 240, after: 120 } }));
      } else if (t === 'UL' || t === 'OL') {
        const inst = ++listN;
        n.querySelectorAll(':scope > li').forEach(li => out.push(new D.Paragraph({
          children: inline(li), ...(t === 'UL' ? { bullet: { level: 0 } } : { numbering: { reference: 'num', level: 0, instance: inst } }), spacing: { after: 60 } })));
      } else if (t === 'BLOCKQUOTE') {
        out.push(new D.Paragraph({ children: inline(n, { i: true }), indent: { left: 720 }, spacing: { before: 120, after: 160 }, border: { left: { style: D.BorderStyle.SINGLE, size: 12, space: 8, color: '7C4DFF' } } }));
      } else if (t === 'IMG') {
        const r = imageRun(n); if (r) out.push(new D.Paragraph({ children: [r], alignment: A.CENTER, spacing: { before: 120, after: 160 } }));
      } else if (t === 'HR') { /* nada */ }
      else if (t === 'DIV' && n.classList.contains('pagebreak')) out.push(new D.Paragraph({ children: [new D.PageBreak()] }));
      else if (t === 'DIV' && [...n.children].some(c => /^(P|DIV|H[1-4]|UL|OL|BLOCKQUOTE)$/.test(c.tagName))) out.push(...blocks(n));
      else {
        const runs = inline(n);
        const hasImg = !!n.querySelector('img');
        out.push(new D.Paragraph({ children: runs.length ? runs : [new D.TextRun('')], alignment: hasImg ? A.CENTER : (alignOf(n) ?? A.JUSTIFIED), spacing: { after: 140, line: 300 } }));
      }
    });
    return out;
  }

  const first = [];
  if (book.coverData) { const w = 300, im = new Image(); im.src = book.coverData; await im.decode().catch(() => {}); const h = Math.round(w * ((im.naturalHeight || 450) / (im.naturalWidth || 300)));
    first.push(new D.Paragraph({ alignment: A.CENTER, spacing: { before: 600, after: 300 }, children: [new D.ImageRun({ data: dataToBytes(book.coverData), transformation: { width: w, height: h }, type: 'jpg' })] })); }
  first.push(new D.Paragraph({ alignment: A.CENTER, spacing: { before: book.coverData ? 200 : 3600, after: 200 }, children: [new D.TextRun({ text: book.title, bold: true, size: 64 })] }));
  if (book.author) first.push(new D.Paragraph({ alignment: A.CENTER, children: [new D.TextRun({ text: book.author, italics: true, size: 30 })] }));

  const body = [...first];
  chapters.forEach(c => {
    body.push(new D.Paragraph({ heading: D.HeadingLevel.HEADING_1, pageBreakBefore: true, alignment: A.CENTER, spacing: { before: 400, after: 360 }, children: [new D.TextRun({ text: c.title, bold: true, size: 44 })] }));
    body.push(...blocks(parseHtml(c.html)));
  });

  const docu = new D.Document({
    creator: book.author || 'Olivia Books', title: book.title,
    numbering: { config: [{ reference: 'num', levels: [{ level: 0, format: D.LevelFormat.DECIMAL, text: '%1.', alignment: A.START }] }] },
    styles: { default: { document: { run: { font: 'Georgia', size: 24 } } } },
    sections: [{
      properties: { page: { margin: { top: 1300, bottom: 1300, left: 1300, right: 1300 } }, titlePage: true },
      footers: { default: new D.Footer({ children: [new D.Paragraph({ alignment: A.CENTER, children: [new D.TextRun({ children: [D.PageNumber.CURRENT] })] })] }), first: new D.Footer({ children: [new D.Paragraph('')] }) },
      children: body
    }]
  });
  return D.Packer.toBlob(docu);
}

/* ---------------- ePub 3 ---------------- */
export async function buildEpub({ book, chapters, imgs }) {
  const JSZip = await lib('jszip');
  const zip = new JSZip();
  const used = new Map(); // id -> {name, bytes}
  const xmlEsc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ser = new XMLSerializer();
  const toXhtml = html => {
    const d = parseHtml(html);
    d.querySelectorAll('img[data-img]').forEach(i => {
      const id = i.getAttribute('data-img'), it = imgs.get(id);
      if (!it) return i.remove();
      const png = it.data.startsWith('data:image/png'), name = 'img-' + id + (png ? '.png' : '.jpg'); used.set(id, { name, bytes: dataToBytes(it.data), mime: png ? 'image/png' : 'image/jpeg' });
      i.setAttribute('src', 'images/' + name); i.setAttribute('alt', 'Ilustración'); i.removeAttribute('data-img');
    });
    d.querySelectorAll('.pagebreak').forEach(p => p.setAttribute('style', 'page-break-before:always'));
    return [...d.childNodes].map(n => ser.serializeToString(n)).join('').replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, '');
  };
  const page = (title, inner) => `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="es" xml:lang="es"><head><meta charset="utf-8"/><title>${xmlEsc(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>${inner}</body></html>`;

  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file('OEBPS/style.css', 'body{font-family:serif;line-height:1.5;margin:1em}h1,h2{text-align:center}p{text-align:justify;margin:0 0 .8em}img{display:block;margin:1em auto;max-width:100%;height:auto}img.sz-s{width:35%}img.sz-m{width:65%}blockquote{border-left:3px solid #888;margin:1em 0;padding-left:1em;font-style:italic}.title{margin-top:30%;text-align:center}');
  let cover = '';
  if (book.coverData) { zip.file('OEBPS/images/cover.jpg', dataToBytes(book.coverData)); cover = '<p style="text-align:center"><img src="images/cover.jpg" alt="Portada" style="max-height:70vh"/></p>'; }
  zip.file('OEBPS/titlepage.xhtml', page(book.title, `${cover}<div class="title"><h1>${xmlEsc(book.title)}</h1><p style="text-align:center"><i>${xmlEsc(book.author || '')}</i></p></div>`));
  chapters.forEach((c, i) => zip.file(`OEBPS/ch${i + 1}.xhtml`, page(c.title, `<h2>${xmlEsc(c.title)}</h2>${toXhtml(c.html)}`)));
  used.forEach(v => zip.file('OEBPS/images/' + v.name, v.bytes));

  zip.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="es"><head><meta charset="utf-8"/><title>Índice</title></head><body><nav epub:type="toc"><h1>Índice</h1><ol>${chapters.map((c, i) => `<li><a href="ch${i + 1}.xhtml">${xmlEsc(c.title)}</a></li>`).join('')}</ol></nav></body></html>`);
  const uid = 'olivia-books-' + book.id;
  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="es"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">${xmlEsc(uid)}</dc:identifier><dc:title>${xmlEsc(book.title)}</dc:title><dc:creator>${xmlEsc(book.author || 'Olivia')}</dc:creator><dc:language>es</dc:language>
<meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>${book.coverData ? '<meta name="cover" content="cover-img"/>' : ''}</metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/>
<item id="title" href="titlepage.xhtml" media-type="application/xhtml+xml"/>${book.coverData ? '<item id="cover-img" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>' : ''}
${chapters.map((_, i) => `<item id="c${i + 1}" href="ch${i + 1}.xhtml" media-type="application/xhtml+xml"/>`).join('')}
${[...used.entries()].map(([id, v]) => `<item id="i-${xmlEsc(id)}" href="images/${v.name}" media-type="${v.mime}"/>`).join('')}</manifest>
<spine><itemref idref="title"/>${chapters.map((_, i) => `<itemref idref="c${i + 1}"/>`).join('')}</spine></package>`);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
}

/* ---------------- Compartir ---------------- */
const bookLink = book => location.href.split('#')[0] + '#/read/' + book.id;

async function shareFile(make, name, mime, book, toast) {
  const blob = await make();
  const file = new File([blob], name, { type: mime });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: book.title, text: `“${book.title}” de ${book.author || 'Olivia'}` }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  download(blob, name); toast('Tu dispositivo no permite compartir archivos: lo he descargado para que lo envíes tú.');
}

export function openExport(ctx) {
  const { book, toast } = ctx;
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  const link = bookLink(book), text = `📖 “${book.title}” de ${book.author || 'Olivia'}. Léelo aquí: ${link}`;
  bg.innerHTML = `<div class="modal"><h2>Exportar y compartir</h2><p class="muted" style="margin:0 0 4px">${esc(book.title)}</p>
    <button class="opt" data-a="pdf">📄<span><b>PDF</b><small>Con portada, índice y números de página. Elige “Guardar como PDF”.</small></span></button>
    <button class="opt" data-a="docx">📝<span><b>Word (.docx)</b><small>Editable en Word, Google Docs o LibreOffice.</small></span></button>
    <button class="opt" data-a="epub">📱<span><b>ePub</b><small>Libro electrónico para móvil, tablet o e-reader.</small></span></button>
    <h4 style="margin:16px 0 0;font-size:.78rem;text-transform:uppercase;color:var(--muted)">Compartir</h4>
    <button class="opt" data-a="wa">💬<span><b>WhatsApp</b><small>Enviar el enlace al libro.</small></span></button>
    <button class="opt" data-a="tg">✈️<span><b>Telegram</b><small>Enviar el enlace al libro.</small></span></button>
    <button class="opt" data-a="sys">🔗<span><b>Más opciones…</b><small>Compartir el enlace con cualquier app.</small></span></button>
    <button class="opt" data-a="file">📎<span><b>Enviar el libro como archivo</b><small>ePub (lo abre casi cualquier lector).</small></span></button>
    <p class="muted" style="font-size:.8rem">Quien reciba el enlace tendrá que registrarse y esperar a que Olivia le dé acceso.</p>
    <div style="text-align:right"><button class="btn" data-a="close">Cerrar</button></div></div>`;
  bg.addEventListener('mousedown', e => { if (e.target === bg) bg.remove(); });
  bg.addEventListener('click', async e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a;
    try {
      if (a === 'close') return bg.remove();
      if (a === 'wa') window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
      else if (a === 'tg') window.open('https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent(`📖 “${book.title}” de ${book.author || 'Olivia'}`), '_blank', 'noopener');
      else if (a === 'sys') {
        if (navigator.share) await navigator.share({ title: book.title, text: `“${book.title}”`, url: link });
        else { await navigator.clipboard.writeText(link); toast('Enlace copiado'); }
      } else if (a === 'pdf') { bg.remove(); await exportPDF(ctx); }
      else if (a === 'docx') { toast('Preparando Word…'); download(await buildDocx(ctx), slug(book.title) + '.docx'); }
      else if (a === 'epub') { toast('Preparando ePub…'); download(await buildEpub(ctx), slug(book.title) + '.epub'); }
      else if (a === 'file') { toast('Preparando archivo…'); await shareFile(() => buildEpub(ctx), slug(book.title) + '.epub', 'application/epub+zip', book, toast); }
    } catch (x) { if (x.name !== 'AbortError') { console.error(x); toast('Error: ' + x.message); } }
  });
  document.body.append(bg);
}
