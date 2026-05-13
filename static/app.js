// OpenLP song XML editor — pure client-side parsing/serialization.
//
// OpenLP's internal song XML format (the blob stored in the songs.lyrics column):
//
//   <?xml version='1.0' encoding='UTF-8'?>
//   <song version="1.0">
//     <lyrics>
//       <verse label="1" type="v"><![CDATA[Line one
//   Line two]]></verse>
//     </lyrics>
//   </song>
//
// verse `type` is a single letter: v, c, b, p, e, i, o.
// verse `label` is a number (1, 2, ...). The pair (type, label) identifies a verse — e.g. v1, c1.
//
// verseOrder lives outside the lyrics column in OpenLP; we round-trip it as
// a sibling <properties><verseOrder> child for portability.

const VERSE_TYPES = [
  { v: 'v', label: 'Verse' },
  { v: 'c', label: 'Chorus' },
  { v: 'p', label: 'Pre-chorus' },
  { v: 'b', label: 'Bridge' },
  { v: 'i', label: 'Intro' },
  { v: 'e', label: 'Ending' },
  { v: 'o', label: 'Other' },
];
const TYPE_NAME = Object.fromEntries(VERSE_TYPES.map(t => [t.v, t.label]));

// OpenLP default formatting tags. See:
// https://manual.openlp.org/display_tags.html
const FMT_TAGS = [
  { open: '{st}', close: '{/st}', html: '<b>B</b>',           title: 'Bold (OpenLP {st})' },
  { open: '{it}', close: '{/it}', html: '<i>I</i>',           title: 'Italic (OpenLP {it})' },
  { open: '{u}',  close: '{/u}',  html: '<u>U</u>',           title: 'Underline (OpenLP {u})' },
  { open: '{su}', close: '{/su}', html: 'x<sup>2</sup>',      title: 'Superscript (OpenLP {su})' },
  { open: '{sb}', close: '{/sb}', html: 'x<sub>2</sub>',      title: 'Subscript (OpenLP {sb})' },
  { open: '{r}',  close: '{/r}',  html: '<span style="color:#dc2626">R</span>', title: 'Red (OpenLP {r})' },
  { open: '{br}', close: '',      html: '↵',                  title: 'Line break (OpenLP {br})' },
];

// OpenLP color tags mapped to CSS colors (display preview).
const FMT_COLORS = {
  r:  '#dc2626',  // red
  b:  '#000000',  // black
  bl: '#2563eb',  // blue
  y:  '#ca8a04',  // yellow
  g:  '#16a34a',  // green
  pk: '#ec4899',  // pink
  o:  '#ea580c',  // orange
  pp: '#9333ea',  // purple
  w:  '#94a3b8',  // white — rendered as light gray so it's visible on light bg
};

const LS_XML   = 'editlp.xml';
const LS_ORDER = 'editlp.verseOrder';

const SAMPLE = `<?xml version='1.0' encoding='UTF-8'?>
<song version="1.0"><lyrics><verse label="1" type="v"><![CDATA[Deus prometeu com certeza
Chuvas de graça mandar;
Ele nos dá fortaleza,
E ricas bênçãos sem par]]></verse><verse label="1" type="c"><![CDATA[Chuvas de graça,
Chuvas pedimos, Senhor;
Manda-nos chuvas constantes,
Chuvas do Consolador.]]></verse><verse label="2" type="v"><![CDATA[Cristo nos tem concedido
O santo Consolador,
De plena paz nos enchido,
Para o reinado de amor.]]></verse><verse label="3" type="v"><![CDATA[Dá-nos, Senhor, amplamente,
Teu grande gozo e poder;
Fonte de amor permanente,
Põe dentro de nosso ser.]]></verse><verse label="4" type="v"><![CDATA[Faze os teus servos piedosos,
Dá-lhes virtude e valor,
Dando os teus dons preciosos,
Do santo Preceptor.]]></verse></lyrics></song>`;

const xmlEl        = document.getElementById('xml');
const xmlPane      = document.getElementById('xmlPane');
const versesEl     = document.getElementById('verses');
const statusEl     = document.getElementById('status');
const previewEl    = document.getElementById('preview');
const vMajorEl     = document.getElementById('p-vmajor');
const vMinorEl     = document.getElementById('p-vminor');
const vPatchEl     = document.getElementById('p-vpatch');
const filenameEl   = document.getElementById('p-filename');
const orderEl      = document.getElementById('p-order');
const validationEl = document.getElementById('validation');
const filePicker   = document.getElementById('filePicker');
const dropOverlay  = document.getElementById('dropOverlay');
const prettifyBtn  = document.getElementById('prettify');
const minifyBtn    = document.getElementById('minify');

let songAttrs   = { version: '1.0' };
let verseOrder  = '';
let suppress    = false;
let xmlDebounce = null;
let formatMode  = 'compact'; // 'compact' | 'pretty' | 'minify'
let draggedIdx  = null;      // index of the verse currently being dragged

// ---------- Undo / Redo ----------

const undoStack = [];
const redoStack = [];
let present = '';
let snapshotTimer = null;
const MAX_HISTORY = 200;

function snapshotState() {
  return JSON.stringify({ xml: xmlEl.value, order: orderEl.value });
}

function restoreSnapshot(s) {
  try {
    const obj = JSON.parse(s);
    xmlEl.value = obj.xml || '';
    orderEl.value = obj.order || '';
    verseOrder = obj.order || '';
  } catch {
    xmlEl.value = '';
    orderEl.value = '';
    verseOrder = '';
  }
}

function commitSnapshot() {
  clearTimeout(snapshotTimer);
  snapshotTimer = null;
  const cur = snapshotState();
  if (cur === present) return;
  undoStack.push(present);
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
  present = cur;
  persist();
  refreshUndoButtons();
}

function scheduleSnapshot() {
  clearTimeout(snapshotTimer);
  snapshotTimer = setTimeout(commitSnapshot, 500);
}

function undo() {
  commitSnapshot();
  if (!undoStack.length) return;
  redoStack.push(present);
  present = undoStack.pop();
  restoreSnapshot(present);
  syncFromXml();
  persist();
  refreshUndoButtons();
}

function redo() {
  commitSnapshot();
  if (!redoStack.length) return;
  undoStack.push(present);
  present = redoStack.pop();
  restoreSnapshot(present);
  syncFromXml();
  persist();
  refreshUndoButtons();
}

function refreshUndoButtons() {
  document.getElementById('undo').disabled = !undoStack.length;
  document.getElementById('redo').disabled = !redoStack.length;
}

// ---------- Parse ----------

function parseXml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const err = doc.querySelector('parsererror');
  if (err) throw new Error(err.textContent.replace(/\s+/g, ' ').trim());
  const root = doc.documentElement;
  if (!root || root.tagName !== 'song') throw new Error('root element must be <song>');
  return root;
}

function readSongAttrs(song) {
  const out = {};
  for (const a of song.attributes) out[a.name] = a.value;
  return out;
}

// When a verse contains CDATA sections, return only the concatenated CDATA
// content — that way, indentation whitespace around the CDATA (from prettified
// XML) doesn't leak into the verse text on re-parse.
function extractVerseText(v) {
  const cdataParts = [];
  let hasCdata = false;
  for (const node of v.childNodes) {
    if (node.nodeType === 4 /* CDATA_SECTION_NODE */) {
      cdataParts.push(node.data);
      hasCdata = true;
    }
  }
  if (hasCdata) return cdataParts.join('');
  return v.textContent.trim();
}

function readVerses(song) {
  const lyrics = Array.from(song.children).find(c => c.tagName === 'lyrics');
  if (!lyrics) return [];
  return Array.from(lyrics.children)
    .filter(c => c.tagName === 'verse')
    .map(v => ({
      type:  v.getAttribute('type')  || 'v',
      label: v.getAttribute('label') || '',
      text:  extractVerseText(v),
    }));
}

function readVerseOrder(song) {
  const props = Array.from(song.children).find(c => c.tagName === 'properties');
  if (props) {
    const vo = Array.from(props.children).find(c => c.tagName === 'verseOrder');
    if (vo) return vo.textContent.trim();
  }
  const direct = Array.from(song.children).find(c => c.tagName === 'verseOrder');
  return direct ? direct.textContent.trim() : '';
}

// ---------- Serialize ----------

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Embed `text` inside a CDATA section. If the text contains the CDATA close
// sequence "]]>", split it across multiple CDATA sections — that's the only way
// to escape it (CDATA content is otherwise literal).
function wrapCData(text) {
  const safe = String(text).split(']]>').join(']]]]><![CDATA[>');
  return `<![CDATA[${safe}]]>`;
}

function songAttrString(attrs) {
  return Object.entries(attrs)
    .filter(([_, v]) => v != null && v !== '')
    .map(([k, v]) => ` ${k}="${esc(v)}"`)
    .join('');
}

function verseHead(v) {
  const va = [];
  if (v.label) va.push(`label="${esc(v.label)}"`);
  if (v.type)  va.push(`type="${esc(v.type)}"`);
  return `<verse${va.length ? ' ' + va.join(' ') : ''}>`;
}

function buildXmlCompact(verses, attrs, order) {
  let out = "<?xml version='1.0' encoding='UTF-8'?>\n";
  out += `<song${songAttrString(attrs)}>\n`;
  out += '  <lyrics>\n';
  for (const v of verses) {
    out += `    ${verseHead(v)}${wrapCData(v.text || '')}</verse>\n`;
  }
  out += '  </lyrics>\n';
  if (order && order.trim()) {
    out += `  <properties>\n    <verseOrder>${esc(order.trim())}</verseOrder>\n  </properties>\n`;
  }
  out += '</song>\n';
  return out;
}

function buildXmlPretty(verses, attrs, order) {
  let out = "<?xml version='1.0' encoding='UTF-8'?>\n";
  out += `<song${songAttrString(attrs)}>\n`;
  out += '  <lyrics>\n';
  for (const v of verses) {
    out += `    ${verseHead(v)}\n`;
    out += `      ${wrapCData(v.text || '')}\n`;
    out += `    </verse>\n`;
  }
  out += '  </lyrics>\n';
  if (order && order.trim()) {
    out += `  <properties>\n    <verseOrder>${esc(order.trim())}</verseOrder>\n  </properties>\n`;
  }
  out += '</song>\n';
  return out;
}

function buildXmlMinified(verses, attrs, order) {
  let out = "<?xml version='1.0' encoding='UTF-8'?>";
  out += `<song${songAttrString(attrs)}><lyrics>`;
  for (const v of verses) {
    out += `${verseHead(v)}${wrapCData(v.text || '')}</verse>`;
  }
  out += '</lyrics>';
  if (order && order.trim()) {
    out += `<properties><verseOrder>${esc(order.trim())}</verseOrder></properties>`;
  }
  out += '</song>';
  return out;
}

function buildXml(verses, attrs, order) {
  if (formatMode === 'minify') return buildXmlMinified(verses, attrs, order);
  if (formatMode === 'pretty') return buildXmlPretty(verses, attrs, order);
  return buildXmlCompact(verses, attrs, order);
}

function setFormatMode(m) {
  formatMode = m;
  prettifyBtn.classList.toggle('active', m === 'pretty');
  minifyBtn.classList.toggle('active', m === 'minify');
}

// ---------- Version (semver) ----------

function parseVersion(v) {
  const parts = String(v || '').split('.').map(s => parseInt(s, 10));
  return {
    major: Number.isFinite(parts[0]) ? parts[0] : 0,
    minor: Number.isFinite(parts[1]) ? parts[1] : 0,
    patch: Number.isFinite(parts[2]) ? parts[2] : 0,
  };
}

function readVersionFields() {
  const major = Math.max(0, parseInt(vMajorEl.value, 10) || 0);
  const minor = Math.max(0, parseInt(vMinorEl.value, 10) || 0);
  const patch = Math.max(0, parseInt(vPatchEl.value, 10) || 0);
  return `${major}.${minor}.${patch}`;
}

function writeVersionFields(v) {
  const { major, minor, patch } = parseVersion(v);
  vMajorEl.value = major;
  vMinorEl.value = minor;
  vPatchEl.value = patch;
}

// ---------- Render form ----------

function renderForm(verses) {
  writeVersionFields(songAttrs.version || '1.0');
  orderEl.value = verseOrder || '';
  versesEl.innerHTML = '';
  verses.forEach((v, i) => versesEl.appendChild(verseNode(v, i)));
  autoSizeAll();
}

// Grow a verse textarea to fit its content — the `rows` attribute provides the
// minimum baseline, scrollHeight provides the actual content height.
function autoSize(ta) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}

function autoSizeAll() {
  for (const ta of versesEl.querySelectorAll('textarea[data-k="text"]')) {
    autoSize(ta);
  }
}

function verseNode(v, i) {
  const div = document.createElement('div');
  div.className = 'verse';
  div.dataset.idx = String(i);
  div.dataset.type = v.type || 'v';
  div.draggable = true;
  const opts = VERSE_TYPES
    .map(t => `<option value="${t.v}"${t.v === v.type ? ' selected' : ''}>${t.v} — ${t.label}</option>`)
    .join('');
  const fmtBtns = FMT_TAGS
    .map(f => `<button type="button" class="fmt-btn" data-fmt-open="${esc(f.open)}" data-fmt-close="${esc(f.close)}" title="${esc(f.title)}">${f.html}</button>`)
    .join('');
  div.innerHTML = `
    <div class="verse-header">
      <span class="grip" title="Drag to reorder">⋮⋮</span>
      <label>type
        <select data-k="type">${opts}</select>
      </label>
      <label>label
        <input type="text" data-k="label" value="${esc(v.label)}" placeholder="1">
      </label>
      <span class="verse-tag">${esc((v.type || '') + (v.label || ''))}</span>
      <span class="spacer"></span>
      <button type="button" class="mini" data-act="dup" title="Duplicate verse">copy</button>
      <button type="button" class="mini" data-act="up" title="Move up">▲</button>
      <button type="button" class="mini" data-act="down" title="Move down">▼</button>
      <button type="button" class="mini danger" data-act="del" title="Remove">remove</button>
    </div>
    <div class="verse-toolbar">${fmtBtns}</div>
    <textarea data-k="text" rows="8" placeholder="Lyric lines, one per row.">${esc(v.text)}</textarea>
  `;
  return div;
}

function readForm() {
  const verses = Array.from(versesEl.querySelectorAll('.verse')).map(div => ({
    type:  div.querySelector('[data-k="type"]').value.trim(),
    label: div.querySelector('[data-k="label"]').value.trim(),
    text:  div.querySelector('[data-k="text"]').value,
  }));
  songAttrs.version = readVersionFields();
  verseOrder = orderEl.value;
  return verses;
}

// ---------- Preview ----------

// Translate OpenLP formatting tags inside a verse body to HTML for the preview.
// Run AFTER HTML escaping (which leaves `{` and `}` alone), so the braces are intact.
function renderFormattedBody(text) {
  let html = esc(text);
  // Self-closing line break.
  html = html.replace(/\{br\}/g, '<br>');
  // Wrapping tags — direct HTML equivalents.
  const wrap = [
    ['{st}',  '<strong>',  '{/st}',  '</strong>'],
    ['{it}',  '<em>',      '{/it}',  '</em>'],
    ['{u}',   '<u>',       '{/u}',   '</u>'],
    ['{su}',  '<sup>',     '{/su}',  '</sup>'],
    ['{sb}',  '<sub>',     '{/sb}',  '</sub>'],
    ['{p}',   '<p>',       '{/p}',   '</p>'],
  ];
  for (const [o, oRep, c, cRep] of wrap) {
    html = html.split(o).join(oRep).split(c).join(cRep);
  }
  // Color tags.
  for (const [code, color] of Object.entries(FMT_COLORS)) {
    html = html.split(`{${code}}`).join(`<span style="color:${color}">`)
               .split(`{/${code}}`).join('</span>');
  }
  // Plain newlines.
  html = html.replace(/\n/g, '<br>');
  return html;
}

function renderPreview(verses) {
  if (!verses.length) {
    previewEl.innerHTML = '<p class="empty">Nothing to preview yet.</p>';
    return;
  }
  const html = verses.map(v => {
    const t = v.type || 'v';
    const tag = t + (v.label || '');
    const name = TYPE_NAME[t] || t || 'Verse';
    const head = `${name}${v.label ? ' ' + v.label : ''}`;
    const body = renderFormattedBody(v.text || '');
    return `<div class="pv-verse" data-type="${esc(t)}"><div class="pv-head">${esc(head)} <span class="pv-tag">${esc(tag)}</span></div><div class="pv-body">${body}</div></div>`;
  }).join('');
  previewEl.innerHTML = html;
}

// ---------- Validation ----------

function validate(verses) {
  const issues = [];
  const seen = new Map();
  verses.forEach((v, i) => {
    const key = `${v.type}|${v.label}`;
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(i + 1);
    if (!v.text || !v.text.trim()) {
      issues.push(`Verse #${i + 1} (${v.type}${v.label}) has empty body.`);
    }
    if (v.label && !/^\d+$/.test(v.label)) {
      issues.push(`Verse #${i + 1} has non-numeric label "${v.label}".`);
    }
  });
  for (const [key, positions] of seen) {
    if (positions.length > 1 && key.split('|')[1]) {
      const [t, l] = key.split('|');
      issues.push(`Duplicate "${t}${l}" at positions ${positions.join(', ')}.`);
    }
  }
  if (verseOrder && verseOrder.trim() && verses.length) {
    const known = new Set(verses.map(v => `${v.type}${v.label}`));
    const tokens = verseOrder.trim().split(/\s+/);
    for (const tok of tokens) {
      if (!known.has(tok)) issues.push(`Verse order references unknown verse "${tok}".`);
    }
  }
  return issues;
}

function renderValidation(issues) {
  if (!issues.length) {
    validationEl.hidden = true;
    validationEl.innerHTML = '';
    return;
  }
  validationEl.hidden = false;
  validationEl.innerHTML =
    '<strong>Issues</strong><ul>' +
    issues.map(m => `<li>${esc(m)}</li>`).join('') +
    '</ul>';
}

// ---------- Sync ----------

function syncFromXml() {
  if (suppress) return;
  const text = xmlEl.value;
  if (!text.trim()) {
    songAttrs = { version: '1.0' };
    suppress = true;
    renderForm([]);
    renderPreview([]);
    renderValidation([]);
    suppress = false;
    setStatus('', '');
    return;
  }
  try {
    const song = parseXml(text);
    songAttrs = readSongAttrs(song);
    const verses = readVerses(song);
    const orderFromXml = readVerseOrder(song);
    if (orderFromXml) verseOrder = orderFromXml;
    suppress = true;
    renderForm(verses);
    renderPreview(verses);
    renderValidation(validate(verses));
    suppress = false;
    setStatus(`parsed ok — ${verses.length} verse${verses.length === 1 ? '' : 's'}`, 'ok');
  } catch (e) {
    setStatus(e.message, 'error');
  }
}

function syncFromForm() {
  if (suppress) return;
  const verses = readForm();
  const xml = buildXml(verses, songAttrs, verseOrder);
  suppress = true;
  xmlEl.value = xml;
  suppress = false;
  renderPreview(verses);
  renderValidation(validate(verses));
  setStatus(`serialized ok — ${verses.length} verse${verses.length === 1 ? '' : 's'}`, 'ok');
  refreshVerseTags();
}

function refreshVerseTags() {
  for (const div of versesEl.querySelectorAll('.verse')) {
    const type = div.querySelector('[data-k="type"]').value;
    const label = div.querySelector('[data-k="label"]').value;
    div.dataset.type = type || 'v';
    div.querySelector('.verse-tag').textContent = (type || '') + (label || '');
  }
}

function setStatus(msg, cls) {
  statusEl.textContent = msg;
  statusEl.className = 'status' + (cls ? ' ' + cls : '');
}

// ---------- Autonumber / reformat ----------

function autonumber(verses) {
  const counters = {};
  return verses.map(v => {
    const t = v.type || 'v';
    counters[t] = (counters[t] || 0) + 1;
    return { ...v, label: String(counters[t]) };
  });
}

function reformat() {
  try {
    const song = parseXml(xmlEl.value);
    songAttrs = readSongAttrs(song);
    const verses = readVerses(song);
    const orderFromXml = readVerseOrder(song);
    if (orderFromXml) verseOrder = orderFromXml;
    const xml = buildXml(verses, songAttrs, verseOrder);
    suppress = true;
    xmlEl.value = xml;
    suppress = false;
    syncFromXml();
    commitSnapshot();
    setStatus(`${formatMode === 'compact' ? 'formatted' : formatMode}`, 'ok');
  } catch (e) {
    setStatus(e.message, 'error');
  }
}

// ---------- Filename / file open ----------

function ts() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function updateFilenamePlaceholder() {
  filenameEl.placeholder = `song-${ts()}.xml`;
}

function loadFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    xmlEl.value = String(reader.result || '');
    syncFromXml();
    if (file.name) filenameEl.value = file.name.replace(/\.xml$/i, '');
    commitSnapshot();
  };
  reader.onerror = () => setStatus(`failed to read ${file.name}`, 'error');
  reader.readAsText(file);
}

// ---------- Persistence ----------

function persist() {
  try {
    localStorage.setItem(LS_XML, xmlEl.value);
    localStorage.setItem(LS_ORDER, orderEl.value);
  } catch {}
}

function loadPersisted() {
  try {
    const xml = localStorage.getItem(LS_XML);
    const ord = localStorage.getItem(LS_ORDER);
    if (xml) xmlEl.value = xml;
    if (ord) { orderEl.value = ord; verseOrder = ord; }
  } catch {}
}

// ---------- Download ----------

function download() {
  const blob = new Blob([xmlEl.value], { type: 'application/xml' });
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  const fallback = `song-${ts()}`;
  const stem = (filenameEl.value.trim() || fallback)
    .replace(/\.xml$/i, '')
    .replace(/[^a-z0-9\-_]+/gi, '_').slice(0, 80) || fallback;
  a.download = `${stem}.xml`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------- Add verse ----------

function addVerse(type = 'v') {
  const verses = readForm();
  verses.push({ type, label: nextLabel(verses, type), text: '' });
  suppress = true;
  renderForm(verses);
  suppress = false;
  syncFromForm();
  commitSnapshot();
}

function nextLabel(verses, type) {
  const used = verses.filter(v => v.type === type)
    .map(v => parseInt(v.label, 10))
    .filter(n => !isNaN(n));
  return String((used.length ? Math.max(...used) : 0) + 1);
}

// ---------- Selection wrap (formatting toolbar) ----------

function wrapSelection(ta, open, close) {
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const before = ta.value.slice(0, start);
  const selected = ta.value.slice(start, end);
  const after = ta.value.slice(end);
  if (!close) {
    // Self-closing tag (e.g. {br}) — insert at cursor; leave caret after it.
    ta.value = before + open + selected + after;
    ta.focus();
    ta.selectionStart = ta.selectionEnd = start + open.length;
    return;
  }
  ta.value = before + open + selected + close + after;
  ta.focus();
  // Re-select the previously-selected text (now wrapped), so subsequent
  // typing replaces the inner content rather than appending.
  ta.selectionStart = start + open.length;
  ta.selectionEnd = start + open.length + selected.length;
}

// ---------- Events ----------

xmlEl.addEventListener('input', () => {
  clearTimeout(xmlDebounce);
  xmlDebounce = setTimeout(() => { syncFromXml(); scheduleSnapshot(); }, 150);
});

document.getElementById('tab-edit').addEventListener('input', (e) => {
  if (!e.target.matches('input, select, textarea')) return;
  if (e.target.matches('textarea[data-k="text"]')) autoSize(e.target);
  syncFromForm();
  scheduleSnapshot();
});

// Version bump buttons (▲ bumps + resets lower parts; ▼ just decrements)
document.querySelectorAll('.bump').forEach(b => {
  b.addEventListener('click', () => {
    const which = b.dataset.bump;
    const sign  = b.dataset.dir === 'down' ? -1 : 1;
    const cur = el => Math.max(0, parseInt(el.value, 10) || 0);
    if (which === 'major') {
      vMajorEl.value = Math.max(0, cur(vMajorEl) + sign);
      if (sign > 0) { vMinorEl.value = 0; vPatchEl.value = 0; }
    } else if (which === 'minor') {
      vMinorEl.value = Math.max(0, cur(vMinorEl) + sign);
      if (sign > 0) { vPatchEl.value = 0; }
    } else if (which === 'patch') {
      vPatchEl.value = Math.max(0, cur(vPatchEl) + sign);
    }
    syncFromForm();
    commitSnapshot();
  });
});

versesEl.addEventListener('click', (e) => {
  // Formatting toolbar (B / I / U / x² / x₂ / Red)
  const fmtBtn = e.target.closest('.fmt-btn');
  if (fmtBtn) {
    const div = fmtBtn.closest('.verse');
    const ta = div.querySelector('textarea[data-k="text"]');
    wrapSelection(ta, fmtBtn.dataset.fmtOpen, fmtBtn.dataset.fmtClose);
    syncFromForm();
    scheduleSnapshot();
    return;
  }

  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const div = btn.closest('.verse');
  const idx = Number(div.dataset.idx);
  const verses = readForm();
  if (btn.dataset.act === 'del') {
    verses.splice(idx, 1);
  } else if (btn.dataset.act === 'up' && idx > 0) {
    [verses[idx - 1], verses[idx]] = [verses[idx], verses[idx - 1]];
  } else if (btn.dataset.act === 'down' && idx < verses.length - 1) {
    [verses[idx + 1], verses[idx]] = [verses[idx], verses[idx + 1]];
  } else if (btn.dataset.act === 'dup') {
    const src = verses[idx];
    const copy = { type: src.type, label: nextLabel(verses, src.type), text: src.text };
    verses.splice(idx + 1, 0, copy);
  }
  suppress = true;
  renderForm(verses);
  suppress = false;
  syncFromForm();
  commitSnapshot();
});

document.getElementById('addVerse').addEventListener('click', () => addVerse());

document.getElementById('clear').addEventListener('click', () => {
  xmlEl.value = '';
  filenameEl.value = '';
  verseOrder = '';
  orderEl.value = '';
  syncFromXml();
  commitSnapshot();
});

document.getElementById('download').addEventListener('click', download);

document.getElementById('loadSample').addEventListener('click', () => {
  xmlEl.value = SAMPLE;
  syncFromXml();
  commitSnapshot();
});

prettifyBtn.addEventListener('click', () => {
  setFormatMode(formatMode === 'pretty' ? 'compact' : 'pretty');
  reformat();
});

minifyBtn.addEventListener('click', () => {
  setFormatMode(formatMode === 'minify' ? 'compact' : 'minify');
  reformat();
});

document.getElementById('autonumber').addEventListener('click', () => {
  const verses = autonumber(readForm());
  suppress = true;
  renderForm(verses);
  suppress = false;
  syncFromForm();
  commitSnapshot();
});

document.getElementById('undo').addEventListener('click', undo);
document.getElementById('redo').addEventListener('click', redo);

filePicker.addEventListener('change', () => {
  const f = filePicker.files[0];
  if (f) loadFile(f);
  filePicker.value = '';
});

// Tabs
for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => {
    for (const t of document.querySelectorAll('.tab')) t.classList.toggle('active', t === tab);
    const name = tab.dataset.tab;
    document.getElementById('tab-edit').hidden    = name !== 'edit';
    document.getElementById('tab-preview').hidden = name !== 'preview';
    // scrollHeight is 0 for `display: none` ancestors, so any auto-grow that
    // happened while we were on the preview tab needs to be redone now.
    if (name === 'edit') autoSizeAll();
  });
}

// Drag & drop — overlay appears only while a file is being dragged INSIDE the XML pane.
// We avoid the classic depth-counter pitfall (dragenter/dragleave fire on every child
// boundary) by checking relatedTarget on dragleave, plus window-level safety hides.
function isFileDrag(e) {
  return e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
}
function hideDropOverlay() { dropOverlay.hidden = true; }

xmlPane.addEventListener('dragenter', e => {
  if (!isFileDrag(e)) return;
  e.preventDefault();
  dropOverlay.hidden = false;
});
xmlPane.addEventListener('dragover', e => {
  if (!isFileDrag(e)) return;
  e.preventDefault();
});
xmlPane.addEventListener('dragleave', e => {
  // Only hide if the cursor truly left the pane (the new target is outside it or null).
  if (e.relatedTarget && xmlPane.contains(e.relatedTarget)) return;
  hideDropOverlay();
});
xmlPane.addEventListener('drop', e => {
  if (!isFileDrag(e)) return;
  e.preventDefault();
  hideDropOverlay();
  const f = e.dataTransfer.files[0];
  if (f) loadFile(f);
});
// Safety: if the drag ends anywhere (drop on another part of the page, dropped outside
// the window, or canceled), make sure the overlay isn't left hanging.
window.addEventListener('dragover', e => { if (isFileDrag(e)) e.preventDefault(); });
window.addEventListener('drop',     e => { if (isFileDrag(e)) e.preventDefault(); hideDropOverlay(); });
window.addEventListener('dragend',  hideDropOverlay);

// ---------- Drag-and-drop reorder of verses ----------

function clearDropMarkers() {
  for (const d of versesEl.querySelectorAll('.verse')) {
    d.classList.remove('drop-before', 'drop-after');
  }
}

versesEl.addEventListener('dragstart', e => {
  const div = e.target.closest('.verse');
  if (!div) return;
  // Don't initiate a verse drag when the gesture starts on a form control —
  // those handle their own native drag (text selection in textareas, etc.).
  if (e.target.matches('input, textarea, select, button')) {
    e.preventDefault();
    return;
  }
  draggedIdx = Number(div.dataset.idx);
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', String(draggedIdx)); } catch {}
  div.classList.add('dragging');
});

versesEl.addEventListener('dragover', e => {
  if (draggedIdx === null) return;
  const div = e.target.closest('.verse');
  if (!div) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const rect = div.getBoundingClientRect();
  const isAbove = (e.clientY - rect.top) < rect.height / 2;
  clearDropMarkers();
  div.classList.add(isAbove ? 'drop-before' : 'drop-after');
});

versesEl.addEventListener('dragleave', e => {
  // Clear markers only if we're truly leaving the verses list.
  if (e.relatedTarget && versesEl.contains(e.relatedTarget)) return;
  clearDropMarkers();
});

versesEl.addEventListener('drop', e => {
  if (draggedIdx === null) return;
  const targetDiv = e.target.closest('.verse');
  e.preventDefault();
  const src = draggedIdx;
  draggedIdx = null;
  clearDropMarkers();
  for (const d of versesEl.querySelectorAll('.verse')) d.classList.remove('dragging');

  if (!targetDiv) return;
  const targetIdx = Number(targetDiv.dataset.idx);
  const rect = targetDiv.getBoundingClientRect();
  const isAbove = (e.clientY - rect.top) < rect.height / 2;
  let insertAt = isAbove ? targetIdx : targetIdx + 1;

  // No-op: dropping into the same slot the verse already occupies.
  if (src === insertAt || src === insertAt - 1) return;

  const verses = readForm();
  const [moved] = verses.splice(src, 1);
  if (insertAt > src) insertAt--; // adjust for the removed earlier element
  verses.splice(insertAt, 0, moved);

  suppress = true;
  renderForm(verses);
  suppress = false;
  syncFromForm();
  commitSnapshot();
});

versesEl.addEventListener('dragend', () => {
  draggedIdx = null;
  clearDropMarkers();
  for (const d of versesEl.querySelectorAll('.verse')) d.classList.remove('dragging');
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
  else if (k === 's') { e.preventDefault(); download(); }
  else if (k === 'enter') { e.preventDefault(); addVerse(); }
});

// ---------- Init ----------

updateFilenamePlaceholder();
setInterval(updateFilenamePlaceholder, 1000);

loadPersisted();
syncFromXml();
present = snapshotState();
refreshUndoButtons();
