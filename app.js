import { firebaseConfig, WRITER_EMAIL } from './firebase-config.js';
import { sanitize, dehydrate, hydrate, esc, compressImage, wordCount } from './util.js';
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
  if (page === 'read' && id) return renderReader(id);
  if (page === 'edit' && id && state.isWriter) return renderEditor(id);
  if (page === 'family' && state.isWriter) return renderFamily();
  return renderLibrary();
}
window.addEventListener('hashchange', route);

/* ---------- Biblioteca ---------- */
function renderLibrary() {
  app.innerHTML = topbar() + `<div class="container"><div class="row" style="justify-content:space-between"><h1 class="page-title">${state.isWriter ? 'Mis libros' : 'Biblioteca de Olivia'}</h1>
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
async function renderReader(id) {
  app.innerHTML = topbar() + '<div class="spinner"></div>';
  bindTopbar();
  let data;
  try { data = await loadBook(id); } catch (e) { app.innerHTML = topbar() + `<div class="empty">No se pudo abrir el libro.<br><a href="#/">Volver</a></div>`; bindTopbar(); return; }
  const { book, chapters, imgs } = data;
  app.innerHTML = `<div class="reader">${topbar(`<span class="title-mini">${esc(book.title)}</span>`,
    `<button class="btn icon" id="tocBtn" title="Índice">☰</button><button class="btn icon" id="shBtn" title="Compartir / exportar">⤴</button>${state.isWriter ? `<a class="btn" href="#/edit/${id}">✏️ Editar</a>` : ''}`)}
    <div class="stage"><div class="paper"><div class="pager" id="pager"><div class="pages content" id="pages"></div></div>
    <button class="nav-zone l" id="prev" aria-label="Página anterior"></button><button class="nav-zone r" id="next" aria-label="Página siguiente"></button></div></div>
    <div class="bottombar"><button class="btn icon" id="p1">‹</button><input type="range" id="rng" min="1" max="1" value="1"><span class="pg" id="pg"></span><button class="btn icon" id="p2">›</button></div></div>`;
  const pager = $('#pager'), pages = $('#pages');
  let W = 0, total = 1, cur = 0;
  const startPages = [];

  pages.innerHTML = `<section class="titlepage">${book.coverData ? `<img class="cv" src="${book.coverData}" alt="Portada">` : ''}<h1>${esc(book.title)}</h1><div class="by">${esc(book.author || '')}</div></section>` +
    chapters.map(c => `<section data-ch="${c.id}"><h2 class="chap-title">${esc(c.title)}</h2>${sanitize(c.html)}</section>`).join('');
  hydrate(pages, imgs);

  const imgsReady = Promise.all($$('img', pages).map(i => i.decode?.().catch(() => {}) ?? 0));
  function layout(keepRatio = true) {
    if (!pager.isConnected) return;
    const ratio = total > 1 ? cur / (total - 1) : 0;
    W = pager.clientWidth;
    pages.style.setProperty('--ph', (pager.clientHeight - 52) + 'px');
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
    $('#pg').textContent = cur === 0 ? 'Portada' : `Página ${cur} de ${total - 1}`;
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
  $('#shBtn').onclick = () => openExport({ book, chapters, imgs, toast });
  $('#tocBtn').onclick = () => modal(`<h2>Índice</h2>${chapters.map((c, i) => `<button class="opt" data-i="${i}"><span style="flex:1">${esc(c.title)}</span><span class="muted">pág. ${Math.max(1, startPages[i + 1] ?? 1)}</span></button>`).join('') || '<p class="muted">Sin capítulos.</p>'}`,
    (m, close) => $$('[data-i]', m).forEach(b => b.onclick = () => { close(); goto(startPages[+b.dataset.i + 1] ?? 0); }));

  await imgsReady;
  await document.fonts?.ready;
  layout(false);
  const saved = +store.get('ob-pos-' + id, 0);
  goto(Math.round(saved * (total - 1)), false);
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
      <button class="btn" style="width:100%;justify-content:center" id="bset">⚙️ Ajustes del libro</button>
      <h3>Capítulos</h3><div id="chl"></div>
      <button class="btn primary" style="width:100%;justify-content:center;margin-top:10px" id="addCh">＋ Nuevo capítulo</button><div class="muted" id="stats" style="margin-top:14px;font-size:.95rem"></div></aside>
      <main class="write"><div class="toolbar big" id="tb">
        <button id="splitBtn" class="accent" title="Empieza aquí un capítulo nuevo">✂️ Capítulo nuevo aquí</button>
        <button id="titBtn" title="Convierte la línea en un título grande">🔠 Título</button>
        <button data-c="bold" title="Letra gorda"><b>N</b> Negrita</button>
        <button data-c="italic" title="Letra inclinada"><i>K</i> Cursiva</button>
        <button id="imgBtn" title="Poner un dibujo o una foto">🖼 Dibujo</button>
        <button id="pbBtn" title="Empezar una hoja nueva">📄 Hoja nueva</button>
        <button data-c="undo" title="Deshacer lo último">↶ Deshacer</button>
        <button id="moreBtn">➕ Más</button>
        <span class="status" id="stt"></span>
        <div class="more hidden" id="more">
          <button data-c="underline"><u>S</u> Subrayado</button><button data-c="justifyLeft">⯇ Izquierda</button><button data-c="justifyCenter">≡ Centro</button><button data-c="justifyRight">⯈ Derecha</button>
          <button data-c="insertUnorderedList">• Lista</button><button data-c="insertOrderedList">1. Lista</button><button id="qBtn">❝ Cita</button><button data-c="redo">↷ Rehacer</button><button id="mergeBtn">⛓ Unir con el capítulo de antes</button>
        </div>
        <input type="file" id="file" accept="image/*" class="hidden"></div>
      <div class="tip hidden" id="tip"><span>📚 <b>¿Tu libro es un solo texto largo?</b> Toca en el texto justo donde empieza un capítulo y pulsa <b>✂️ Capítulo nuevo aquí</b>.</span><button id="tipX" aria-label="Cerrar">✕</button></div>
      <div class="sheet content"><input type="text" id="chTitle" placeholder="Título del capítulo" autocomplete="off"><div id="editor" class="body" contenteditable="true" spellcheck="true" lang="es" data-ph="✏️ Escribe aquí tu historia…"></div>
      <div class="muted" id="wc" style="font-size:.8rem"></div></div></main></div>`;
  bindTopbar();
  document.execCommand('defaultParagraphSeparator', false, 'p');
  const ed = $('#editor'), ti = $('#chTitle'), stt = $('#stt');

  const drawList = () => {
    $('#chl').innerHTML = chapters.map((c, i) => `<div class="chap ${c.id === active ? 'on' : ''}" data-id="${c.id}"><span class="t">${i + 1}. ${esc(c.title || 'Sin título')}</span>
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
    $('#wc').textContent = wordCount(ed.innerHTML) + ' palabras'; stt.textContent = ''; drawList(); hideImgTools(); emptyCheck(); tipCheck();
  }
  async function flush() {
    clearTimeout(timer); if (!dirty) return; dirty = false;
    const c = cur(); if (!c) return;
    c.title = ti.value.trim() || 'Sin título'; c.html = dehydrate(ed.innerHTML);
    try {
      await setDoc(doc(db, 'books', id, 'chapters', c.id), { title: c.title, html: c.html, order: c.order, updatedAt: serverTimestamp() }, { merge: true });
      await updateDoc(doc(db, 'books', id), { updatedAt: serverTimestamp() });
      stt.textContent = '✅ Todo guardado'; drawList();
    } catch (e) { stt.textContent = '⚠️ No se pudo guardar'; dirty = true; console.error(e); }
  }
  const touch = () => { dirty = true; stt.textContent = '✏️ Escribiendo…'; $('#wc').textContent = wordCount(ed.innerHTML) + ' palabras'; clearTimeout(timer); timer = setTimeout(flush, 1200); };
  ed.addEventListener('input', touch); ti.addEventListener('input', touch);
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

  /* barra de herramientas */
  $('#tb').addEventListener('mousedown', e => { if (!e.target.matches('select,input')) e.preventDefault(); });
  $$('[data-c]').forEach(b => b.onclick = () => { ed.focus(); document.execCommand(b.dataset.c); touch(); });
  $('#titBtn').onclick = () => { restoreSel(); const v = (document.queryCommandValue('formatBlock') || '').toLowerCase(); document.execCommand('formatBlock', false, v === 'h2' ? '<p>' : '<h2>'); touch(); };
  $('#qBtn').onclick = () => { restoreSel(); document.execCommand('formatBlock', false, '<blockquote>'); touch(); };
  $('#moreBtn').onclick = () => { $('#more').classList.toggle('hidden'); $('#moreBtn').textContent = $('#more').classList.contains('hidden') ? '➕ Más' : '➖ Menos'; };
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
      <p>5️⃣ 👁 <b>Leer</b>: mira tu libro con portada, índice y números de página.</p>
      <p>↶ <b>Deshacer</b> arregla cualquier error. Si cortas mal un capítulo, abre <b>➕ Más</b> y pulsa <b>Unir</b>.</p></div>
      <div style="text-align:right;margin-top:10px"><button class="btn primary" id="hOk" style="font-size:1.1rem">¡Entendido!</button></div>`,
      (m, close) => { $('#hOk', m).onclick = close; });
  }
  $('#pbBtn').onclick = () => { restoreSel(); document.execCommand('insertHTML', false, '<div class="pagebreak"></div><p><br></p>'); touch(); };
  function restoreSel() { ed.focus(); if (lastRange) { const s = getSelection(); s.removeAllRanges(); s.addRange(lastRange); } }
  $('#imgBtn').onclick = () => $('#file').click();
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
