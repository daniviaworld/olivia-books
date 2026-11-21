import { firebaseConfig, WRITER_EMAIL } from './firebase-config.js';
import { sanitize, dehydrate, hydrate, esc, compressImage, wordCount, COVERS, ILLUS, svgUrl, renderCover, renderIllus, botReply, BOT_CHIPS, libDB, parseName, normKey, epubInfo, epubToBook, pdfInfo, loadPdfJs } from './util.js';
import { openExport } from './export.js';

const FB = 'https://www.gstatic.com/firebasejs/10.14.1/';
const [{ initializeApp }, A, F] = await Promise.all([
  import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js')
]);

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const app = $('#app');
const store = { get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

/* ---------- Tema ---------- */
const prefs = { theme: store.get('ob-theme', 'light'), fs: +store.get('ob-fs', 19), font: store.get('ob-font', 'serif') };
function applyPrefs() {
  document.documentElement.dataset.theme = prefs.theme;
  document.documentElement.dataset.font = prefs.font;
  document.documentElement.style.setProperty('--fs', prefs.fs + 'px');
  const m = $('meta[name=theme-color]');
  if (m) m.content = { light: '#4a2fc4', dark: '#12101a', read: '#efe6d2', night: '#0f0b07' }[prefs.theme];
  store.set('ob-theme', prefs.theme); store.set('ob-fs', prefs.fs); store.set('ob-font', prefs.font);
}
applyPrefs();

function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms);
}

/* ---------- Config ---------- */
if (firebaseConfig.apiKey.startsWith('REEMPLAZA')) {
  app.innerHTML = `<div class="center-box"><div class="card"><h2>Falta configurar Firebase</h2>
  <p>Abre <code>firebase-config.js</code> y pega los datos de tu proyecto Firebase y el correo de Olivia. Los pasos están en <b>README.md</b>.</p></div></div>`;
  throw new Error('Firebase sin configurar');
}

const fbApp = initializeApp(firebaseConfig);
const auth = A.getAuth(fbApp);
auth.languageCode = 'es';
const db = F.initializeFirestore(fbApp, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
const { doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, collection, query, where, onSnapshot, serverTimestamp, writeBatch } = F;

const state = { user: null, isWriter: false, approved: false };
let unsubs = [], profileUnsub = null;
const cleanup = () => { unsubs.forEach(f => f()); unsubs = []; document.onkeydown = null; $('.pop')?.remove(); };

/* ---------- Componentes comunes ---------- */
const brand = `<a class="brand" href="#/"><img class="logo-img" src="icons/icon-192.png" alt=""><span>Olivia Books</span></a>`;
function topbar(mid = '', right = '') {
  return `<header class="topbar">${brand}<span class="spacer"></span>${mid}${right}
  <button class="btn icon" id="aaBtn" title="Apariencia">Aa</button>
  <button class="btn icon" id="userBtn" title="Cuenta">👤</button></header>`;
}
function bindTopbar(onPrefs) {
  $('#aaBtn')?.addEventListener('click', e => { e.stopPropagation(); openAa(onPrefs); });
  $('#userBtn')?.addEventListener('click', e => { e.stopPropagation(); openUser(); });
}
function closePop() { $('.pop')?.remove(); }
document.addEventListener('click', e => { // composedPath: el botón pulsado puede haberse redibujado ya
  if (!e.composedPath().some(n => n.classList?.contains('pop') || n.id === 'aaBtn' || n.id === 'userBtn')) closePop();
});

function openAa(onChange) {
  if ($('.pop')) return closePop();
  const p = document.createElement('div'); p.className = 'pop';
  const draw = () => {
    p.innerHTML = `<h4>Modo</h4><div class="themes">
      ${[['light', '☀️ Claro'], ['dark', '🌙 Oscuro'], ['read', '📜 Lectura'], ['night', '🌌 Lectura noche']].map(([t, n]) => `<button data-t="${t}" class="${prefs.theme === t ? 'on' : ''}">${n}</button>`).join('')}</div>
      <h4>Tamaño del texto</h4><div class="row"><button class="btn" id="fsm">A−</button><b id="fsv" style="flex:1;text-align:center">${prefs.fs}px</b><button class="btn" id="fsp">A+</button></div>
      <h4>Letra</h4><div class="row"><button class="btn ${prefs.font === 'serif' ? 'primary' : ''}" data-f="serif">Con serifa</button><button class="btn ${prefs.font === 'sans' ? 'primary' : ''}" data-f="sans">Sin serifa</button></div>`;
    $$('[data-t]', p).forEach(b => b.onclick = () => { prefs.theme = b.dataset.t; applyPrefs(); draw(); onChange?.(); });
    $$('[data-f]', p).forEach(b => b.onclick = () => { prefs.font = b.dataset.f; applyPrefs(); draw(); onChange?.(); });
    $('#fsm', p).onclick = () => { prefs.fs = Math.max(13, prefs.fs - 1); applyPrefs(); draw(); onChange?.(); };
    $('#fsp', p).onclick = () => { prefs.fs = Math.min(34, prefs.fs + 1); applyPrefs(); draw(); onChange?.(); };
  };
  draw(); document.body.append(p);
}
function openUser() {
  if ($('.pop')) return closePop();
  const p = document.createElement('div'); p.className = 'pop';
  p.innerHTML = `<b>${esc(state.user?.displayName || 'Mi cuenta')}</b><div class="muted" style="font-size:.85rem;margin-bottom:10px">${esc(state.user?.email)}<br>${state.isWriter ? '✍️ Escritora' : '📚 Lectora/or'}</div>
    ${state.isWriter ? '<button class="btn" style="width:100%;margin-bottom:8px" id="famBtn">👨‍👩‍👧 Familia y accesos</button>' : ''}
    <button class="btn" style="width:100%" id="outBtn">Cerrar sesión</button>`;
  document.body.append(p);
  $('#outBtn', p).onclick = () => A.signOut(auth);
  $('#famBtn', p)?.addEventListener('click', () => { closePop(); location.hash = '#/family'; });
}
function modal(html, onMount) {
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">${html}</div>`;
  bg.addEventListener('mousedown', e => { if (e.target === bg) bg.remove(); });
  document.body.append(bg); onMount?.(bg.firstElementChild, () => bg.remove());
  return () => bg.remove();
}

/* ---------- Autenticación ---------- */
const authErr = c => ({
  'auth/invalid-credential': 'Correo o contraseña incorrectos.', 'auth/wrong-password': 'Contraseña incorrecta.',
  'auth/user-not-found': 'No existe una cuenta con ese correo.', 'auth/email-already-in-use': 'Ese correo ya está registrado.',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.', 'auth/invalid-email': 'Correo no válido.',
  'auth/popup-closed-by-user': 'Cerraste la ventana de Google.', 'auth/too-many-requests': 'Demasiados intentos. Espera un poco.',
  'auth/network-request-failed': 'Sin conexión a internet.'
}[c] || 'No se pudo completar (' + c + ').');

function renderAuth() {
  cleanup();
  let mode = 'login';
  const draw = () => {
    app.innerHTML = `<div class="center-box"><div class="hero"><img class="logo-img" src="icons/icon-192.png" alt=""><h1 style="margin:0">Olivia Books</h1><p class="muted">Los libros de Olivia, para toda la familia</p></div>
    <div class="card"><div class="tabs"><button data-m="login" class="${mode === 'login' ? 'on' : ''}">Entrar</button><button data-m="register" class="${mode === 'register' ? 'on' : ''}">Registrarme</button></div>
    <form id="af">
      ${mode === 'register' ? '<label>Tu nombre</label><input type="text" id="an" autocomplete="name" required>' : ''}
      <label>Correo</label><input type="email" id="ae" autocomplete="email" required>
      <label>Contraseña</label><input type="password" id="ap" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" minlength="6" required>
      <div class="err" id="aerr"></div>
      <button class="btn primary" style="width:100%;justify-content:center" id="asub">${mode === 'login' ? 'Entrar' : 'Crear cuenta'}</button>
    </form>
    ${mode === 'login' ? '<p style="text-align:center;margin:14px 0 0"><a href="#" id="forgot">¿Olvidaste la contraseña?</a></p>' : ''}</div></div>`;
    $$('[data-m]').forEach(b => b.onclick = () => { mode = b.dataset.m; draw(); });
    $('#af').onsubmit = async e => {
      e.preventDefault(); const err = $('#aerr'); err.textContent = ''; $('#asub').disabled = true;
      try {
        const em = $('#ae').value.trim(), pw = $('#ap').value;
        if (mode === 'login') await A.signInWithEmailAndPassword(auth, em, pw);
        else {
          const c = await A.createUserWithEmailAndPassword(auth, em, pw);
          await A.updateProfile(c.user, { displayName: $('#an').value.trim() });
          await A.sendEmailVerification(c.user);
        }
      } catch (x) { err.textContent = authErr(x.code); $('#asub').disabled = false; }
    };
    $('#forgot')?.addEventListener('click', async e => {
      e.preventDefault(); const em = $('#ae').value.trim();
      if (!em) return ($('#aerr').textContent = 'Escribe tu correo y pulsa de nuevo.');
      try { await A.sendPasswordResetEmail(auth, em); toast('Te enviamos un correo para cambiar la contraseña'); } catch (x) { $('#aerr').textContent = authErr(x.code); }
    });
  };
  draw();
}

function renderVerify() {
  cleanup();
  app.innerHTML = `<div class="center-box"><div class="card" style="text-align:center"><div style="font-size:42px">✉️</div><h2>Verifica tu correo</h2>
  <p class="muted">Te hemos enviado un enlace a <b>${esc(state.user.email)}</b>. Ábrelo y vuelve aquí.</p>
  <button class="btn primary" id="vok" style="width:100%;justify-content:center">Ya lo verifiqué</button>
  <button class="btn" id="vre" style="width:100%;justify-content:center;margin-top:8px">Reenviar correo</button>
  <button class="btn" id="vout" style="width:100%;justify-content:center;margin-top:8px">Salir</button></div></div>`;
  $('#vok').onclick = async () => { await state.user.reload(); await state.user.getIdToken(true); handleUser(auth.currentUser); };
  $('#vre').onclick = async () => { try { await A.sendEmailVerification(state.user); toast('Correo reenviado'); } catch (x) { toast(authErr(x.code)); } };
  $('#vout').onclick = () => A.signOut(auth);
}

function renderPending() {
  cleanup();
  app.innerHTML = `<div class="center-box"><div class="card" style="text-align:center"><div style="font-size:42px">⏳</div><h2>Esperando aprobación</h2>
  <p class="muted">Olivia tiene que aprobar tu acceso para que puedas leer sus libros. Cuando lo haga, esta pantalla se abrirá sola.</p>
  <button class="btn" id="pout" style="width:100%;justify-content:center">Cerrar sesión</button></div></div>`;
  $('#pout').onclick = () => A.signOut(auth);
}

async function handleUser(u) {
  profileUnsub?.(); profileUnsub = null; state.approved = false;
  state.user = u;
  if (!u) return renderAuth();
  state.isWriter = (u.email || '').toLowerCase() === WRITER_EMAIL.toLowerCase();
  if (!u.emailVerified) return renderVerify();
  if (state.isWriter) { state.approved = true; return route(); }
  const ref = doc(db, 'users', u.uid);
  try {
    const s = await getDoc(ref);
    if (!s.exists()) await setDoc(ref, { email: u.email, name: u.displayName || u.email, approved: false, createdAt: serverTimestamp() });
  } catch (e) { console.warn(e); }
  let first = true;
  profileUnsub = onSnapshot(ref, s => {
    const ok = !!s.data()?.approved;
    if (first || ok !== state.approved) { first = false; state.approved = ok; route(); }
  });
}
A.onAuthStateChanged(auth, handleUser);

/* ---------- Router ---------- */
function route() {
  if (!state.user) return;
  if (!state.user.emailVerified) return renderVerify();
  if (!state.approved) return renderPending();
  cleanup();
  const [, page, id] = location.hash.slice(1).split('/');
  if (page === 'shelf') return renderShelf();
  if (page === 'book' && id) return renderImported(id);
  if (page === 'fshelf') return renderFamShelf();
  if (page === 'fbook' && id) return renderFamBook(id);
  if (page === 'read' && id) return renderReader(id);
  if (page === 'edit' && id && state.isWriter) return renderEditor(id);
  if (page === 'family' && state.isWriter) return renderFamily();
  return renderLibrary();
}
window.addEventListener('hashchange', route);

/* ---------- Biblioteca ---------- */
let backHash = '#/shelf';
const subtabs = on => `<nav class="subseg"><a href="#/shelf" class="${on === 'me' ? 'on' : ''}">📱 Personal</a><a href="#/fshelf" class="fam ${on === 'fam' ? 'on' : ''}">👨‍👩‍👧 Familia</a></nav>`;
const tabs = on => `<nav class="seg"><a href="#/" class="${on === 'home' ? 'on' : ''}">${state.isWriter ? '✏️ Mis libros' : '📖 Libros de Olivia'}</a><a href="#/shelf" class="${on === 'shelf' ? 'on' : ''}">📚 Mi biblioteca</a></nav>`;
function renderLibrary() {
  app.innerHTML = topbar() + `<div class="container">${tabs('home')}<div class="row" style="justify-content:space-between"><h1 class="page-title">${state.isWriter ? 'Mis libros' : 'Biblioteca de Olivia'}</h1>
    ${state.isWriter ? '<button class="btn primary" id="newBook">＋ Nuevo libro</button>' : ''}</div><div id="lib"><div class="spinner"></div></div></div>`;
  bindTopbar();
  const q = state.isWriter ? collection(db, 'books') : query(collection(db, 'books'), where('published', '==', true));
  unsubs.push(onSnapshot(q, snap => {
    const books = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
    $('#lib').innerHTML = books.length ? `<div class="grid">${books.map(b => `<div class="book" data-id="${b.id}">
      <div class="cover" ${b.coverData ? `style="background-image:url('${b.coverData}')"` : ''}>${b.coverData ? '' : esc(b.title)}</div>
      <div class="meta"><b>${esc(b.title)}</b><span class="muted" style="font-size:.82rem">${esc(b.author || '')}</span><br>
      ${state.isWriter ? `<span class="tag ${b.published ? 'pub' : ''}">${b.published ? 'Publicado' : 'Borrador'}</span>` : ''}</div></div>`).join('')}</div>`
      : `<div class="empty"><div style="font-size:48px">📚</div><p>${state.isWriter ? 'Aún no tienes libros. ¡Crea el primero!' : 'Todavía no hay libros publicados.'}</p></div>`;
    $$('.book').forEach(el => el.onclick = () => location.hash = '#/read/' + el.dataset.id);
  }, e => { $('#lib').innerHTML = `<div class="empty">No se pudo cargar (${esc(e.code)}).</div>`; }));
  $('#newBook')?.addEventListener('click', newBookModal);
}

function newBookModal() {
  modal(`<h2>Nuevo libro</h2><label>Título</label><input type="text" id="nbT" placeholder="El título de tu libro">
    <label>Autora</label><input type="text" id="nbA" value="${esc(state.user.displayName || '')}">
    <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn" id="nbC">Cancelar</button><button class="btn primary" id="nbOk">Crear</button></div>`,
    (m, close) => {
      $('#nbC', m).onclick = close;
      $('#nbOk', m).onclick = async () => {
        const title = $('#nbT', m).value.trim() || 'Sin título';
        const ref = await addDoc(collection(db, 'books'), { title, author: $('#nbA', m).value.trim(), published: false, coverData: '', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        await addDoc(collection(db, 'books', ref.id, 'chapters'), { title: 'Capítulo 1', html: '', order: 1, updatedAt: serverTimestamp() });
        close(); location.hash = '#/edit/' + ref.id;
      };
    });
}

/* ---------- Carga de un libro ---------- */
async function loadBook(id) {
  const [b, cs, is] = await Promise.all([getDoc(doc(db, 'books', id)), getDocs(collection(db, 'books', id, 'chapters')), getDocs(collection(db, 'books', id, 'images'))]);
  if (!b.exists()) throw new Error('not-found');
  const imgs = new Map(); is.forEach(d => imgs.set(d.id, d.data()));
  const chapters = cs.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
  return { book: { id, ...b.data() }, chapters, imgs };
}

/* ---------- Lector paginado ---------- */
async function renderReader(id, imp = null) {
  app.innerHTML = topbar() + '<div class="spinner"></div>';
  bindTopbar();
  let data;
  try { data = imp ? await imp.load() : await loadBook(id); } catch (e) { console.error(e); app.innerHTML = topbar() + `<div class="empty">No se pudo abrir el libro.<br>${imp ? esc(e.message || '') + '<br>' : ''}<a href="${imp ? backHash : '#/'}">Volver</a></div>`; bindTopbar(); return; }
  const { book, chapters, imgs } = data;
  if (imp) unsubs.push(() => (data.urls || []).forEach(u => URL.revokeObjectURL(u)));
  const savedPos = +store.get('ob-pos-' + id, 0);   // posición guardada: se lee antes de que ninguna maquetación la pise
  app.innerHTML = `<div class="reader">${topbar(`<span class="title-mini">${esc(book.title)}</span>`,
    `${imp ? `<a class="btn icon" href="${backHash}" title="Mi biblioteca">📚</a>` : ''}<button class="btn icon" id="tocBtn" title="Índice">☰</button>${imp ? '' : '<button class="btn icon" id="shBtn" title="Compartir / exportar">⤴</button>'}${!imp && state.isWriter ? `<a class="btn" href="#/edit/${id}">✏️ Editar</a>` : ''}`)}
    <div class="stage"><div class="paper"><div class="pager" id="pager"><div class="pages content${imp ? ' ep' : ''}" id="pages"${imp && data.lang ? ` lang="${esc(data.lang)}"` : ''}></div></div>
    <button class="nav-zone l" id="prev" aria-label="Página anterior"></button><button class="nav-zone r" id="next" aria-label="Página siguiente"></button></div></div>
    <div class="bottombar"><button class="btn icon" id="p1">‹</button><input type="range" id="rng" min="1" max="1" value="1"><span class="pg" id="pg"></span><button class="btn icon" id="p2">›</button></div></div>`;
  const pager = $('#pager'), pages = $('#pages');
  let W = 0, total = 1, cur = 0;
  const startPages = [];

  pages.innerHTML = `<section class="titlepage">${book.coverData ? `<img class="cv" src="${book.coverData}" alt="Portada">` : ''}<h1>${esc(book.title)}</h1><div class="by">${esc(book.author || '')}</div></section>` +
    chapters.map(c => c.raw ? `<section data-ch="${c.id}" id="${c.id}"${c.nb ? ' class="nb"' : ''}>${c.html}</section>` : `<section data-ch="${c.id}"><h2 class="chap-title">${esc(c.title)}</h2>${sanitize(c.html)}</section>`).join('');
  hydrate(pages, imgs);

  const imgsReady = Promise.all($$('img', pages).map(i => i.decode?.().catch(() => {}) ?? 0));
  /* Ajusta los dibujos para que no queden solos en una página: si no caben en el hueco
     que queda al final de la página anterior, se encogen para entrar. */
  function fitImages() {
    const ims = $$('img', pages); ims.forEach(i => { i.style.maxHeight = ''; });
    const col = x => Math.floor((x - pages.getBoundingClientRect().left + 3) / W);
    const bottom = pager.getBoundingClientRect().top + pager.clientHeight - 24;
    for (let pass = 0; pass < 2; pass++) for (const im of ims) {
      let prev = im.previousElementSibling || im.parentElement?.previousElementSibling;
      if (!prev || prev === pages) continue;
      const rs = prev.getClientRects(); if (!rs.length) continue;
      const last = rs[rs.length - 1], r = im.getBoundingClientRect();
      if (col(r.left) <= col(last.left)) continue;          // ya está en la misma página
      const cs = getComputedStyle(im), mg = parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
      const free = bottom - last.bottom - mg - 6;
      if (free >= 70 && free < r.height) im.style.maxHeight = Math.floor(free) + 'px';
    }
  }
  function layout(keepRatio = true) {
    if (!pager.isConnected) return;
    const ratio = total > 1 ? cur / (total - 1) : 0;
    W = pager.clientWidth;
    pages.style.setProperty('--ph', (pager.clientHeight - 60) + 'px');
    fitImages();
    total = Math.max(1, Math.ceil(pager.scrollWidth / W - 0.02));
    const pr = pages.getBoundingClientRect().left;
    startPages.length = 0;
    $$('section', pages).forEach(s => startPages.push(Math.max(0, Math.floor((s.getBoundingClientRect().left - pr + 3) / W))));
    $('#rng').max = total;
    goto(keepRatio ? Math.round(ratio * (total - 1)) : cur, false);
  }
  function goto(n, smooth = true) {
    cur = Math.max(0, Math.min(total - 1, n));
    pager.style.scrollBehavior = smooth ? 'smooth' : 'auto';
    pager.scrollTo({ left: cur * W });
    update();
  }
  function update() {
    if (!$('#pg')) return;
    $('#pg').textContent = cur === 0 ? 'Portada' : `Página ${cur} de ${total - 1}${imp ? ' · ' + Math.round(cur / Math.max(1, total - 1) * 100) + ' %' : ''}`;
    if (imp && total > 1) imp.save(cur / (total - 1));
    $('#rng').value = cur + 1;
    store.set('ob-pos-' + id, cur / Math.max(1, total - 1));
  }
  let st; unsubs.push(() => clearTimeout(st)); pager.addEventListener('scroll', () => {
    clearTimeout(st); st = setTimeout(() => { if (!pager.isConnected) return; const n = Math.round(pager.scrollLeft / W); if (n !== cur) { cur = Math.max(0, Math.min(total - 1, n)); update(); } pager.scrollTo({ left: cur * W }); }, 90);
  });
  $('#next').onclick = $('#p2').onclick = () => goto(cur + 1);
  $('#prev').onclick = $('#p1').onclick = () => goto(cur - 1);
  $('#rng').oninput = e => goto(+e.target.value - 1);
  document.onkeydown = e => {
    if (e.target.matches('input,textarea')) return;
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); goto(cur + 1); }
    if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); goto(cur - 1); }
  };
  const ro = new ResizeObserver(() => layout()); ro.observe(pager); unsubs.push(() => ro.disconnect());
  bindTopbar(() => requestAnimationFrame(() => layout()));
  if (!imp) $('#shBtn').onclick = () => openExport({ book, chapters, imgs, toast });
  $('#tocBtn').onclick = () => modal(`<h2>Índice</h2>${chapters.map((c, i) => `<button class="opt" data-i="${i}"><span style="flex:1">${esc(c.title)}</span><span class="muted">pág. ${Math.max(1, startPages[i + 1] ?? 1)}</span></button>`).join('') || '<p class="muted">Sin capítulos.</p>'}`,
    (m, close) => $$('[data-i]', m).forEach(b => b.onclick = () => { close(); goto(startPages[+b.dataset.i + 1] ?? 0); }));

  if (imp) {
    const aMap = data.anchorMap, byId = t => document.getElementById(t);
    const pageOf = el => { const r = el.getClientRects()[0] || el.getBoundingClientRect(); return Math.max(0, Math.floor((r.left - pages.getBoundingClientRect().left + 3) / W)); };
    let back = null; const bb = document.createElement('button'); bb.className = 'backchip hidden'; bb.textContent = '↩ Volver'; $('.stage').append(bb);
    bb.onclick = () => { if (back != null) goto(back); back = null; bb.classList.add('hidden'); };
    const jump = t => { const el = t && byId(t); if (!el) return; back = cur; bb.classList.remove('hidden'); goto(pageOf(el)); };
    pages.addEventListener('click', e => { const a = e.target.closest('a[data-go]'); if (!a) return; e.preventDefault(); const k = a.dataset.go; jump(aMap.get(k) || aMap.get(k.split('#')[0] + '#')); });
    $('#tocBtn').onclick = () => {
      const items = data.toc.length ? data.toc : chapters.map((c, i) => ({ title: 'Parte ' + (i + 1), depth: 0, target: c.id }));
      modal(`<h2>Índice</h2>${items.map((t, i) => { const el = byId(t.target); return `<button class="opt" data-i="${i}" style="padding-left:${12 + t.depth * 16}px"><span style="flex:1">${esc(t.title)}</span><span class="muted">${el ? 'pág. ' + Math.max(1, pageOf(el)) : ''}</span></button>`; }).join('') || '<p class="muted">Este libro no tiene índice.</p>'}`,
        (m, close) => $$('[data-i]', m).forEach(b => b.onclick = () => { close(); const el = byId(items[+b.dataset.i].target); if (el) goto(pageOf(el)); }));
    };
  }

  await imgsReady;
  await document.fonts?.ready;
  layout(false);
  goto(Math.round(savedPos * (total - 1)), false);
  const t2 = setTimeout(() => layout(true), 250); unsubs.push(() => clearTimeout(t2));
}

/* ---------- Editor (solo escritora) ---------- */
async function renderEditor(id) {
  app.innerHTML = topbar() + '<div class="spinner"></div>'; bindTopbar();
  let data;
  try { data = await loadBook(id); } catch { location.hash = '#/'; return; }
  const { book, imgs } = data; let chapters = data.chapters;
  let active = chapters[0]?.id, dirty = false, timer = null, lastRange = null, selImg = null;
  if (!chapters.length) { const r = await addDoc(collection(db, 'books', id, 'chapters'), { title: 'Capítulo 1', html: '', order: 1, updatedAt: serverTimestamp() }); chapters = [{ id: r.id, title: 'Capítulo 1', html: '', order: 1 }]; active = r.id; }

  app.innerHTML = topbar(`<button class="btn drawer-btn" id="drw">☰ Capítulos</button><span class="title-mini" id="bk">${esc(book.title)}</span>`,
    `<button class="btn icon" id="helpBtn" title="Ayuda">❓</button><a class="btn" href="#/read/${id}">👁 Leer</a><button class="btn icon" id="shBtn" title="Exportar / compartir">⤴</button>`) +
    `<div class="editor"><aside class="side" id="side">
      <button class="btn" style="width:100%;justify-content:center;margin-bottom:8px" id="coverBtn">🖼 Portada del libro</button>
      <button class="btn" style="width:100%;justify-content:center" id="bset">⚙️ Ajustes del libro</button>
      <h3>Capítulos</h3><div id="chl"></div>
      <button class="btn primary" style="width:100%;justify-content:center;margin-top:10px" id="addCh">＋ Nuevo capítulo</button><div class="muted" id="stats" style="margin-top:14px;font-size:.95rem"></div></aside>
      <main class="write"><div class="pgbar" id="pgbar"><div class="pgpill" id="pgInfo">📄 Página <b>1</b> de <b>1</b></div><div class="pgchap" id="pgChap"></div><span class="status" id="stt"></span></div>
      <div class="tip hidden" id="tip"><span>📚 <b>¿Tu libro es un solo texto largo?</b> Pulsa <b>🧚 Ayudante → Sugerir capítulos</b> y te digo dónde cortar. O toca en el texto y pulsa <b>✂️ Capítulo nuevo aquí</b>.</span><button id="tipX" aria-label="Cerrar">✕</button></div>
      <div class="sheet content"><div id="liveChip" class="live-chip hidden" aria-live="polite"></div><input type="text" id="chTitle" placeholder="Título del capítulo" autocomplete="off"><div id="editor" class="body" contenteditable="true" spellcheck="true" lang="es" data-ph="✏️ Escribe aquí tu historia…"></div>
      <div class="muted" id="wc" style="font-size:.85rem"></div></div><div class="dock" id="tb">
        <button id="splitBtn" class="d-main" title="Empieza aquí un capítulo nuevo"><i>✂️</i><span>Capítulo nuevo</span></button>
        <button id="helperBtn" class="d-pink" title="Te ayudo con capítulos, faltas y portada"><i>🧚</i><span>Ayudante</span></button>
        <button id="imgBtn" title="Poner un dibujo o una foto"><i>🖼</i><span>Dibujo</span></button>
        <button id="titBtn" title="Convierte la línea en un título grande"><i>🔠</i><span>Título</span></button>
        <button data-c="undo" title="Deshacer lo último"><i>↶</i><span>Deshacer</span></button>
        <button id="moreBtn" title="Más cosas"><i>➕</i><span>Más</span></button>
        <div class="more hidden" id="more">
          <button data-c="bold" title="Letra gorda"><i><b>N</b></i><span>Negrita</span></button><button data-c="italic" title="Letra inclinada"><i><em>K</em></i><span>Cursiva</span></button><button data-c="underline"><i><u>S</u></i><span>Subrayado</span></button>
          <button id="pbBtn" title="Empezar una hoja nueva"><i>📄</i><span>Hoja nueva</span></button><button id="liveBtn" title="Te aviso de las faltas mientras escribes">🔤 Corrector: apagado</button><button id="qBtn"><i>❝</i><span>Cita</span></button>
          <button data-c="justifyLeft"><i>⯇</i><span>Izquierda</span></button><button data-c="justifyCenter"><i>≡</i><span>Centro</span></button><button data-c="justifyRight"><i>⯈</i><span>Derecha</span></button>
          <button data-c="insertUnorderedList"><i>•</i><span>Lista</span></button><button data-c="insertOrderedList"><i>1.</i><span>Lista 1,2,3</span></button><button data-c="redo"><i>↷</i><span>Rehacer</span></button>
          <button id="mergeBtn" class="wide"><i>⛓</i><span>Unir con el capítulo de antes</span></button>
        </div>
        <input type="file" id="file" accept="image/*" class="hidden"></div></main></div>`;
  bindTopbar();
  document.execCommand('defaultParagraphSeparator', false, 'p');
  const ed = $('#editor'), ti = $('#chTitle'), stt = $('#stt');

  const drawList = () => {
    $('#chl').innerHTML = chapters.map((c, i) => `<div class="chap ${c.id === active ? 'on' : ''}" data-id="${c.id}"><span class="t">${i + 1}. ${esc(c.title || 'Sin título')}</span><span class="pn">${starts[c.id] ? 'p. ' + starts[c.id] : ''}</span>
      <button data-up="${c.id}" title="Subir" ${i === 0 ? 'disabled' : ''}>▲</button><button data-dn="${c.id}" title="Bajar" ${i === chapters.length - 1 ? 'disabled' : ''}>▼</button><button data-del="${c.id}" title="Borrar">🗑</button></div>`).join('');
    const words = chapters.reduce((a, c) => a + wordCount(c.html || ''), 0);
    $('#stats').innerHTML = `📖 ${chapters.length} capítulo${chapters.length === 1 ? '' : 's'}<br>✍️ ${words} palabras<br>📄 unas ${Math.max(1, Math.ceil(words / 170))} páginas`;
    $$('.chap').forEach(el => el.onclick = async e => {
      const b = e.target.closest('button');
      if (b?.dataset.up) return move(b.dataset.up, -1);
      if (b?.dataset.dn) return move(b.dataset.dn, 1);
      if (b?.dataset.del) return delChap(b.dataset.del);
      await flush(); active = el.dataset.id; show(); $('#side').classList.remove('open');
    });
  };
  const cur = () => chapters.find(c => c.id === active);
  function show() {
    const c = cur(); ti.value = c.title || ''; ed.innerHTML = sanitize(c.html); hydrate(ed, imgs);
    $('#wc').textContent = wordCount(ed.innerHTML) + ' palabras'; stt.textContent = ''; drawList(); hideImgTools(); emptyCheck(); tipCheck(); liveReset(); schedPages(150);
  }
  async function flush() {
    clearTimeout(timer); if (!dirty) return; dirty = false;
    const c = cur(); if (!c) return;
    try {
      c.title = ti.value.trim() || 'Sin título'; c.html = dehydrate(ed.innerHTML);
      stt.textContent = '💾 Guardando…';
      const slow = setTimeout(() => { if (!dirty && stt.textContent === '💾 Guardando…') stt.textContent = '📱 Guardado aquí (se subirá con la conexión)'; }, 2500);
      // el guardado local es inmediato; la confirmación del servidor puede tardar
      Promise.all([
        setDoc(doc(db, 'books', id, 'chapters', c.id), { title: c.title, html: c.html, order: c.order, updatedAt: serverTimestamp() }, { merge: true }),
        updateDoc(doc(db, 'books', id), { updatedAt: serverTimestamp() })
      ]).then(() => { clearTimeout(slow); if (!dirty) stt.textContent = '✅ Todo guardado'; drawList(); })
        .catch(e => { clearTimeout(slow); stt.textContent = '⚠️ No se pudo guardar'; dirty = true; console.error(e); });
    } catch (e) { stt.textContent = '⚠️ No se pudo guardar'; dirty = true; console.error(e); }
  }
  const touch = () => { dirty = true; stt.textContent = '✏️ Escribiendo…'; $('#wc').textContent = wordCount(ed.innerHTML) + ' palabras'; clearTimeout(timer); timer = setTimeout(flush, 1200); schedPages(); };
  ed.addEventListener('input', () => { touch(); hideFix(); scheduleLive(); }); ti.addEventListener('input', touch);
  window.addEventListener('beforeunload', () => { if (dirty) flush(); });
  unsubs.push(() => { flush(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  ed.addEventListener('paste', e => {
    e.preventDefault();
    const h = e.clipboardData.getData('text/html'), t = e.clipboardData.getData('text/plain');
    document.execCommand('insertHTML', false, h ? sanitize(h).replace(/<img[^>]*>/g, '') : esc(t).replace(/\n/g, '<br>'));
  });
  document.addEventListener('selectionchange', () => {
    const s = getSelection(); if (s.rangeCount && ed.contains(s.anchorNode)) lastRange = s.getRangeAt(0).cloneRange();
  });

  async function move(cid, dir) {
    await flush();
    const i = chapters.findIndex(c => c.id === cid), j = i + dir; if (j < 0 || j >= chapters.length) return;
    [chapters[i], chapters[j]] = [chapters[j], chapters[i]];
    const b = writeBatch(db); chapters.forEach((c, k) => { c.order = k + 1; b.update(doc(db, 'books', id, 'chapters', c.id), { order: c.order }); });
    await b.commit(); drawList();
  }
  async function delChap(cid) {
    const c = chapters.find(x => x.id === cid);
    if (!confirm(`¿Borrar "${c.title}"? No se puede deshacer.`)) return;
    clearTimeout(timer); dirty = false;
    await deleteDoc(doc(db, 'books', id, 'chapters', cid));
    chapters = chapters.filter(x => x.id !== cid);
    if (!chapters.length) { const r = await addDoc(collection(db, 'books', id, 'chapters'), { title: 'Capítulo 1', html: '', order: 1, updatedAt: serverTimestamp() }); chapters = [{ id: r.id, title: 'Capítulo 1', html: '', order: 1 }]; }
    if (active === cid) active = chapters[0].id; show();
  }
  $('#addCh').onclick = async () => {
    await flush();
    const n = chapters.length + 1, r = await addDoc(collection(db, 'books', id, 'chapters'), { title: 'Capítulo ' + n, html: '', order: n, updatedAt: serverTimestamp() });
    chapters.push({ id: r.id, title: 'Capítulo ' + n, html: '', order: n }); active = r.id; show(); ti.select(); $('#side').classList.remove('open');
  };
  $('#drw').onclick = () => $('#side').classList.toggle('open');

  const tipCheck = () => $('#tip').classList.toggle('hidden', !(chapters.length === 1 && wordCount(ed.innerHTML) > 250 && !store.get('ob-tip-' + id, '')));
  $('#tipX').onclick = () => { store.set('ob-tip-' + id, '1'); tipCheck(); };
  const hasContent = n => !!(n.textContent || '').trim() || !!n.querySelector?.('img');

  $('#splitBtn').onclick = () => {
    if (!lastRange || !ed.contains(lastRange.startContainer)) return toast('👆 Toca en el texto, justo donde empieza el capítulo nuevo');
    const r = lastRange.cloneRange(); r.collapse(true);
    const pre = document.createRange(); pre.selectNodeContents(ed); pre.setEnd(r.startContainer, r.startOffset);
    const post = r.cloneRange(); post.setEnd(ed, ed.childNodes.length);
    if (!hasContent(pre.cloneContents())) return toast('Pon el cursor un poco más abajo: el capítulo de antes se quedaría vacío');
    if (!hasContent(post.cloneContents())) return toast('Pon el cursor antes: no hay texto después de ahí');
    const i = chapters.findIndex(c => c.id === active);
    modal(`<h2>✂️ Capítulo nuevo</h2><p style="font-size:1.05rem">Todo lo que está <b>desde el cursor hasta el final</b> pasará a un capítulo nuevo.</p>
      <label>¿Cómo se llama el capítulo nuevo?</label><input type="text" id="scT" value="Capítulo ${i + 2}" style="font-size:1.1rem">
      <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn" id="scX">Cancelar</button><button class="btn primary" id="scOk" style="font-size:1.05rem">✂️ Crear capítulo</button></div>`,
      (m, close) => {
        const inp = $('#scT', m); inp.focus(); inp.select();
        $('#scX', m).onclick = close;
        $('#scOk', m).onclick = async () => {
          close();
          const frag = post.extractContents(); const tmp = document.createElement('div'); tmp.append(frag);
          while (ed.lastElementChild && ed.lastElementChild.tagName !== 'IMG' && !ed.lastElementChild.classList.contains('pagebreak') && !hasContent(ed.lastElementChild)) ed.lastElementChild.remove();
          [...tmp.children].forEach(el => { if (el.tagName === 'P' && !hasContent(el)) el.remove(); else return; });
          dirty = true; await flush();
          const nc = { title: inp.value.trim() || 'Capítulo ' + (i + 2), html: dehydrate(tmp.innerHTML), order: i + 2 };
          const ref = await addDoc(collection(db, 'books', id, 'chapters'), { title: nc.title, html: nc.html, order: nc.order, updatedAt: serverTimestamp() });
          nc.id = ref.id; chapters.splice(i + 1, 0, nc);
          const b = writeBatch(db); chapters.forEach((c, k) => { c.order = k + 1; b.update(doc(db, 'books', id, 'chapters', c.id), { order: c.order }); });
          await b.commit(); active = nc.id; show(); toast('✅ ¡Capítulo creado!');
        };
      });
  };
  $('#mergeBtn').onclick = async () => {
    const i = chapters.findIndex(c => c.id === active);
    if (i < 1) return toast('Este es el primer capítulo: no hay uno de antes');
    if (!confirm(`¿Unir "${chapters[i].title}" con "${chapters[i - 1].title}"? El texto se pasará al final del capítulo de antes.`)) return;
    dirty = true; await flush();
    const prev = chapters[i - 1], cur = chapters[i];
    prev.html = (prev.html || '') + (cur.html || '');
    await setDoc(doc(db, 'books', id, 'chapters', prev.id), { html: prev.html, updatedAt: serverTimestamp() }, { merge: true });
    await deleteDoc(doc(db, 'books', id, 'chapters', cur.id));
    chapters.splice(i, 1);
    const b = writeBatch(db); chapters.forEach((c, k) => { c.order = k + 1; b.update(doc(db, 'books', id, 'chapters', c.id), { order: c.order }); });
    await b.commit(); active = prev.id; show(); toast('✅ Capítulos unidos');
  };

  /* ================= 🧚 AYUDANTE ================= */
  function textMap(root) {
    const nodes = []; let text = '', last = null, n;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while ((n = w.nextNode())) {
      const blk = n.parentElement.closest('p,div,h1,h2,h3,h4,li,blockquote') || root;
      if (last && blk !== last && !text.endsWith('\n')) text += '\n';
      last = blk; nodes.push({ n, start: text.length }); text += n.nodeValue;
    }
    return { text, nodes };
  }
  function rangeAt(map, off) {
    for (const it of map.nodes) if (off >= it.start && off <= it.start + it.n.nodeValue.length) {
      const r = document.createRange(); r.setStart(it.n, off - it.start); r.collapse(true); return r;
    }
    return null;
  }
  const STRONG = /^[¡¿"«\s]*(al día siguiente|a la mañana siguiente|por la mañana|por la tarde|por la noche|esa noche|aquella noche|esa mañana|aquella mañana|esa tarde|una noche|una mañana|una tarde|un día|otro día|el día siguiente|al otro día|al amanecer|al anochecer|al atardecer|al cabo de|después de|más tarde|mientras tanto|poco después|días después|semanas después|meses después|años después|dos días|tres días|una semana|un mes|un año|al llegar|en ese momento|capítulo)\b/i;
  const WEAK = /^[¡¿"«\s]*(de repente|de pronto|entonces|al final|por fin|finalmente|por último)\b/i;

  /** Busca buenos sitios para cortar: cambios de momento, párrafos nuevos y capítulos de tamaño parecido. */
  function suggestCuts(map) {
    const T = map.text, starts = [...T.matchAll(/\S+/g)].map(m => m.index), total = starts.length;
    if (total < 260) return { total, cuts: [] };
    const wordsBefore = off => { let lo = 0, hi = total; while (lo < hi) { const mid = (lo + hi) >> 1; if (starts[mid] < off) lo = mid + 1; else hi = mid; } return lo; };
    const cands = new Map();
    const add = (off, props) => { const c = cands.get(off) || { off, para: false, blank: false }; Object.assign(c, props); cands.set(off, c); };
    for (const m of T.matchAll(/\n+(?=\S)/g)) add(m.index + m[0].length, { para: true, blank: m[0].length > 1 });
    for (const m of T.matchAll(/[.!?…]["»”)]*[ \t]+(?=[A-ZÁÉÍÓÚÑ¡¿"«])/g)) add(m.index + m[0].length, {});
    const list = [...cands.values()].map(c => {
      const after = T.slice(c.off, c.off + 90);
      let signal = 0, kind = 'frase';
      if (STRONG.test(after)) { signal += 3; kind = 'tiempo'; } else if (WEAK.test(after)) { signal += 1.5; kind = 'tiempo'; }
      if (c.para) { signal += 1.2; if (kind === 'frase') kind = 'parrafo'; }
      if (c.blank) signal += 0.8;
      return { ...c, signal, kind, wb: wordsBefore(c.off) };
    }).filter(c => c.wb > 40 && c.wb < total - 40);
    const n = Math.max(2, Math.round(total / 420)), W = total / n, cuts = [];
    let prev = 0;
    for (let k = 1; k < n; k++) {
      const target = k * W;
      const pool = list.filter(c => c.wb > prev + W * 0.5 && c.wb < total - W * 0.4);
      if (!pool.length) break;
      const near = pool.filter(c => Math.abs(c.wb - target) < W * 0.4);
      const use = near.length ? near : pool;
      use.sort((a, b) => (b.signal - Math.abs(b.wb - target) / W * 2.5) - (a.signal - Math.abs(a.wb - target) / W * 2.5));
      const best = use[0]; cuts.push(best); prev = best.wb;
    }
    return { total, cuts: cuts.map(c => {
      const before = T.slice(Math.max(0, c.off - 70), c.off).replace(/\n/g, ' ').trim().split(/\s+/).slice(-8).join(' ');
      const after = T.slice(c.off, c.off + 110).replace(/\n/g, ' ').trim().split(/\s+/).slice(0, 10).join(' ');
      const why = c.kind === 'tiempo' ? '⏰ Aquí cambia el momento de la historia' : c.kind === 'parrafo' ? '📄 Empieza un párrafo nuevo' : '✍️ Final de una frase: buen sitio para descansar';
      return { off: c.off, before, after, why, words: c.wb };
    }) };
  }

  async function applyCuts(cuts, map) {
    dirty = true; await flush();
    const i = chapters.findIndex(c => c.id === active);
    const made = [];
    for (const c of [...cuts].reverse()) {
      const r = rangeAt(map, c.off); if (!r) continue;
      const post = r.cloneRange(); post.setEnd(ed, ed.childNodes.length);
      const tmp = document.createElement('div'); tmp.append(post.extractContents());
      while (tmp.firstElementChild && tmp.firstElementChild.tagName === 'P' && !hasContent(tmp.firstElementChild)) tmp.firstElementChild.remove();
      made.unshift({ title: c.title, html: dehydrate(tmp.innerHTML) });
    }
    while (ed.lastElementChild && ed.lastElementChild.tagName !== 'IMG' && !ed.lastElementChild.classList.contains('pagebreak') && !hasContent(ed.lastElementChild)) ed.lastElementChild.remove();
    dirty = true; await flush();
    for (let k = 0; k < made.length; k++) {
      const nc = { title: made[k].title, html: made[k].html, order: i + 2 + k };
      const ref = await addDoc(collection(db, 'books', id, 'chapters'), { title: nc.title, html: nc.html, order: nc.order, updatedAt: serverTimestamp() });
      nc.id = ref.id; chapters.splice(i + 1 + k, 0, nc);
    }
    const b = writeBatch(db); chapters.forEach((c, k) => { c.order = k + 1; b.update(doc(db, 'books', id, 'chapters', c.id), { order: c.order }); });
    await b.commit(); show();
    toast(`✅ ¡Listo! Ahora tienes ${chapters.length} capítulos`);
  }

  function suggestModal() {
    const map = textMap(ed), { total, cuts } = suggestCuts(map);
    if (!cuts.length) return modal(`<h2>💡 Sugerir capítulos</h2><p style="font-size:1.05rem">Tu texto todavía es corto (${total} palabras). Cuando lleve unas 300 palabras o más, te propongo dónde cortarlo en capítulos. ¡Sigue escribiendo! ✍️</p><div style="text-align:right"><button class="btn primary" id="oK">Vale</button></div>`, (m, close) => { $('#oK', m).onclick = close; });
    const first = chapters.findIndex(c => c.id === active);
    modal(`<h2>💡 Te propongo ${cuts.length} cortes</h2><p class="muted" style="margin:0 0 6px">Tu texto tiene ${total} palabras. El <b>✂️</b> marca dónde empezaría cada capítulo nuevo. Quita la marca de los que no quieras.</p>
      ${cuts.map((c, k) => `<div class="sug"><label style="display:flex;gap:8px;align-items:center;margin:0;color:var(--text);font-weight:700"><input type="checkbox" data-k="${k}" checked style="width:22px;height:22px"> Capítulo ${first + 2 + k}</label>
        <div class="ctx muted">…${esc(c.before)} <mark>✂️</mark> <b style="color:var(--text)">${esc(c.after)}…</b></div>
        <div style="font-size:.88rem;margin:4px 0">${c.why}</div>
        <input type="text" data-t="${k}" value="Capítulo ${first + 2 + k}" aria-label="Nombre del capítulo"></div>`).join('')}
      <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn" id="sgX">Ahora no</button><button class="btn primary" id="sgOk" style="font-size:1.05rem">✂️ Crear capítulos</button></div>`,
      (m, close) => {
        $('#sgX', m).onclick = close;
        $('#sgOk', m).onclick = async () => {
          const chosen = cuts.map((c, k) => ({ ...c, k, on: $(`[data-k="${k}"]`, m).checked, title: $(`[data-t="${k}"]`, m).value.trim() })).filter(c => c.on)
            .map((c, n) => ({ ...c, title: (!c.title || c.title === 'Capítulo ' + (first + 2 + c.k)) ? 'Capítulo ' + (first + 2 + n) : c.title }));
          close(); if (chosen.length) await applyCuts(chosen, map); else toast('No elegiste ningún corte');
        };
      });
  }

  async function spellModal() {
    if (!store.get('ob-lt', '') && !confirm('Para revisar la ortografía, el texto se envía a LanguageTool, un corrector gratuito de internet.\n\n¿Quieres continuar?')) return;
    store.set('ob-lt', '1');
    const map = textMap(ed), text = map.text;
    if (!text.trim()) return toast('Escribe algo primero ✍️');
    toast('🔤 Revisando tu texto…', 6000);
    const matches = [];
    try {
      let start = 0;
      while (start < text.length) {
        let end = Math.min(text.length, start + 12000);
        if (end < text.length) { const nl = text.lastIndexOf('\n', end); if (nl > start + 2000) end = nl; }
        const res = await fetch('https://api.languagetool.org/v2/check', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams({ text: text.slice(start, end), language: 'es', disabledCategories: 'STYLE' }) });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        (await res.json()).matches.forEach(m => matches.push({ ...m, offset: m.offset + start }));
        start = end;
      }
    } catch (e) { console.warn(e); return toast('No pude conectar con el corrector. Mientras tanto, mira los subrayados rojos 😉', 4500); }
    const items = [];
    for (const m of matches.slice(0, 60)) {
      const a = rangeAt(map, m.offset), z = rangeAt(map, m.offset + m.length); if (!a || !z) continue;
      const r = document.createRange(); r.setStart(a.startContainer, a.startOffset); r.setEnd(z.startContainer, z.startOffset);
      items.push({ r, word: text.slice(m.offset, m.offset + m.length), msg: m.shortMessage || m.message, reps: (m.replacements || []).slice(0, 3).map(x => x.value) });
    }
    if (!items.length) return modal(`<h2>🎉 ¡Sin faltas!</h2><p style="font-size:1.05rem">No encontré ninguna falta. ¡Qué buen trabajo!</p><div style="text-align:right"><button class="btn primary" id="oK">Genial</button></div>`, (m, close) => { $('#oK', m).onclick = close; });
    modal(`<h2>🔤 He encontrado ${items.length} cosas</h2><p class="muted" style="margin:0 0 6px">Toca la palabra correcta para cambiarla.</p><div id="spl">${items.map((it, k) => `<div class="sug" data-k="${k}"><div>“<mark>${esc(it.word)}</mark>” <span class="muted">${esc(it.msg)}</span></div>
      <div>${it.reps.map((rp, j) => `<button class="chip" data-r="${k}:${j}">${esc(rp)}</button>`).join('')}<button class="chip ghost" data-s="${k}">Dejar así</button></div></div>`).join('')}</div>
      <div style="text-align:right;margin-top:12px"><button class="btn primary" id="spOk">Terminar</button></div>`,
      (m, close) => {
        $('#spOk', m).onclick = close;
        const done = k => { $(`.sug[data-k="${k}"]`, m)?.remove(); if (!$('.sug', m)) { close(); toast('🎉 ¡Todo revisado!'); } };
        m.addEventListener('click', e => {
          const b = e.target.closest('button'); if (!b) return;
          if (b.dataset.s) return done(b.dataset.s);
          if (b.dataset.r) { const [k, j] = b.dataset.r.split(':').map(Number), it = items[k]; it.r.deleteContents(); it.r.insertNode(document.createTextNode(it.reps[j])); touch(); done(k); }
        });
      });
  }

  function readyModal() {
    const rows = [], ok = (t) => rows.push(['✅', t]), tip = (t) => rows.push(['💡', t]);
    book.coverData ? ok('Tiene portada') : tip('Falta la <b>portada</b>: pulsa 🖼 Portada del libro');
    book.title && book.title !== 'Sin título' ? ok('Tiene título: “' + esc(book.title) + '”') : tip('Ponle un <b>título</b> al libro en ⚙️ Ajustes');
    book.author ? ok('Aparece la autora: ' + esc(book.author)) : tip('Escribe el <b>nombre de la autora</b> en ⚙️ Ajustes');
    chapters.length >= 2 ? ok(`Tiene ${chapters.length} capítulos`) : tip('Solo tiene 1 capítulo: prueba 🧚 Ayudante → <b>Sugerir capítulos</b>');
    const unnamed = chapters.filter(c => /^Capítulo \d+$/.test(c.title || '')).length;
    unnamed && chapters.length > 1 ? tip(`${unnamed} capítulo${unnamed > 1 ? 's' : ''} con el nombre por defecto (“Capítulo 2”…). ¡Ponles un nombre bonito!`) : chapters.length > 1 && ok('Todos los capítulos tienen nombre');
    chapters.forEach(c => {
      const h = c.id === active ? ed.innerHTML : (c.html || ''), w = wordCount(h);
      if (w > 1500) tip(`“${esc(c.title)}” es muy largo (${w} palabras). Prueba a cortarlo con ✂️`);
      else if (w < 60 && chapters.length > 1) tip(`“${esc(c.title)}” es muy cortito (${w} palabras)`);
      const d = document.createElement('div'); d.innerHTML = h;
      if ([...d.querySelectorAll('p,div')].some(p => (p.textContent || '').length > 1100)) tip(`En “${esc(c.title)}” hay un párrafo larguísimo: pulsa <b>Enter</b> para separarlo`);
    });
    const imgs = chapters.reduce((a, c) => a + ((c.id === active ? ed.innerHTML : c.html || '').match(/data-img=/g) || []).length, 0);
    imgs ? ok(`Tiene ${imgs} ilustración${imgs > 1 ? 'es' : ''}`) : tip('Aún no tiene <b>dibujos</b>: ¡con 🖼 Dibujo queda más bonito!');
    tip('Pasa el corrector: 🧚 Ayudante → <b>Revisar ortografía</b>');
    book.published ? ok('La familia ya puede leerlo') : tip('Cuando esté listo, actívalo en ⚙️ Ajustes → <b>Dejar que la familia lo lea</b>');
    const good = rows.filter(r => r[0] === '✅').length;
    modal(`<h2>✅ ¿Está listo mi libro?</h2><p class="muted" style="margin:0 0 8px">${good} de ${rows.length} cosas listas</p>${rows.map(r => `<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);font-size:1.02rem"><span>${r[0]}</span><span>${r[1]}</span></div>`).join('')}<div style="text-align:right;margin-top:12px"><button class="btn primary" id="oK">Vale</button></div>`, (m, close) => { $('#oK', m).onclick = close; });
  }

  async function addImage(im) {
    let rid = null;
    if (im.key) for (const [k, v] of imgs) if (v.key === im.key) { rid = k; break; }
    if (!rid) {
      const r = await addDoc(collection(db, 'books', id, 'images'), { data: im.data, w: im.w, h: im.h, key: im.key || '', createdAt: serverTimestamp() });
      rid = r.id; imgs.set(rid, im);
    }
    restoreSel();
    document.execCommand('insertHTML', false, `<img data-img="${rid}" class="sz-s" src="${imgs.get(rid).data}" alt="Ilustración"><p><br></p>`);
    touch();
  }

  /* ----- 🖼 Portada: imagen propia o portadas de la app ----- */
  function coverModal() {
    modal(`<h2>🖼 Portada</h2>
      <div class="row" style="align-items:flex-start;flex-wrap:nowrap"><div class="cover" id="cvP" style="width:110px;flex:none;font-size:.75rem;border-radius:10px;${book.coverData ? `background-image:url('${book.coverData}')` : ''}">${book.coverData ? '' : esc(book.title)}</div>
      <div style="flex:1"><p style="margin:0 0 8px">Así se ve tu portada ahora.</p><button class="btn" id="cvPick" style="width:100%;justify-content:center">📷 Usar una imagen mía</button><button class="btn" id="cvDel" style="width:100%;justify-content:center;margin-top:8px">Quitar portada</button></div></div>
      <h3 style="margin:16px 0 2px;font-size:1.05rem">🎨 Portadas de la app</h3><p class="muted" style="margin:0 0 8px;font-size:.9rem">Llevan tu título y tu nombre. Toca una para elegirla.</p>
      <div class="cgrid" id="cvG">${COVERS.map(c => `<button class="cthumb" data-c="${c.id}" aria-label="${esc(c.name)}"></button>`).join('')}</div>
      <input type="file" id="cvF" accept="image/*" class="hidden"><div style="text-align:right;margin-top:12px"><button class="btn" id="cvX">Cerrar</button></div>`,
      (m, close) => {
        const setCover = async data => { book.coverData = data; await updateDoc(doc(db, 'books', id), { coverData: data, updatedAt: serverTimestamp() }); const p = $('#cvP', m); p.style.backgroundImage = data ? `url('${data}')` : ''; p.textContent = data ? '' : book.title; toast('✅ Portada guardada'); };
        $('#cvX', m).onclick = close; $('#cvPick', m).onclick = () => $('#cvF', m).click(); $('#cvDel', m).onclick = () => setCover('');
        $('#cvF', m).onchange = async e => { const f = e.target.files[0]; if (!f) return; try { setCover((await compressImage(f, 900, 0.8)).data); } catch { toast('No pude usar esa imagen'); } };
        $$('.cthumb', m).forEach(b => {
          const d = COVERS.find(c => c.id === b.dataset.c);
          renderCover(d, book.title, book.author, 240, 360, 0.7).then(u => { b.style.backgroundImage = `url('${u}')`; }).catch(() => {});
          b.onclick = async () => { try { await setCover(await renderCover(d, book.title, book.author)); } catch (e) { console.error(e); toast('No pude crear la portada'); } };
        });
      });
  }
  $('#coverBtn').onclick = coverModal;

  /* ----- 🎨 Ilustraciones de la app ----- */
  function illusModal() {
    modal(`<h2>🎨 Ilustraciones</h2><p class="muted" style="margin:0 0 6px">Toca una para ponerla en tu texto. Después puedes hacerla más grande o más pequeña.</p>
      <div class="igrid">${ILLUS.map(il => `<button class="ithumb" data-i="${il.id}"><img src="${svgUrl(il.svg)}" alt=""><span>${esc(il.name)}</span></button>`).join('')}</div>
      <div style="text-align:right;margin-top:10px"><button class="btn" id="iX">Cerrar</button></div>`,
      (m, close) => {
        $('#iX', m).onclick = close;
        $$('[data-i]', m).forEach(b => b.onclick = async () => {
          const il = ILLUS.find(x => x.id === b.dataset.i); close();
          try { await addImage(await renderIllus(il)); toast('✅ ¡Dibujo puesto!'); } catch (e) { console.error(e); toast('No pude poner el dibujo'); }
        });
      });
  }
  $('#imgBtn').onclick = () => modal(`<h2>🖼 ¿Qué dibujo quieres poner?</h2>
    <button class="opt" data-i="mine"><span style="font-size:1.6rem">📷</span><span><b>Una foto o dibujo mío</b><small>Elígelo de tu móvil o tablet.</small></span></button>
    <button class="opt" data-i="app"><span style="font-size:1.6rem">🎨</span><span><b>Ilustraciones de la app</b><small>Árboles, flores, estrellas… para decorar.</small></span></button>
    <div style="text-align:right;margin-top:10px"><button class="btn" id="iX">Cerrar</button></div>`,
    (m, close) => { $('#iX', m).onclick = close; $('[data-i=mine]', m).onclick = () => { close(); $('#file').click(); }; $('[data-i=app]', m).onclick = () => { close(); illusModal(); }; });

  /* ----- 🔤 Corrector en vivo: subraya y dice si está bien o mal ----- */
  const LT_URL = 'https://api.languagetool.org/v2/check';
  let live = store.get('ob-live', '') === '1', liveT = null, liveBusy = false;
  const liveErr = new Map(), chip = $('#liveChip');
  const supportsHL = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined';
  const fix = document.createElement('div'); fix.className = 'fixpop hidden'; document.body.append(fix); unsubs.push(() => fix.remove());
  function paintHL() {
    if (!supportsHL) return;
    const rs = []; liveErr.forEach((arr, blk) => { if (!ed.contains(blk) && blk !== ed) { liveErr.delete(blk); return; } arr.forEach(e => rs.push(e.r)); });
    CSS.highlights.set('errores', new Highlight(...rs));
  }
  function hideFix() { fix.classList.add('hidden'); }
  function setLiveUI() { const b = $('#liveBtn'); b.textContent = live ? '🔤 Corrector: encendido' : '🔤 Corrector: apagado'; b.classList.toggle('on', live); chip.classList.toggle('hidden', !live); if (!live) chip.textContent = ''; }
  function liveReset() { liveErr.clear(); paintHL(); hideFix(); if (live) chip.textContent = '✍️ Escribe y te voy diciendo…'; }
  function scheduleLive() { clearTimeout(liveT); if (live) { chip.textContent = '✍️ …'; liveT = setTimeout(liveCheck, 1800); } }
  function currentBlock() {
    const s = getSelection(); if (!s.rangeCount || !ed.contains(s.anchorNode)) return ed;
    const n = s.anchorNode.nodeType === 3 ? s.anchorNode.parentElement : s.anchorNode;
    const b = n.closest('p,div,h1,h2,h3,h4,li,blockquote'); return (b && b !== ed && ed.contains(b)) ? b : ed;
  }
  async function liveCheck() {
    if (!live) return;
    if (liveBusy) { liveT = setTimeout(liveCheck, 1500); return; }
    const blk = currentBlock(), map = textMap(blk), text = map.text.slice(0, 6000);
    if (text.trim().length < 4) { chip.textContent = '✍️ Sigue escribiendo…'; return; }
    liveBusy = true; chip.textContent = '🔎 Mirando…';
    try {
      const res = await fetch(LT_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams({ text, language: 'es', disabledCategories: 'STYLE' }) });
      if (res.status === 429) { chip.textContent = '⏳ Un momento, descanso un poquito…'; return; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      if (textMap(blk).text.slice(0, 6000) !== text) { liveBusy = false; return scheduleLive(); }
      const arr = [];
      for (const m of j.matches) {
        const a = rangeAt(map, m.offset), z = rangeAt(map, m.offset + m.length); if (!a || !z) continue;
        const r = document.createRange(); r.setStart(a.startContainer, a.startOffset); r.setEnd(z.startContainer, z.startOffset);
        arr.push({ r, msg: m.shortMessage || m.message, reps: (m.replacements || []).slice(0, 3).map(x => x.value), word: text.slice(m.offset, m.offset + m.length) });
      }
      liveErr.set(blk, arr); paintHL();
      chip.textContent = arr.length ? `⚠️ ${arr.length} cosa${arr.length > 1 ? 's' : ''} por revisar: toca la palabra subrayada` : '✅ ¡Esta parte está bien!';
      chip.classList.toggle('bad', arr.length > 0);
    } catch (e) { console.warn(e); chip.textContent = '🔌 Sin conexión: no puedo revisar ahora'; }
    finally { liveBusy = false; }
  }
  ed.addEventListener('click', () => {
    if (!live) return hideFix();
    const s = getSelection(); if (!s.rangeCount) return hideFix();
    for (const [, arr] of liveErr) for (const e of arr) {
      let hit = false; try { hit = e.r.isPointInRange(s.anchorNode, s.anchorOffset); } catch {}
      if (!hit) continue;
      const rect = s.getRangeAt(0).getBoundingClientRect();
      fix.innerHTML = `<div style="margin-bottom:4px">“<b>${esc(e.word)}</b>” <span class="muted">${esc(e.msg)}</span></div>${e.reps.map((rp, j) => `<button class="chip" data-j="${j}">${esc(rp)}</button>`).join('')}<button class="chip ghost" data-x="1">Dejar así</button>`;
      fix.style.top = Math.min(window.innerHeight - 150, rect.bottom + 8) + 'px'; fix.style.left = Math.max(8, Math.min(window.innerWidth - 290, rect.left - 20)) + 'px'; fix.classList.remove('hidden');
      fix.onclick = ev => {
        const b = ev.target.closest('button'); if (!b) return;
        if (b.dataset.j !== undefined) { e.r.deleteContents(); e.r.insertNode(document.createTextNode(e.reps[+b.dataset.j])); touch(); }
        for (const [k, a] of liveErr) liveErr.set(k, a.filter(x => x !== e));
        paintHL(); hideFix(); scheduleLive();
      };
      return;
    }
    hideFix();
  });
  $('#liveBtn').onclick = () => {
    if (!live) {
      if (!store.get('ob-lt', '') && !confirm('Para avisarte de las faltas mientras escribes, cada párrafo se envía a LanguageTool, un corrector gratuito de internet.\n\n¿Quieres encenderlo?')) return;
      store.set('ob-lt', '1'); store.set('ob-live', '1'); live = true; setLiveUI(); liveCheck();
    } else { live = false; store.set('ob-live', ''); liveErr.clear(); paintHL(); hideFix(); setLiveUI(); }
  };
  setLiveUI();

  /* ----- ✒️ Pluma: chat de ayuda ----- */
  const botActs = { cuts: suggestModal, spell: spellModal, ready: readyModal, cover: coverModal, illus: illusModal, live: () => $('#liveBtn').click(), read: () => { location.hash = '#/read/' + id; }, help: helpModal };
  function botPanel() {
    if ($('.bot')) return;
    const el = document.createElement('div'); el.className = 'bot';
    el.innerHTML = `<div class="bot-h"><span>✒️ <b>Pluma</b> <small class="muted">tu ayudante</small></span><button class="btn icon" id="bX" aria-label="Cerrar">✕</button></div><div class="bot-m" id="bM" aria-live="polite"></div><div class="bot-c" id="bC"></div>
      <form class="bot-f" id="bF"><input type="text" id="bI" placeholder="Escríbeme tu pregunta…" autocomplete="off" aria-label="Tu pregunta"><button class="btn primary">Enviar</button></form>`;
    document.body.append(el);
    const M = $('#bM', el), C = $('#bC', el);
    const say = (who, html) => { const d = document.createElement('div'); d.className = 'msg ' + who; d.innerHTML = html; M.append(d); M.scrollTop = M.scrollHeight; return d; };
    const reply = input => {
      const r = botReply(input), d = say('pl', r.html);
      if (r.acts?.length) {
        const row = document.createElement('div'); row.className = 'acts';
        r.acts.forEach(([label, act]) => { const b = document.createElement('button'); b.className = 'chip'; b.textContent = label; b.onclick = () => { if (act === 'idea' || act === 'tip') return reply('#' + act); el.remove(); botActs[act]?.(); }; row.append(b); });
        d.append(row);
      }
      M.scrollTop = M.scrollHeight;
    };
    BOT_CHIPS.forEach(([label, tid]) => { const b = document.createElement('button'); b.className = 'chip'; b.textContent = label; b.onclick = () => { say('me', esc(label)); reply('#' + tid); }; C.append(b); });
    $('#bX', el).onclick = () => el.remove();
    $('#bF', el).onsubmit = e => { e.preventDefault(); const i = $('#bI', el), t = i.value.trim(); if (!t) return; say('me', esc(t)); i.value = ''; reply(t); };
    reply('#hola');
  }
  const fab = document.createElement('button'); fab.className = 'fab'; fab.id = 'botFab'; fab.innerHTML = '💬'; fab.title = 'Pregúntale a Pluma'; fab.setAttribute('aria-label', 'Pregúntale a Pluma');
  fab.onclick = botPanel; document.body.append(fab); unsubs.push(() => { fab.remove(); $('.bot')?.remove(); });

  $('#helperBtn').onclick = () => modal(`<h2>🧚 Ayudante</h2><p style="margin:0">¿En qué te ayudo?</p>
    <button class="opt" data-h="cuts"><span style="font-size:1.6rem">💡</span><span><b>Sugerir capítulos</b><small>Te digo dónde puedes cortar tu libro.</small></span></button>
    <button class="opt" data-h="spell"><span style="font-size:1.6rem">🔤</span><span><b>Revisar ortografía</b><small>Busco faltas y te propongo la palabra correcta.</small></span></button>
    <button class="opt" data-h="ready"><span style="font-size:1.6rem">✅</span><span><b>¿Está listo mi libro?</b><small>Una lista para ver qué falta.</small></span></button>
    <button class="opt" data-h="cover"><span style="font-size:1.6rem">🖼</span><span><b>Portada</b><small>Sube tu imagen o elige una portada de la app.</small></span></button>
    <button class="opt" data-h="illus"><span style="font-size:1.6rem">🎨</span><span><b>Ilustraciones</b><small>Dibujos de la app para decorar tu libro.</small></span></button>
    <button class="opt" data-h="bot"><span style="font-size:1.6rem">💬</span><span><b>Pregúntale a Pluma</b><small>Dudas, ideas para escribir y consejos.</small></span></button>
    <div style="text-align:right;margin-top:10px"><button class="btn" id="hX">Cerrar</button></div>`,
    (m, close) => {
      $('#hX', m).onclick = close;
      $$('[data-h]', m).forEach(b => b.onclick = () => { close(); ({ cuts: suggestModal, spell: spellModal, ready: readyModal, cover: coverModal, illus: illusModal, bot: botPanel })[b.dataset.h](); });
    });


  /* ----- 📄 ¿En qué página estoy? (páginas del libro impreso, tamaño A5) ----- */
  const PW = 454, PH = 657;
  const mz = document.createElement('div'); mz.className = 'mz'; document.body.append(mz); unsubs.push(() => mz.remove());
  let pgT = null, starts = {}, totalPages = 1;
  unsubs.push(() => clearTimeout(pgT));
  const schedPages = (ms = 450) => { clearTimeout(pgT); pgT = setTimeout(calcPages, ms); };
  function caretOffset() {
    const s = getSelection(); if (!s.rangeCount || !ed.contains(s.anchorNode)) return null;
    const r = document.createRange(); r.selectNodeContents(ed); r.setEnd(s.anchorNode, s.anchorOffset); return r.toString().length;
  }
  function calcPages() {
    if (!ed.isConnected || !mz.isConnected) return;
    const off = caretOffset();
    mz.innerHTML = chapters.map(c => {
      const live = c.id === active;
      return `<section data-id="${c.id}"><h1 class="p-title">${esc(live ? (ti.value || 'Sin título') : (c.title || 'Sin título'))}</h1><div class="mzb">${live ? ed.innerHTML : sanitize(c.html || '')}</div></section>`;
    }).join('');
    hydrate(mz, imgs);
    let mk = null;
    if (off !== null) {
      const body = mz.querySelector(`section[data-id="${active}"] .mzb`), w = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      let n, cum = 0;
      while ((n = w.nextNode())) { if (cum + n.data.length >= off) { const r = document.createRange(); r.setStart(n, off - cum); r.collapse(true); mk = document.createElement('span'); r.insertNode(mk); break; } cum += n.data.length; }
    }
    const base = mz.getBoundingClientRect().left, colOf = el => Math.max(0, Math.floor((el.getBoundingClientRect().left - base + 3) / PW));
    starts = {}; mz.querySelectorAll('section').forEach(sec => { starts[sec.dataset.id] = colOf(sec) + 1; });
    totalPages = Math.max(1, Math.ceil(mz.scrollWidth / PW - 0.02));
    const here = mk ? colOf(mk) + 1 : (starts[active] || 1);
    const idx = chapters.findIndex(c => c.id === active);
    $('#pgInfo').innerHTML = `📄 Página <b>${Math.min(here, totalPages)}</b> de <b>${totalPages}</b>`;
    $('#pgChap').textContent = `📖 Capítulo ${idx + 1} de ${chapters.length}`;
    $$('.chap').forEach(el => { const p = el.querySelector('.pn'); if (p && starts[el.dataset.id]) p.textContent = 'p. ' + starts[el.dataset.id]; });
    const st = $('#stats'); if (st) st.innerHTML = st.innerHTML.replace(/📄[^<]*$/, '') + `📄 ${totalPages} página${totalPages === 1 ? '' : 's'}`;
  }
  document.addEventListener('selectionchange', () => { if (ed.contains(getSelection().anchorNode)) schedPages(250); });
  /* ----- 🖱 Si pulsa en el hueco de abajo, el cursor va al final de lo escrito ----- */
  function caretToEnd(e) {
    if (e.button > 0) return;
    const t = e.target, sheet = t.closest?.('.sheet');
    if (!sheet || t === ti || t.closest('#liveChip,.fixpop,img')) return;
    let last = null;
    for (let i = ed.children.length - 1; i >= 0; i--) {
      const el = ed.children[i];
      if (el.matches('img,.pagebreak') || el.querySelector('img,.pagebreak')) break;      // no tocar si lo último es un dibujo
      if (el.textContent.replace(/\u200b/g, '').trim()) { last = el; break; }
    }
    if (!last) return;
    const r = last.getBoundingClientRect();
    if (e.clientY <= r.bottom + 4) return;                                            // pulsó sobre el texto: respetar
    e.preventDefault(); ed.focus();
    const range = document.createRange(); range.selectNodeContents(last);
    const lc = last.lastChild; if (lc && lc.nodeName === 'BR' && last.childNodes.length > 1) range.setStartBefore(lc); 
    range.collapse(lc && lc.nodeName === 'BR' && last.childNodes.length > 1 ? true : false);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    last.scrollIntoView({ block: 'nearest' });
  }
  $('.sheet').addEventListener('mousedown', caretToEnd);

  /* barra de herramientas */
  $('#tb').addEventListener('mousedown', e => { if (!e.target.matches('select,input')) e.preventDefault(); });
  $$('[data-c]').forEach(b => b.onclick = () => { ed.focus(); document.execCommand(b.dataset.c); touch(); });
  $('#titBtn').onclick = () => { restoreSel(); const v = (document.queryCommandValue('formatBlock') || '').toLowerCase(); document.execCommand('formatBlock', false, v === 'h2' ? '<p>' : '<h2>'); touch(); };
  $('#qBtn').onclick = () => { restoreSel(); document.execCommand('formatBlock', false, '<blockquote>'); touch(); };
  $('#moreBtn').onclick = () => { const h = $('#more').classList.toggle('hidden'); $('#moreBtn i').textContent = h ? '➕' : '✖️'; $('#moreBtn span').textContent = h ? 'Más' : 'Cerrar'; };
  $('#helpBtn').onclick = helpModal;
  const emptyCheck = () => ed.classList.toggle('is-empty', !ed.textContent.trim() && !ed.querySelector('img,.pagebreak'));
  ed.addEventListener('input', emptyCheck);
  function helpModal() {
    modal(`<h2>👋 ¡Hola, escritora!</h2><div style="font-size:1.1rem;line-height:1.65">
      <p><b>Así pasas tu libro a limpio:</b></p>
      <p>1️⃣ ✏️ <b>Copia tu libro</b> en la hoja blanca, tal cual lo tienes en el cuaderno. Todo se guarda solo.</p>
      <p>2️⃣ ✂️ <b>Pon capítulos</b>: toca en el texto justo donde empieza un capítulo y pulsa <b>Capítulo nuevo aquí</b>. Repítelo las veces que quieras.</p>
      <p>3️⃣ 🔠 <b>Títulos</b>: pon el cursor en una línea y pulsa <b>Título</b> para hacerla grande.</p>
      <p>4️⃣ 🖼 <b>Dibujos</b>: añade fotos o dibujos. Toca la imagen para cambiar su tamaño.</p>
      <p>5️⃣ 🧚 <b>Ayudante</b>: te sugiere dónde cortar los capítulos, busca faltas de ortografía y te dice si tu libro está listo.</p>
      <p>6️⃣ 👁 <b>Leer</b>: mira tu libro con portada, índice y números de página.</p>
      <p>↶ <b>Deshacer</b> arregla cualquier error. Si cortas mal un capítulo, abre <b>➕ Más</b> y pulsa <b>Unir</b>.</p></div>
      <div style="text-align:right;margin-top:10px"><button class="btn primary" id="hOk" style="font-size:1.1rem">¡Entendido!</button></div>`,
      (m, close) => { $('#hOk', m).onclick = close; });
  }
  $('#pbBtn').onclick = () => { restoreSel(); document.execCommand('insertHTML', false, '<div class="pagebreak"></div><p><br></p>'); touch(); };
  function restoreSel() { ed.focus(); if (lastRange) { const s = getSelection(); s.removeAllRanges(); s.addRange(lastRange); } }
  $('#file').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      stt.textContent = '🖼 Añadiendo dibujo…';
      const im = await compressImage(f);
      const r = await addDoc(collection(db, 'books', id, 'images'), { data: im.data, w: im.w, h: im.h, createdAt: serverTimestamp() });
      imgs.set(r.id, im); restoreSel();
      document.execCommand('insertHTML', false, `<img data-img="${r.id}" class="sz-m" src="${im.data}" alt="Ilustración"><p><br></p>`);
      touch();
    } catch (x) { console.error(x); toast('No se pudo añadir la imagen'); stt.textContent = ''; }
  };

  /* herramientas de imagen */
  const tools = document.createElement('div'); tools.className = 'img-tools hidden';
  tools.innerHTML = '<button data-s="sz-s">Pequeña</button><button data-s="sz-m">Mediana</button><button data-s="sz-l">Grande</button><button data-x="1">🗑</button>';
  document.body.append(tools); unsubs.push(() => tools.remove());
  function hideImgTools() { tools.classList.add('hidden'); selImg?.classList.remove('sel'); selImg = null; }
  ed.addEventListener('click', e => {
    if (e.target.tagName === 'IMG') {
      hideImgTools(); selImg = e.target; selImg.classList.add('sel');
      const r = selImg.getBoundingClientRect(); tools.style.top = Math.max(70, r.top + 8) + 'px'; tools.style.left = Math.max(8, r.left + 8) + 'px'; tools.classList.remove('hidden');
    } else hideImgTools();
  });
  tools.addEventListener('mousedown', e => e.preventDefault());
  tools.onclick = e => {
    const b = e.target.closest('button'); if (!b || !selImg) return;
    if (b.dataset.x) selImg.remove(); else { selImg.classList.remove('sz-s', 'sz-m', 'sz-l'); selImg.classList.add(b.dataset.s); }
    hideImgTools(); touch();
  };

  /* ajustes del libro */
  $('#bset').onclick = () => modal(`<h2>Ajustes del libro</h2>
    <label>Título</label><input type="text" id="sT" value="${esc(book.title)}"><label>Autora</label><input type="text" id="sA" value="${esc(book.author || '')}">
    <label>Portada</label><div class="row"><div class="cover" id="sC" style="width:90px;font-size:.7rem;${book.coverData ? `background-image:url('${book.coverData}')` : ''}">${book.coverData ? '' : 'Sin portada'}</div><button class="btn" id="sCb">Elegir imagen…</button><input type="file" id="sCf" accept="image/*" class="hidden"></div>
    <label style="display:flex;gap:8px;align-items:center;color:var(--text)"><input type="checkbox" id="sP" ${book.published ? 'checked' : ''}> 👨‍👩‍👧 Dejar que la familia lo lea</label>
    <div class="row" style="margin-top:16px;justify-content:space-between"><button class="btn danger" id="sD">Borrar libro</button><span class="row"><button class="btn" id="sX">Cancelar</button><button class="btn primary" id="sOk">Guardar</button></span></div>`,
    (m, close) => {
      let cover = book.coverData || '';
      $('#sCb', m).onclick = () => $('#sCf', m).click();
      $('#sCf', m).onchange = async e => { const f = e.target.files[0]; if (!f) return; const im = await compressImage(f, 500, 0.75); cover = im.data; $('#sC', m).style.backgroundImage = `url('${cover}')`; $('#sC', m).textContent = ''; };
      $('#sX', m).onclick = close;
      $('#sOk', m).onclick = async () => {
        Object.assign(book, { title: $('#sT', m).value.trim() || 'Sin título', author: $('#sA', m).value.trim(), published: $('#sP', m).checked, coverData: cover });
        await updateDoc(doc(db, 'books', id), { title: book.title, author: book.author, published: book.published, coverData: cover, updatedAt: serverTimestamp() });
        $('#bk').textContent = book.title; close(); toast('Ajustes guardados');
      };
      $('#sD', m).onclick = async () => {
        if (!confirm(`¿Borrar "${book.title}" con todos sus capítulos e imágenes? No se puede deshacer.`)) return;
        dirty = false; clearTimeout(timer);
        for (const sub of ['chapters', 'images']) {
          const s = await getDocs(collection(db, 'books', id, sub)); let b = writeBatch(db), n = 0;
          for (const d of s.docs) { b.delete(d.ref); if (++n % 400 === 0) { await b.commit(); b = writeBatch(db); } } await b.commit();
        }
        await deleteDoc(doc(db, 'books', id)); close(); location.hash = '#/';
      };
    });
  $('#shBtn').onclick = async () => { await flush(); openExport({ book, chapters, imgs, toast }); };
  show();
  if (!store.get('ob-tour', '')) { store.set('ob-tour', '1'); helpModal(); }
}

/* ---------- Familia (solo escritora) ---------- */
/* =====================================================================
   📚 Mi biblioteca: libros PDF / ePub guardados solo en este dispositivo
   ===================================================================== */
let _lib = null, _libUid = null;
const getLib = async () => { if (!_lib || _libUid !== state.user.uid) { _libUid = state.user.uid; _lib = libDB(state.user.uid); } return _lib; };
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : 'b' + Date.now() + Math.random().toString(36).slice(2));

async function importFiles(files, after) {
  const lib = await getLib();
  const list = [...files].filter(f => /\.(pdf|epub)$/i.test(f.name));
  if (!list.length) { toast('Solo puedo añadir libros PDF o ePub'); return; }
  navigator.storage?.persist?.().catch(() => {});
  const sigs = new Set((await lib.all()).map(b => b.sig));
  let ok = 0, dup = 0; const fail = [];
  for (let i = 0; i < list.length; i++) {
    const f = list[i], sig = f.name + '|' + f.size;
    if (sigs.has(sig)) { dup++; continue; }
    toast(`📥 Añadiendo ${i + 1} de ${list.length}…`);
    try {
      const nm = parseName(f.name), isEpub = /\.epub$/i.test(f.name);
      const meta = { id: newId(), sig, name: f.name, format: isEpub ? 'epub' : 'pdf', size: f.size, addedAt: Date.now(), lastRead: 0, pos: 0, page: 1, title: nm.title, author: nm.author, series: nm.series, seriesNo: nm.seriesNo, cover: '' };
      if (isEpub) {
        const inf = await epubInfo(f);
        if (inf.title) meta.title = inf.title; if (inf.author) meta.author = inf.author;
        if (inf.series) { meta.series = inf.series; meta.seriesNo = inf.seriesNo ?? nm.seriesNo; }
        meta.cover = inf.cover || '';
      } else {
        const inf = await pdfInfo(f);
        if (inf.title && !nm.series) meta.title = inf.title; if (inf.author && !meta.author) meta.author = inf.author;
        meta.pages = inf.pages; meta.cover = inf.cover || '';
      }
      await lib.add(meta, f); sigs.add(sig); ok++;
    } catch (e) { console.error(e); fail.push(f.name); }
  }
  toast(ok ? `✅ ${ok} libro${ok > 1 ? 's' : ''} añadido${ok > 1 ? 's' : ''}${dup ? ` (${dup} ya estaba${dup > 1 ? 'n' : ''})` : ''}${fail.length ? ` · ${fail.length} no se pudo` : ''}` : dup ? 'Ese libro ya estaba en tu biblioteca' : `No pude añadir: ${fail[0] || 'el archivo'}`);
  after?.();
}

async function renderShelf() {
  let lib; try { lib = await getLib(); } catch (e) { console.error('biblioteca', e); app.innerHTML = topbar() + '<div class="empty">Este navegador no permite guardar libros.</div>'; bindTopbar(); return; }
  app.innerHTML = topbar() + `<div class="container shelfp">${tabs('shelf')}${subtabs('me')}
    <div class="row" style="justify-content:space-between"><h1 class="page-title">📚 Mi biblioteca</h1><label class="btn primary" for="addBooks">📥 Añadir libros</label></div>
    <input type="file" id="addBooks" multiple accept=".pdf,.epub,application/pdf,application/epub+zip" class="hidden">
    <div class="shelf-tools"><input type="search" id="sq" placeholder="🔎 Buscar título, autor o colección" autocomplete="off"><select id="ss" aria-label="Ordenar"><option value="col">Por colecciones</option><option value="title">Por título</option><option value="author">Por autor</option><option value="recent">Recientes</option></select></div>
    <div id="shelf"><div class="spinner"></div></div><p class="muted" id="shnote" style="font-size:.85rem;text-align:center"></p></div>`;
  bindTopbar();
  const ss = $('#ss'); ss.value = store.get('ob-shelf-sort', 'col') || 'col';
  let books = [];
  const sortBooks = (a, k) => a.sort((x, y) => k === 'author' ? (x.author || '~').localeCompare(y.author || '~', 'es') || x.title.localeCompare(y.title, 'es') : k === 'recent' ? (y.addedAt - x.addedAt) : x.title.localeCompare(y.title, 'es', { numeric: true }));
  const card = b => `<div class="bk" data-id="${b.id}"><div class="bcover" ${b.cover ? `style="background-image:url('${b.cover}')"` : ''}>${b.cover ? '' : `<span>${esc(b.title)}</span>`}<span class="bfmt">${b.format === 'epub' ? 'ePub' : 'PDF'}</span>${b.sharedId ? '<span class="bshr" title="Compartido con la familia">👨‍👩‍👧</span>' : ''}${b.series && b.seriesNo != null ? `<span class="bno">#${esc(String(b.seriesNo))}</span>` : ''}${b.pos > 0.01 ? `<div class="bprog"><i style="width:${Math.min(100, Math.round(b.pos * 100))}%"></i></div>` : ''}</div>
      <div class="bmeta"><b>${esc(b.title)}</b><small>${esc(b.author || '')}</small></div><button class="bmore" data-more="${b.id}" aria-label="Opciones">⋯</button></div>`;
  async function load() {
    books = await lib.all();
    draw();
    try { const e = await navigator.storage?.estimate?.(); $('#shnote').textContent = books.length ? `${books.length} libro${books.length > 1 ? 's' : ''} · guardados solo en este dispositivo${e?.usage ? ' · ' + (e.usage / 1048576 >= 1024 ? (e.usage / 1073741824).toFixed(1) + ' GB' : Math.round(e.usage / 1048576) + ' MB') + ' ocupados' : ''}` : ''; } catch {}
  }
  function draw() {
    const q = normKey($('#sq').value), mode = ss.value;
    const vis = books.filter(b => !q || normKey([b.title, b.author, b.series].join(' ')).includes(q));
    let html = '';
    if (!books.length) html = `<div class="empty"><div style="font-size:54px">📚</div><p><b>Tu biblioteca está vacía</b></p><p>Pulsa <b>📥 Añadir libros</b> y elige tus PDF o ePub de la carpeta Descargas.<br>También puedes arrastrarlos aquí.</p></div>`;
    else if (!vis.length) html = '<div class="empty">No encuentro ningún libro con eso.</div>';
    else if (mode === 'col' && !q) {
      const reading = vis.filter(b => b.pos > 0.01 && b.pos < 0.97 && b.lastRead).sort((a, b) => b.lastRead - a.lastRead).slice(0, 8);
      if (reading.length) html += `<h2 class="shh">▶️ Seguir leyendo</h2><div class="hrow">${reading.map(card).join('')}</div>`;
      const groups = new Map(), loose = [];
      vis.forEach(b => { const k = normKey(b.series); if (k) { if (!groups.has(k)) groups.set(k, { name: b.series, items: [] }); groups.get(k).items.push(b); } else loose.push(b); });
      const single = [...groups.entries()].filter(([, g]) => g.items.length < 2); single.forEach(([k, g]) => { groups.delete(k); loose.push(...g.items); });
      [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'es')).forEach(g => {
        g.items.sort((x, y) => (x.seriesNo ?? 9999) - (y.seriesNo ?? 9999) || x.title.localeCompare(y.title, 'es', { numeric: true }));
        html += `<h2 class="shh">📚 ${esc(g.name)} <small>${g.items.length} libros</small></h2><div class="grid shgrid">${g.items.map(card).join('')}</div>`;
      });
      if (loose.length) html += `<h2 class="shh">📖 ${groups.size ? 'Libros sueltos' : 'Todos los libros'}</h2><div class="grid shgrid">${sortBooks(loose, 'title').map(card).join('')}</div>`;
    } else html = `<div class="grid shgrid">${sortBooks([...vis], mode === 'col' ? 'title' : mode).map(card).join('')}</div>`;
    $('#shelf').innerHTML = html;
  }
  $('#shelf').addEventListener('click', e => {
    const mo = e.target.closest('[data-more]'); if (mo) { e.stopPropagation(); return editBook(lib, books.find(b => b.id === mo.dataset.more), load); }
    const bk = e.target.closest('.bk'); if (bk) location.hash = '#/book/' + bk.dataset.id;
  });
  $('#sq').addEventListener('input', draw);
  ss.onchange = () => { store.set('ob-shelf-sort', ss.value); draw(); };
  const add = fl => importFiles(fl, load);
  $('#addBooks').onchange = async e => { const fl = [...e.target.files]; e.target.value = ''; if (fl.length) await add(fl); };
  const dov = e => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); }, dro = e => { if (e.dataTransfer?.files?.length) { e.preventDefault(); add(e.dataTransfer.files); } };
  window.addEventListener('dragover', dov); window.addEventListener('drop', dro); unsubs.push(() => { window.removeEventListener('dragover', dov); window.removeEventListener('drop', dro); });
  await load();
  // libros enviados desde otra app con «Compartir → Olivia Books»
  try {
    if (window.caches) {
      const sc = await caches.open('ob-share'), reqs = await sc.keys();
      if (reqs.length) {
        const files = await Promise.all(reqs.map(async r => { const res = await sc.match(r); const blob = await res.blob(); return new File([blob], new URL(r.url).searchParams.get('name') || 'libro.pdf', { type: blob.type }); }));
        await add(files); await Promise.all(reqs.map(r => sc.delete(r)));
      }
    }
  } catch (e) { console.warn('share', e); }
}

/* =====================================================================
   👨‍👩‍👧 Biblioteca de la familia: libros compartidos (Storage + Firestore `shared`)
   ===================================================================== */
let _fam = null, _famUid = null;
const getFam = async () => { if (!_fam || _famUid !== state.user.uid) { _famUid = state.user.uid; _fam = libDB(state.user.uid + '-fam'); } return _fam; };
const stg = async () => { const S = await import(FB + 'firebase-storage.js'); return { S, st: S.getStorage(fbApp) }; };
const MAXSHARE = 100 * 1048576;
const shareErr = e => /permission|unauthorized|403/i.test(e?.code + ' ' + e?.message) ? 'sin permiso (revisa las reglas de Firebase)' : /cors|network|failed to fetch|retry/i.test(e?.code + ' ' + e?.message) ? 'revisa la conexión o la configuración CORS' : (e?.message || 'error');

async function shareBook(lib, b) {
  if (b.size > MAXSHARE) throw new Error('Pesa más de 100 MB');
  const blob = await lib.file(b.id); if (!blob) throw new Error('El archivo ya no está aquí');
  const sid = b.sharedId || newId(), me = state.user, path = `shared/${me.uid}/${sid}/book.${b.format}`;
  const { S, st } = await stg();
  const task = S.uploadBytesResumable(S.ref(st, path), blob, { contentType: b.format === 'pdf' ? 'application/pdf' : 'application/epub+zip' });
  await new Promise((res, rej) => task.on('state_changed', s => toast(`⬆️ Compartiendo… ${Math.round(s.bytesTransferred / Math.max(1, s.totalBytes) * 100)} %`, 60000), rej, res));
  await setDoc(doc(db, 'shared', sid), { title: b.title, author: b.author || '', series: b.series || '', seriesNo: b.seriesNo ?? null, format: b.format, size: b.size, path, cover: b.cover && b.cover.length < 300000 ? b.cover : '', ownerUid: me.uid, ownerName: me.displayName || (me.email || '').split('@')[0], createdAt: serverTimestamp() });
  b.sharedId = sid; b.sharedPath = path; await lib.update(b);
}
async function unshare(sid, path) {
  const { S, st } = await stg();
  if (path) { try { await S.deleteObject(S.ref(st, path)); } catch (e) { if (!/not-found|object-not-found/.test(e?.code || '')) throw e; } }
  await deleteDoc(doc(db, 'shared', sid));
  try { const fl = await getFam(); await fl.remove(sid); } catch {}
}

async function renderFamShelf() {
  const lib = await getFam();
  app.innerHTML = topbar() + `<div class="container shelfp famp">${tabs('shelf')}${subtabs('fam')}
    <div class="famban"><span>👨‍👩‍👧</span><div><b>Biblioteca de la familia</b><small>Libros que comparte la familia. Aquí solo se leen; se guardan en tu dispositivo al abrirlos.</small></div></div>
    <div class="shelf-tools"><input type="search" id="sq" placeholder="🔎 Buscar título, autor o colección" autocomplete="off"></div>
    <div id="shelf"><div class="spinner"></div></div></div>`;
  bindTopbar();
  let items = [], cached = new Map(), failed = false;
  const mine = b => state.isWriter || b.ownerUid === state.user.uid;
  const card = b => { const c = cached.get(b.id), pos = c?.pos || 0; return `<div class="bk" data-id="${b.id}"><div class="bcover" ${b.cover ? `style="background-image:url('${b.cover}')"` : ''}>${b.cover ? '' : `<span>${esc(b.title)}</span>`}<span class="bfmt">${b.format === 'epub' ? 'ePub' : 'PDF'}</span>${b.series && b.seriesNo != null ? `<span class="bno">#${esc(String(b.seriesNo))}</span>` : ''}${c ? '<span class="bshr" title="Guardado en este dispositivo">✓</span>' : ''}${pos > 0.01 ? `<div class="bprog"><i style="width:${Math.min(100, Math.round(pos * 100))}%"></i></div>` : ''}</div>
      <div class="bmeta"><b>${esc(b.title)}</b><small>${esc(b.author || '')}</small><small class="by">Compartido por ${esc(b.ownerName || 'la familia')}</small></div><button class="bmore" data-more="${b.id}" aria-label="Opciones">⋯</button></div>`; };
  function draw() {
    const q = normKey($('#sq').value), vis = items.filter(b => !q || normKey([b.title, b.author, b.series, b.ownerName].join(' ')).includes(q));
    let html = '';
    if (failed) html = '<div class="empty"><div style="font-size:48px">🔒</div><p>No puedo abrir la biblioteca de la familia todavía.<br><small>Falta publicar las reglas de Firebase (Francisco lo tiene en los pasos).</small></p></div>';
    else if (!items.length) html = '<div class="empty"><div style="font-size:54px">👨‍👩‍👧</div><p><b>Aún no hay libros compartidos</b></p><p>En <b>Mis libros personales</b>, pulsa ⋯ en un libro y elige <b>Compartir con la familia</b>.</p></div>';
    else if (!vis.length) html = '<div class="empty">No encuentro ningún libro con eso.</div>';
    else {
      const groups = new Map(), loose = [];
      vis.forEach(b => { const k = normKey(b.series); if (k) { if (!groups.has(k)) groups.set(k, { name: b.series, items: [] }); groups.get(k).items.push(b); } else loose.push(b); });
      [...groups.entries()].filter(([, g]) => g.items.length < 2).forEach(([k, g]) => { groups.delete(k); loose.push(...g.items); });
      [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'es')).forEach(g => {
        g.items.sort((x, y) => (x.seriesNo ?? 9999) - (y.seriesNo ?? 9999) || x.title.localeCompare(y.title, 'es', { numeric: true }));
        html += `<h2 class="shh">📚 ${esc(g.name)} <small>${g.items.length} libros</small></h2><div class="grid shgrid">${g.items.map(card).join('')}</div>`;
      });
      if (loose.length) html += `<h2 class="shh">📖 ${groups.size ? 'Libros sueltos' : 'Todos los libros'}</h2><div class="grid shgrid">${loose.sort((x, y) => x.title.localeCompare(y.title, 'es', { numeric: true })).map(card).join('')}</div>`;
    }
    $('#shelf').innerHTML = html;
  }
  $('#shelf').addEventListener('click', e => {
    const mo = e.target.closest('[data-more]'); if (mo) { e.stopPropagation(); return famMenu(lib, items.find(b => b.id === mo.dataset.more), cached.has(mo.dataset.more), mine, () => refresh()); }
    const bk = e.target.closest('.bk'); if (bk) location.hash = '#/fbook/' + bk.dataset.id;
  });
  $('#sq').addEventListener('input', draw);
  async function refresh() { try { cached = new Map((await lib.all()).map(m => [m.id, m])); } catch {} draw(); }
  const un = onSnapshot(collection(db, 'shared'), s => { failed = false; items = s.docs.map(d => ({ id: d.id, ...d.data() })); refresh(); }, err => { console.warn('shared', err); failed = true; draw(); });
  unsubs.push(un);
}
function famMenu(lib, b, isCached, mine, done) {
  if (!b) return;
  modal(`<h2>${esc(b.title)}</h2><p class="muted" style="margin-top:-6px">Compartido por ${esc(b.ownerName || 'la familia')}</p>
    ${isCached ? '<button class="btn" id="fmC" style="width:100%;margin-bottom:8px">🧹 Quitar de este dispositivo</button><p class="muted" style="font-size:.85rem;margin:0 0 12px">Seguirá en la biblioteca de la familia; se vuelve a descargar al abrirlo.</p>' : ''}
    ${mine(b) ? '<button class="btn danger" id="fmU" style="width:100%;margin-bottom:8px">🚫 Dejar de compartir con la familia</button>' : ''}
    <div style="text-align:right"><button class="btn" id="fmX">Cerrar</button></div>`, (m, close) => {
    $('#fmX', m).onclick = close;
    if ($('#fmC', m)) $('#fmC', m).onclick = async () => { await lib.remove(b.id); close(); toast('Quitado de este dispositivo'); done(); };
    let sure = false;
    if ($('#fmU', m)) $('#fmU', m).onclick = async e => { if (!sure) { sure = true; e.target.textContent = '¿Seguro? Pulsa otra vez'; return; } e.target.disabled = true; try { await unshare(b.id, b.path); close(); toast('Ya no se comparte'); } catch (er) { console.error(er); e.target.disabled = false; toast('No se pudo: ' + shareErr(er), 6000); } };
  });
}
async function renderFamBook(id) {
  backHash = '#/fshelf';
  const lib = await getFam();
  let meta = await lib.meta(id);
  if (!meta || !(await lib.file(id))) {
    app.innerHTML = topbar() + '<div class="center-box"><div class="card" style="text-align:center"><div class="spinner"></div><p>📥 Preparando el libro…<br><small class="muted">La primera vez se descarga; luego se lee sin conexión.</small></p></div></div>'; bindTopbar();
    try {
      const s = await getDoc(doc(db, 'shared', id));
      if (!s.exists()) { toast('Ese libro ya no se comparte'); location.hash = '#/fshelf'; return; }
      const d = s.data(), { S, st } = await stg(), blob = await S.getBlob(S.ref(st, d.path));
      meta = { id, sig: 'fam|' + id, name: d.title, format: d.format, size: d.size, addedAt: Date.now(), lastRead: 0, pos: 0, page: 1, title: d.title, author: d.author || '', series: d.series || '', seriesNo: d.seriesNo ?? null, cover: d.cover || '', ownerName: d.ownerName || '' };
      await lib.add(meta, blob);
    } catch (e) {
      console.error(e);
      if (location.hash !== '#/fbook/' + id) return;
      app.innerHTML = topbar() + `<div class="empty"><div style="font-size:44px">📡</div><p>No se pudo descargar el libro.<br><small>${esc(shareErr(e))}</small></p><a class="btn" href="#/fshelf">Volver</a></div>`; bindTopbar(); return;
    }
  }
  if (location.hash !== '#/fbook/' + id) return;
  return renderImported(id, true);
}

function editBook(lib, b, done) {
  if (!b) return;
  modal(`<h2>✏️ Datos del libro</h2>
    <label>Título</label><input type="text" id="ebT" value="${esc(b.title)}">
    <label>Autor</label><input type="text" id="ebA" value="${esc(b.author || '')}">
    <div class="row" style="align-items:flex-end;flex-wrap:nowrap"><div style="flex:1"><label>Colección (saga)</label><input type="text" id="ebS" value="${esc(b.series || '')}" placeholder="Ej.: Harry Potter"></div><div style="width:84px"><label>Nº</label><input type="text" id="ebN" inputmode="decimal" value="${b.seriesNo ?? ''}" placeholder="1"></div></div>
    <p class="muted" style="font-size:.85rem;margin:8px 0 0">Los libros de la misma colección se agrupan y se ordenan por número.</p>
    <div class="sharebox">${b.sharedId ? '<b>👨‍👩‍👧 Compartido con la familia</b><button class="btn" id="ebU">Dejar de compartir</button>' : '<b>👨‍👩‍👧 Compartir con la familia</b><small>Lo podrán leer las personas aprobadas. Comparte solo libros que podáis tener.</small><button class="btn" id="ebSh">Compartir este libro</button>'}</div>
    <div class="row" style="margin-top:14px;justify-content:space-between"><button class="btn danger" id="ebD">🗑 Quitar de aquí</button><span><button class="btn" id="ebC">Cancelar</button> <button class="btn primary" id="ebOk">Guardar</button></span></div>`,
    (m, close) => {
      $('#ebC', m).onclick = close;
      const saveEdits = async () => { b.title = $('#ebT', m).value.trim() || b.title; b.author = $('#ebA', m).value.trim(); b.series = $('#ebS', m).value.trim(); const n = parseFloat($('#ebN', m).value.replace(',', '.')); b.seriesNo = b.series && !isNaN(n) ? n : null; await lib.update(b); if (b.sharedId) updateDoc(doc(db, 'shared', b.sharedId), { title: b.title, author: b.author || '', series: b.series || '', seriesNo: b.seriesNo ?? null }).catch(() => {}); };
      $('#ebOk', m).onclick = async () => { await saveEdits(); close(); done(); };
      if ($('#ebSh', m)) $('#ebSh', m).onclick = async e => { e.target.disabled = true; try { await saveEdits(); await shareBook(lib, b); close(); toast('✅ Compartido con la familia'); done(); } catch (er) { console.error(er); e.target.disabled = false; toast('No se pudo compartir: ' + shareErr(er), 6000); } };
      if ($('#ebU', m)) $('#ebU', m).onclick = async e => { e.target.disabled = true; try { await unshare(b.sharedId, b.sharedPath); b.sharedId = null; b.sharedPath = null; await lib.update(b); close(); toast('Ya no se comparte'); done(); } catch (er) { console.error(er); e.target.disabled = false; toast('No se pudo: ' + shareErr(er), 6000); } };
      let sure = false; $('#ebD', m).onclick = async e => { if (!sure) { sure = true; e.target.textContent = '¿Seguro? Pulsa otra vez'; return; } await lib.remove(b.id); close(); toast('Libro quitado de este dispositivo'); done(); };
    });
}

async function renderImported(id, fam = false) {
  backHash = fam ? '#/fshelf' : '#/shelf';
  const lib = fam ? await getFam() : await getLib(), meta = await lib.meta(id);
  if (!meta) { location.hash = backHash; return; }
  let saveT = null;
  const save = frac => { meta.pos = frac; meta.lastRead = Date.now(); clearTimeout(saveT); saveT = setTimeout(() => lib.update(meta).catch(() => {}), 700); };
  unsubs.push(() => { clearTimeout(saveT); lib.update(meta).catch(() => {}); });
  if (meta.format === 'epub') {
    return renderReader(id, {
      save,
      load: async () => {
        const blob = await lib.file(id); if (!blob) throw new Error('El archivo ya no está en este dispositivo');
        const bk = await epubToBook(blob);
        if (!bk.sections.length) throw new Error('Este ePub no tiene texto que mostrar');
        return { book: { title: meta.title || bk.title, author: meta.author || bk.author, coverData: bk.cover }, chapters: bk.sections.map(s => ({ id: s.id, title: '', html: s.html, raw: true, nb: s.nb })), imgs: new Map(), toc: bk.toc, anchorMap: bk.anchorMap, urls: bk.urls, lang: bk.lang };
      }
    });
  }
  return renderPdfReader(meta, lib, save);
}

async function renderPdfReader(meta, lib, save) {
  app.innerHTML = topbar() + '<div class="spinner"></div>'; bindTopbar();
  let pdf, url;
  try {
    const [pdfjs, blob] = await Promise.all([loadPdfJs(), lib.file(meta.id)]);
    if (!blob) throw new Error('El archivo ya no está en este dispositivo');
    url = URL.createObjectURL(blob); pdf = await pdfjs.getDocument({ url }).promise;
  } catch (e) { console.error(e); app.innerHTML = topbar() + `<div class="empty">No se pudo abrir el libro.<br>${esc(e.message || '')}<br><a href="${backHash}">Volver</a></div>`; bindTopbar(); return; }
  unsubs.push(() => { try { pdf.destroy(); } catch {} URL.revokeObjectURL(url); });
  const N = pdf.numPages; meta.pages = N;
  app.innerHTML = `<div class="reader pdfr">${topbar(`<span class="title-mini">${esc(meta.title)}</span>`,
    `<a class="btn icon" href="${backHash}" title="Mi biblioteca">📚</a><button class="btn icon" id="tocBtn" title="Índice">☰</button><button class="btn icon" id="zo" title="Más pequeño">−</button><button class="btn icon" id="zi" title="Más grande">＋</button>`)}
    <div class="stage"><div class="pdfwrap" id="pdfw"><canvas id="cv" class="pdfcv"></canvas></div>
    <button class="nav-zone l" id="prev" aria-label="Página anterior"></button><button class="nav-zone r" id="next" aria-label="Página siguiente"></button></div>
    <div class="bottombar"><button class="btn icon" id="p1">‹</button><input type="range" id="rng" min="1" max="${N}" value="1"><span class="pg" id="pg"></span><button class="btn icon" id="p2">›</button></div></div>`;
  bindTopbar(() => requestAnimationFrame(() => show(cur)));
  const box = $('#pdfw'), cv = $('#cv'), ctx = cv.getContext('2d');
  let cur = Math.max(1, Math.min(N, +meta.page || 1)), zoom = +store.get('ob-pdf-zoom', 1) || 1, tk = 0, task = null;
  async function show(n) {
    if (!cv.isConnected) return;
    cur = Math.max(1, Math.min(N, n)); const my = ++tk;
    $('#pg').textContent = `Página ${cur} de ${N} · ${Math.round(cur / N * 100)} %`; $('#rng').value = cur;
    meta.page = cur; save(cur / N);
    try {
      const page = await pdf.getPage(cur); if (my !== tk) return;
      const v0 = page.getViewport({ scale: 1 }), k = (box.clientWidth - 2) / v0.width * zoom, vp = page.getViewport({ scale: k });
      const q = Math.min(window.devicePixelRatio || 1, 3, Math.sqrt(16e6 / (vp.width * vp.height)) || 1);
      cv.width = Math.floor(vp.width * q); cv.height = Math.floor(vp.height * q); cv.style.width = Math.floor(vp.width) + 'px'; cv.style.height = Math.floor(vp.height) + 'px';
      task?.cancel(); task = page.render({ canvasContext: ctx, viewport: page.getViewport({ scale: k * q }) });
      await task.promise; box.scrollTop = 0;
    } catch (e) { if (e?.name !== 'RenderingCancelledException') console.error(e); }
    box.classList.toggle('zoomed', zoom > 1.05);
  }
  const go = n => { if (n >= 1 && n <= N && n !== cur) show(n); };
  $('#next').onclick = $('#p2').onclick = () => go(cur + 1);
  $('#prev').onclick = $('#p1').onclick = () => go(cur - 1);
  $('#rng').oninput = e => go(+e.target.value);
  const setZoom = z => { zoom = Math.max(0.5, Math.min(4, z)); store.set('ob-pdf-zoom', String(zoom)); show(cur); };
  $('#zi').onclick = () => setZoom(zoom + 0.25); $('#zo').onclick = () => setZoom(zoom - 0.25);
  document.onkeydown = e => {
    if (e.target.matches('input,textarea')) return;
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(cur + 1); }
    if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); go(cur - 1); }
  };
  let tx = 0, ty = 0;
  box.addEventListener('touchstart', e => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
  box.addEventListener('touchend', e => { if (zoom > 1.05) return; const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty; if (Math.abs(dx) > 60 && Math.abs(dy) < 45) go(cur + (dx < 0 ? 1 : -1)); }, { passive: true });
  let rz; const ro = new ResizeObserver(() => { clearTimeout(rz); rz = setTimeout(() => show(cur), 220); }); ro.observe(box); unsubs.push(() => { clearTimeout(rz); ro.disconnect(); });
  async function destPage(dest) { try { const d = typeof dest === 'string' ? await pdf.getDestination(dest) : dest; if (!d) return null; return typeof d[0] === 'object' ? (await pdf.getPageIndex(d[0])) + 1 : (+d[0] + 1); } catch { return null; } }
  $('#tocBtn').onclick = async () => {
    const out = await pdf.getOutline().catch(() => null), flat = [];
    const walk = (a, d) => (a || []).forEach(o => { if (flat.length < 400) { flat.push({ t: o.title, dest: o.dest, d }); walk(o.items, Math.min(d + 1, 2)); } }); walk(out, 0);
    for (const f of flat) f.page = await destPage(f.dest);
    modal(`<h2>Índice</h2><div class="row" style="margin:6px 0"><label style="margin:0">Ir a la página</label><input type="number" id="gp" min="1" max="${N}" value="${cur}" style="width:90px"><button class="btn primary" id="gpOk">Ir</button></div>
      ${flat.filter(f => f.page).map((f, i) => `<button class="opt" data-p="${f.page}" style="padding-left:${12 + f.d * 16}px"><span style="flex:1">${esc(f.t)}</span><span class="muted">pág. ${f.page}</span></button>`).join('') || '<p class="muted">Este PDF no tiene índice.</p>'}`,
      (m, close) => { $$('[data-p]', m).forEach(b => b.onclick = () => { close(); go(+b.dataset.p); }); $('#gpOk', m).onclick = () => { close(); go(+$('#gp', m).value); }; });
  };
  show(cur);
}

function renderFamily() {
  app.innerHTML = topbar() + `<div class="container"><a href="#/">← Mis libros</a><h1 class="page-title">Familia y accesos</h1>
  <p class="muted">Quien se registre aparece aquí. Solo podrá leer tus libros publicados cuando lo apruebes.</p><div class="card users" id="us"><div class="spinner"></div></div></div>`;
  bindTopbar();
  unsubs.push(onSnapshot(collection(db, 'users'), s => {
    const us = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => Number(a.approved) - Number(b.approved) || (a.name || '').localeCompare(b.name || ''));
    $('#us').innerHTML = us.length ? us.map(u => `<div class="u"><div><b>${esc(u.name)}</b><br><span class="muted" style="font-size:.82rem">${esc(u.email)}</span></div>
      <button class="btn ${u.approved ? '' : 'primary'}" data-ap="${u.id}" data-v="${u.approved ? 0 : 1}">${u.approved ? 'Quitar acceso' : 'Aprobar'}</button><button class="btn icon danger" data-rm="${u.id}" title="Eliminar">🗑</button></div>`).join('')
      : '<p class="muted">Todavía no se ha registrado nadie.</p>';
    $$('[data-ap]').forEach(b => b.onclick = () => updateDoc(doc(db, 'users', b.dataset.ap), { approved: b.dataset.v === '1' }));
    $$('[data-rm]').forEach(b => b.onclick = () => confirm('¿Eliminar este acceso?') && deleteDoc(doc(db, 'users', b.dataset.rm)));
  }));
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
