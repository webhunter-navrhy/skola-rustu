/* Administrace Škola růstu: kurzy, koučing, knihy, zisky studentů, kontakt, heslo.
   Data jsou v repozitáři (_data/obsah.json, _data/site.json). Uložení = jeden commit přes webhunter-admin,
   GitHub Action pak web přegeneruje (~1 minuta). */
'use strict';
(() => {
const CFG = { id: 'skola-rustu', site: '../', api: 'https://webhunter-admin.webhunter.workers.dev' };
const FILES = { obsah: '_data/obsah.json', site: '_data/site.json' };
const SK = 'skolarustu_admin';
const S = { sess: null, def: false, D: {}, snap: {}, pending: {}, preview: {}, saving: false, lib: null };
const $ = (s) => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 8);
const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
function h(sel, props = {}, ...kids) {
  const [tag, ...cls] = sel.split('.'); const el = document.createElement(tag || 'div');
  if (cls.length) el.className = cls.join(' ');
  for (const [k, v] of Object.entries(props || {})) { if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'value') el.value = v; else el.setAttribute(k, v === true ? '' : v); }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(k));
  return el;
}
function toast(t, type = '') { const el = h('div.toast' + (type ? '.' + type : ''), {}, t); $('#toasts').append(el); setTimeout(() => el.remove(), type === 'err' ? 8000 : 4500); }
const b64e = (bytes) => { let s = ''; bytes = new Uint8Array(bytes); for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
const utf8b64 = (str) => b64e(new TextEncoder().encode(str));
const saveSess = () => localStorage.setItem(SK, JSON.stringify({ t: S.sess, def: S.def, exp: Date.now() + 11.5 * 3600e3 }));

async function api(path, opt = {}, retried = false) {
  const headers = { ...(typeof opt.body === 'string' ? { 'Content-Type': 'application/json' } : {}) };
  if (S.sess) headers.Authorization = 'Bearer ' + S.sess;
  let r;
  try { r = await fetch(`${CFG.api}/api/${CFG.id}${path}`, { ...opt, headers, cache: 'no-store' }); }
  catch { throw new Error('Nelze se spojit se serverem. Zkontrolujte připojení k internetu.'); }
  if (r.status === 401 && path !== '/login' && !retried && S.D.obsah) { if (await reauth()) return api(path, opt, true); }
  if (!r.ok) { let m = r.statusText; try { m = (await r.json()).error || m; } catch {} const e = new Error(m); e.status = r.status; throw e; }
  return opt.raw ? r.text() : r.json();
}
const readFile = (p) => api('/file?path=' + encodeURIComponent(p) + '&t=' + Date.now(), { raw: true });
async function commit(files, message) {
  const out = []; const queue = [...files];
  const worker = async () => { while (queue.length) { const f = queue.shift(); const { sha } = await api('/blob', { method: 'POST', body: JSON.stringify({ content: f.b64 ?? utf8b64(f.content), encoding: 'base64' }) }); out.push({ path: f.path, sha }); } };
  await Promise.all([worker(), worker(), worker()]);
  return (await api('/commit', { method: 'POST', body: JSON.stringify({ files: out, message }) })).sha;
}
async function reauth() {
  const pw = prompt('Přihlášení vypršelo. Zadejte heslo znovu (rozdělaná práce zůstane zachována):');
  if (!pw) return false;
  try { const r = await api('/login', { method: 'POST', body: JSON.stringify({ password: pw }) }); S.sess = r.token; S.def = r.def; saveSess(); return true; }
  catch (e) { toast('Přihlášení se nepovedlo: ' + e.message, 'err'); return false; }
}

/* data */
async function loadAll() {
  for (const k of Object.keys(FILES)) { S.D[k] = JSON.parse(await readFile(FILES[k])); S.snap[k] = JSON.stringify(S.D[k]); }
}
const dirty = () => Object.keys(FILES).filter((k) => JSON.stringify(S.D[k]) !== S.snap[k]);
const bar = () => { const b = $('#savebar'); if (!b) return; const d = dirty(); b.classList.toggle('on', d.length > 0 || S.saving); b.querySelector('span').textContent = S.saving ? 'Ukládám…' : 'Máte neuložené změny.'; b.querySelectorAll('button').forEach((x) => { x.disabled = S.saving; }); };
window.addEventListener('beforeunload', (e) => { if (dirty().length) { e.preventDefault(); e.returnValue = ''; } });

async function saveAll() {
  const keys = dirty(); if (!keys.length || S.saving) return;
  const O = S.D.obsah; for (const z of O.zisky) if (!z.kdo.trim() || !z.text.trim()) return toast('Zisk studenta: vyplňte jméno i text, nebo ho smažte.', 'err');
  S.saving = true; bar();
  try {
    const files = keys.map((k) => ({ path: FILES[k], content: JSON.stringify(S.D[k], null, 2) + '\n' }));
    const used = JSON.stringify(S.D);
    const imgs = Object.keys(S.pending).filter((p) => used.includes(p.replace(/^img\//, '')));
    imgs.forEach((p) => files.push({ path: p, b64: S.pending[p] }));
    const sha = await commit(files, 'Administrace: ' + keys.join(', ') + (imgs.length ? ` (+${imgs.length} foto)` : ''));
    imgs.forEach((p) => delete S.pending[p]);
    keys.forEach((k) => { S.snap[k] = JSON.stringify(S.D[k]); });
    toast('Uloženo. Změny se na webu objeví přibližně za minutu.', 'ok'); watchPublish(sha);
  } catch (e) { toast('Uložení se nepovedlo: ' + e.message, 'err'); }
  finally { S.saving = false; bar(); }
}
let pubTimer = null;
function setPub(t) { const el = $('.pub'); if (el) el.textContent = t; }
function watchPublish(sha) {
  clearInterval(pubTimer); setPub('Zveřejňuji změny…'); const t0 = Date.now();
  pubTimer = setInterval(async () => {
    try { const v = await fetch(CFG.site + 'version.json?t=' + Date.now(), { cache: 'no-store' }).then((r) => r.json());
      if (v.sha === sha) { clearInterval(pubTimer); setPub('Web je aktuální'); toast('Změny jsou na webu.', 'ok'); return; } } catch {}
    if (Date.now() - t0 > 8 * 60000) { clearInterval(pubTimer); setPub('Zveřejnění trvá déle než obvykle'); }
  }, 6000);
}

/* obrázky: v prohlížeči se zmenší na 1800 px a převedou na WebP */
async function compress(file, max = 1800) {
  let bmp; try { bmp = await createImageBitmap(file); } catch { throw new Error(`Soubor „${file.name}“ nejde načíst. Použijte JPG, PNG nebo WebP.`); }
  const sc = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  let blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.8)), ext = 'webp';
  if (!blob || blob.type !== 'image/webp') { blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85)); ext = 'jpg'; }
  return { blob, ext };
}
async function upload(file) {
  const { blob, ext } = await compress(file); const d = new Date();
  const name = slug(file.name.replace(/\.[^.]+$/, '')) || 'foto';
  const rel = `uploads/${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}/${name}-${uid()}.${ext}`;
  S.pending['img/' + rel] = b64e(await blob.arrayBuffer()); S.preview[rel] = URL.createObjectURL(blob);
  return rel;
}
/* náhled: fotka z webu je v img/<název>, v živém webu až jako WebP varianta, proto se pro starší fotky bere z images.json knihovny */
const thumb = (rel) => S.preview[rel] || null;
async function lib() { if (!S.lib) { try { S.lib = await fetch(CFG.site + 'images.json?t=' + Date.now()).then((r) => r.json()); } catch { S.lib = []; } } return S.lib; }
/* URL náhledu: build ukládá <stem>-<šířka>.webp, stem = cesta s „-“ místo „/“ */
const live = (rel) => { const stem = rel.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9._-]+/g, '-'); return CFG.site + 'img/' + stem + '-640.webp'; };
const src = (rel) => thumb(rel) || live(rel);

/* pohledy */
const O = () => S.D.obsah;
const touch = () => bar();
const fld = (obj, key, label, o = {}) => h('label.f', {}, h('span', {}, label),
  o.multi ? h('textarea', { rows: o.rows || 3, oninput: (e) => { obj[key] = e.target.value; touch(); } }, obj[key] || '') : h('input', { type: 'text', value: obj[key] || '', oninput: (e) => { obj[key] = e.target.value; touch(); } }));
/* seznam odrážek: jedna odrážka na řádek */
const lines = (obj, key, label, rows = 4) => h('label.f', {}, h('span', {}, label + ' (každá odrážka na samostatný řádek)'),
  h('textarea', { rows, oninput: (e) => { obj[key] = e.target.value.split('\n').map((x) => x.trim()).filter(Boolean); touch(); } }, (obj[key] || []).join('\n')));
const oblastSel = (obj) => h('label.f', {}, h('span', {}, 'Oblast'), (() => { const s = h('select', { onchange: (e) => { obj.oblast = e.target.value; touch(); } }, O().oblasti.map((o) => h('option', { value: o.id }, o.nazev))); s.value = obj.oblast; return s; })());
const card = (title, hint, ...kids) => h('section.card', {}, h('h2', {}, title), h('p.hint', {}, hint), ...kids);

function vKurzy() {
  const arr = O().kurzy; const box = h('div');
  const render = () => {
    box.replaceChildren(...arr.map((k) => h('div.row', {}, h('h3', {}, k.nazev || 'Nový kurz'),
      fld(k, 'nazev', 'Název kurzu'), fld(k, 'uroven', 'Úroveň (např. „Kurz na zlepšení života“)'), oblastSel(k),
      fld(k, 'perex', 'Krátký popis', { multi: true }), lines(k, 'naucis', 'Co se naučíš', 5))),
      h('button.btn.btn-p', { type: 'button', onclick: () => { arr.push({ id: 'kurz-' + uid(), nazev: 'Nový kurz', oblast: O().oblasti[0].id, uroven: 'Kurz', perex: '', naucis: [] }); touch(); render(); } }, '＋ Přidat kurz'));
  };
  render();
  return card('Kurzy', 'Texty kurzů na stránce Kurzy. Smazání kurzu, který už je na webu, vám raději provedeme my (napište nám).', box);
}
function vKoucing() {
  const box = h('div');
  box.replaceChildren(...O().koucing.map((k) => h('div.row', {}, h('h3', {}, k.nazev),
    fld(k, 'nazev', 'Název'), fld(k, 'perex', 'Popis', { multi: true, rows: 5 }), lines(k, 'ziskas', 'Co získáš', 4))));
  return card('Osobní koučing', 'Texty na stránce Koučing.', box);
}
function vKnihy() {
  const box = h('div');
  const render = () => box.replaceChildren(...O().knihy.map((k) => {
    const im = h('img', { alt: '' }); if (k.obalka) im.src = src(k.obalka);
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { k.obalka = await upload(f); im.src = S.preview[k.obalka]; touch(); toast('Obálka je připravená. Na web se nahraje po kliknutí na „Uložit změny“.'); } catch (er) { toast(er.message, 'err'); } e.target.value = ''; } });
    return h('div.row', {}, h('h3', {}, k.nazev), h('div.cover', {}, im, h('button.btn.btn-s', { type: 'button', onclick: () => file.click() }, k.obalka ? 'Vyměnit obálku' : 'Nahrát obálku'), file),
      fld(k, 'nazev', 'Název knihy'), fld(k, 'podtitul', 'Podtitul'), fld(k, 'autor', 'Autor'), fld(k, 'text', 'Popis', { multi: true }));
  }));
  render();
  return card('Knihy', 'Texty a obálky na stránce Knihy. Fotka obálky se na webu automaticky zmenší.', box);
}
function vZisky() {
  const arr = O().zisky; const box = h('div');
  const nazev = (id) => { const k = O().kurzy.concat(O().koucing).find((x) => x.id === id); return k ? k.nazev : id; };
  const render = () => {
    const sel = (z) => { const s = h('select', { onchange: (e) => { z.k = e.target.value; z.typ = O().koucing.some((x) => x.id === z.k) ? 'koucing' : 'kurz'; touch(); } },
      h('optgroup', { label: 'Kurzy' }, O().kurzy.map((k) => h('option', { value: k.id }, k.nazev))), h('optgroup', { label: 'Koučing' }, O().koucing.map((k) => h('option', { value: k.id }, k.nazev)))); s.value = z.k; return s; };
    box.replaceChildren(h('button.btn.btn-p', { type: 'button', onclick: () => { arr.unshift({ kdo: '', k: O().kurzy[0].id, text: '', typ: 'kurz' }); touch(); render(); } }, '＋ Přidat zisk studenta'),
      ...arr.map((z, i) => h('div.row', {}, h('h3', {}, (z.kdo || 'Nový zisk') + ' – ' + nazev(z.k)),
        fld(z, 'kdo', 'Kdo (např. „J. N.“ – stačí iniciály)'), h('label.f', {}, h('span', {}, 'Z kterého kurzu / koučinku'), sel(z)), fld(z, 'text', 'Text zisku', { multi: true }),
        h('button.btn.btn-s', { type: 'button', onclick: () => { if (confirm('Smazat tento zisk?')) { arr.splice(i, 1); touch(); render(); } } }, '🗑 Smazat'))));
  };
  render();
  return card(`Zisky studentů (${arr.length})`, 'Citáty studentů na stránce Příběhy. Nové se přidávají na začátek. Uvádějte jen se souhlasem studenta.', box);
}
function vCesta() {
  const box = h('div');
  box.replaceChildren(...O().cesta.map((c, i) => h('div.row', {}, h('h3', {}, `${i + 1}. ${c.nazev}`), fld(c, 'nazev', 'Název kroku'), fld(c, 'text', 'Text', { multi: true }))),
    ...O().oblasti.map((o) => h('div.row', {}, h('h3', {}, 'Oblast: ' + o.nazev), fld(o, 'nazev', 'Název oblasti'), fld(o, 'otazka', 'Otázka na úvodní stránce', { multi: true }))));
  return card('Úvodní stránka', 'Kroky „Cesta“ a otázky u jednotlivých oblastí.', box);
}
function vKontakt() {
  const k = S.D.site.kontakt, a = k.adresa;
  return card('Kontakt', 'Údaje v patičce a na stránce Kontakt.', fld(k, 'email', 'E-mail'), fld(k, 'telefon', 'Telefon'), fld(k, 'instagram', 'Odkaz na Instagram'), fld(a, 'ulice', 'Ulice a číslo'), fld(a, 'mesto', 'Město'));
}
const TABS = [['Kurzy', vKurzy], ['Koučing', vKoucing], ['Knihy', vKnihy], ['Zisky studentů', vZisky], ['Úvodní stránka', vCesta], ['Kontakt', vKontakt], ['Heslo', () => vHeslo()]];
let curTab = 0;
function vTabs() {
  const box = h('div'); const tabs = h('div.tabs');
  const show = (i) => { curTab = i; tabs.replaceChildren(...TABS.map((t, j) => h('button' + (j === i ? '.on' : ''), { type: 'button', onclick: () => show(j) }, t[0]))); box.replaceChildren(TABS[i][1]()); };
  show(curTab);
  return h('div', {}, tabs, box);
}
function vHeslo() {
  const o = h('input', { type: 'password', autocomplete: 'current-password' }), a = h('input', { type: 'password', autocomplete: 'new-password' }), b = h('input', { type: 'password', autocomplete: 'new-password' });
  return h('section.card', {}, h('h2', {}, 'Heslo'), S.def ? h('div.banner', {}, 'Používáte výchozí heslo „admin“. Nastavte si prosím vlastní.') : null,
    h('label.f', {}, h('span', {}, 'Současné heslo'), o), h('label.f', {}, h('span', {}, 'Nové heslo (min. 8 znaků)'), a), h('label.f', {}, h('span', {}, 'Nové heslo znovu'), b),
    h('button.btn', { type: 'button', onclick: async () => {
      if (a.value.length < 8) return toast('Heslo musí mít aspoň 8 znaků.', 'err'); if (a.value !== b.value) return toast('Hesla se neshodují.', 'err');
      try { const r = await api('/password', { method: 'POST', body: JSON.stringify({ old: o.value, password: a.value }) }); if (r.token) { S.sess = r.token; S.def = false; saveSess(); } o.value = a.value = b.value = ''; toast('Heslo změněno.', 'ok'); }
      catch (e) { toast('Heslo se nepodařilo změnit: ' + e.message, 'err'); } } }, 'Změnit heslo'));
}
function shell() {
  $('#app').replaceChildren(
    h('header.top', {}, h('b', {}, 'Škola růstu – administrace'), h('span.pub', {}, 'Web je aktuální'),
      h('span', {}, h('a.btn.btn-s', { href: CFG.site, target: '_blank', rel: 'noopener' }, 'Zobrazit web'), ' ',
        h('button.btn.btn-s', { type: 'button', onclick: () => { if (dirty().length && !confirm('Máte neuložené změny. Opravdu se odhlásit?')) return; localStorage.removeItem(SK); S.sess = null; login(); } }, 'Odhlásit'))),
    h('div.wrap', {}, S.def ? h('div.banner', {}, 'Používáte výchozí heslo „admin“. Dole na stránce si nastavte vlastní.') : null, vTabs()),
    h('div.savebar', { id: 'savebar' }, h('span', {}, ''),
      h('span', {}, h('button.btn.btn-s', { type: 'button', onclick: () => { if (confirm('Zahodit neuložené změny?')) location.reload(); } }, 'Zahodit'), ' ',
        h('button.btn.btn-p', { type: 'button', onclick: saveAll }, 'Uložit změny'))));
  bar();
}
function login(msg = '') {
  const inp = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Heslo', required: true });
  const err = h('p.err', {}, msg); const btn = h('button.btn.btn-p', { type: 'submit' }, 'Přihlásit se');
  $('#app').replaceChildren(h('form.login', { onsubmit: async (e) => {
    e.preventDefault(); err.textContent = ''; btn.disabled = true;
    try { const r = await api('/login', { method: 'POST', body: JSON.stringify({ password: inp.value }) }); S.sess = r.token; S.def = r.def; saveSess(); start(); }
    catch (er) { err.textContent = er.message; btn.disabled = false; inp.select(); } } },
    h('h1', {}, 'Administrace webu'), h('p', {}, 'Škola růstu'), h('label.f', {}, h('span', {}, 'Heslo'), inp), btn, err));
  setTimeout(() => inp.focus(), 50);
}
async function start() {
  try { await loadAll(); } catch (e) { if (e.status === 401) { localStorage.removeItem(SK); S.sess = null; return login('Přihlášení vypršelo, přihlaste se znovu.'); } return login('Obsah se nepodařilo načíst: ' + e.message); }
  shell();
}
const s = JSON.parse(localStorage.getItem(SK) || 'null');
if (s && s.exp > Date.now()) { S.sess = s.t; S.def = s.def; start(); } else login();
})();
