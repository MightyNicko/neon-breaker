// Level editor UI (layout B "Studio"). Uses EditorCore from core.js for the file format and drawing.
// Saving writes straight into the chosen levels folder (File System Access API, Chrome and Edge);
// every change is also kept as a draft in the browser, so nothing is lost if the tab closes.
(function () {
  'use strict';
  const C = window.EditorCore;
  const $ = (id) => document.getElementById(id);
  const KEY = 'nb-editor';
  // the eraser and the paint bucket, drawn as in common paint programs
  const ICON_ERASER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.6 14.4 12.2 5.8a2 2 0 0 1 2.8 0l4.2 4.2a2 2 0 0 1 0 2.8L11.8 20.2H7.4l-3.8-3a2 2 0 0 1 0-2.8Z"/><path d="M8.2 9.8l6.2 6.2"/><path d="M11.8 20.2H21"/></svg>';
  const ICON_BUCKET = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 11.5 11 4l7.5 7.5L12 18a2.1 2.1 0 0 1-3 0L3.5 12.5Z"/><path d="M3.5 11.5h15"/><path d="M7.5 7.5 4.5 4.5"/><path class="fill" d="M20.5 14.5c-.9 1.3-1.8 2.4-1.8 3.4a1.8 1.8 0 0 0 3.6 0c0-1-.9-2.1-1.8-3.4Z"/></svg>';
  const TOOLS = [
    { id: 'pen', icon: '✎', name: 'Pen', key: 'p' },
    { id: 'erase', svg: ICON_ERASER, name: 'Eraser', key: 'e' },
    { id: 'fill', svg: ICON_BUCKET, name: 'Fill', key: 'f' },
    { id: 'rect', icon: '▭', name: 'Rectangle', key: 'r' },
    { id: 'line', icon: '╱', name: 'Line', key: 'l' },
    { id: 'move', icon: '✥', name: 'Move everything', key: 'm' },
  ];
  const HISTORY = 200;
  const hue = (y) => (y * 45 + 300) % 360; // the same row colours as the game's "row" mode

  const state = {
    levels: new Map(),   // id -> { level, saved: file text on disk or null, history, future }
    broken: [],          // files that could not be read: { name, error }
    current: null,
    tool: 'pen', type: C.NORMAL, mirror: true,
    guideV: false, guideH: false, // centre lines, independent of mirroring
    dir: null,           // FileSystemDirectoryHandle for the levels folder
    pendingDir: null,    // a remembered folder that needs permission again
    drag: null, hover: null, view: null,
    dragId: null,        // the level being dragged in the strip
  };

  // ---------- browser storage (can throw or be blocked) ----------
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* drafts are a convenience */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
    keys() { try { return Object.keys(localStorage); } catch (e) { return []; } },
  };
  const draftKey = (id) => `${KEY}.draft.${id}`;

  // the last tool, brick type, mirroring and centre lines come back next time
  const PREFS = ['tool', 'type', 'mirror', 'guideV', 'guideH'];
  function loadPrefs() {
    try {
      const p = JSON.parse(ls.get(KEY + '.prefs')) || {};
      if (TOOLS.some((t) => t.id === p.tool)) state.tool = p.tool;
      if (C.TYPES.some((t) => t.t === p.type)) state.type = p.type;
      for (const k of ['mirror', 'guideV', 'guideH']) if (typeof p[k] === 'boolean') state[k] = p[k];
    } catch (e) { /* defaults */ }
  }
  function savePrefs() {
    const p = {};
    for (const k of PREFS) p[k] = state[k];
    ls.set(KEY + '.prefs', JSON.stringify(p));
  }

  // the folder handle is remembered in IndexedDB, since localStorage cannot hold it
  function idb(mode, fn) {
    return new Promise((resolve) => {
      let req;
      try { req = indexedDB.open(KEY, 1); } catch (e) { resolve(null); return; }
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onerror = () => resolve(null);
      req.onsuccess = () => {
        try {
          const tx = req.result.transaction('kv', mode), r = fn(tx.objectStore('kv'));
          tx.oncomplete = () => resolve(r && 'result' in r ? r.result : null);
          tx.onerror = () => resolve(null);
        } catch (e) { resolve(null); }
      };
    });
  }
  const rememberDir = (h) => idb('readwrite', (s) => s.put(h, 'dir'));
  // never wait long: the editor must start even if the browser does not answer
  const recallDir = () => Promise.race([idb('readonly', (s) => s.get('dir')), new Promise((r) => setTimeout(() => r(null), 1500))]);

  // ---------- levels ----------
  const cur = () => state.levels.get(state.current);
  const text = (e) => C.toFile(e.level);
  // a level that was never saved counts as changed once it differs from an empty level
  const isDirty = (e) => text(e) !== (e.saved ?? C.toFile(C.newLevel(e.level.id)));
  const nextId = () => Math.max(0, ...state.levels.keys()) + 1;

  function addEntry(level, saved) {
    const e = { level, saved, history: [], future: [], onDisk: saved !== null };
    state.levels.set(level.id, e);
    return e;
  }
  // a draft remembers whether it edits a level that exists on disk, or is a new level
  function writeDraft(e) {
    if (isDirty(e)) ls.set(draftKey(e.level.id), JSON.stringify({ text: text(e), onDisk: e.onDisk }));
    else ls.del(draftKey(e.level.id));
  }
  function loadDrafts() {
    for (const k of ls.keys()) {
      if (!k.startsWith(KEY + '.draft.')) continue;
      try {
        const d = JSON.parse(ls.get(k)), level = C.fromFile(d.text);
        if (state.levels.has(level.id)) continue;
        addEntry(level, null).onDisk = !!d.onDisk;
      } catch (e) { ls.del(k); }
    }
  }

  const snapshot = (l) => ({ cells: l.cells.slice(), speed: l.speed, powerups: { ...l.powerups }, test: l.test });
  function restore(l, s) { l.cells = s.cells; l.speed = s.speed; l.powerups = s.powerups; l.test = s.test; }
  function pushHistory(e) {
    e.history.push(snapshot(e.level));
    if (e.history.length > HISTORY) e.history.shift();
    e.future = [];
  }
  // every edit goes through here: history, the test result no longer applies, draft, redraw
  function edit(fn) {
    const e = cur();
    pushHistory(e);
    fn(e.level);
    changed(e);
  }
  function changed(e, keepTest) {
    if (!keepTest) e.level.test = null;
    writeDraft(e);
    renderAll();
  }
  function undo() {
    const e = cur();
    if (!e.history.length) return;
    e.future.push(snapshot(e.level));
    restore(e.level, e.history.pop());
    changed(e, true);
  }
  function redo() {
    const e = cur();
    if (!e.future.length) return;
    e.history.push(snapshot(e.level));
    restore(e.level, e.future.pop());
    changed(e, true);
  }

  function select(id) { state.current = id; state.drag = null; renderAll(); }
  function newLevel(from) {
    const id = nextId();
    addEntry(from ? C.copyLevel(from, id) : C.newLevel(id), null);
    writeDraft(state.levels.get(id));
    select(id);
  }

  // ---------- folder ----------
  async function openDir(dir) {
    const found = new Map(), broken = [];
    for await (const [name, h] of dir.entries()) {
      if (h.kind !== 'file' || !/^level-\d{3}\.json$/.test(name)) continue;
      const t = await (await h.getFile()).text();
      try { const level = C.fromFile(t); found.set(level.id, { level, t }); }
      catch (err) { broken.push({ name, error: err.message }); }
    }
    // files on disk, with any newer draft from the browser on top
    const drafts = [...state.levels.values()].filter((e) => e.saved === null && isDirty(e));
    state.levels.clear();
    for (const [id, { level, t }] of found) addEntry(level, t);
    for (const d of drafts) {
      const disk = state.levels.get(d.level.id);
      if (disk && d.onDisk) { disk.level = d.level; continue; } // unsaved edits of a level on disk
      ls.del(draftKey(d.level.id));
      if (disk) d.level.id = nextId(); // a new level whose number is taken on disk gets the next free one
      d.onDisk = false;
      state.levels.set(d.level.id, d);
      writeDraft(d);
    }
    state.dir = dir; state.pendingDir = null; state.broken = broken;
    rememberDir(dir);
    if (!state.levels.has(state.current)) state.current = state.levels.size ? Math.min(...state.levels.keys()) : null;
    if (state.current === null) newLevel();
    setStatus(`Read ${found.size} levels from the folder ${dir.name}`, 'ok');
    renderAll();
  }

  async function chooseFolder() {
    try {
      if (state.pendingDir) {
        if (await state.pendingDir.requestPermission({ mode: 'readwrite' }) === 'granted') return openDir(state.pendingDir);
      }
      if (!window.showDirectoryPicker) {
        setStatus('This browser cannot save to folders. Use Chrome or Edge.', 'bad');
        return;
      }
      const dir = await window.showDirectoryPicker({ id: 'nb-levels', mode: 'readwrite' });
      if (dir.name !== 'levels') setStatus(`The folder is called "${dir.name}" – the levels belong in the project's levels folder`, 'warn');
      await openDir(dir);
    } catch (err) {
      if (err.name !== 'AbortError') setStatus('Could not open the folder: ' + err.message, 'bad');
    }
  }

  async function writeFile(name, content) {
    const fh = await state.dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(content);
    await w.close();
  }

  async function ensurePermission() {
    if (await state.dir.queryPermission({ mode: 'readwrite' }) !== 'granted'
      && await state.dir.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('no permission for the folder');
  }
  function writeIndex() {
    return writeFile('index.json', C.indexFile([...state.levels.values()].filter((x) => x.saved !== null).map((x) => x.level.id)));
  }

  // saves every level with unsaved changes, including new levels, then the index once
  async function saveAll() {
    const todo = [...state.levels.values()].filter(isDirty);
    if (!todo.length) { setStatus('Nothing to save', 'ok'); return; }
    if (!state.dir) { setStatus('Choose the levels folder first', 'warn'); return; }
    try {
      await ensurePermission();
      for (const e of todo) {
        const t = text(e);
        await writeFile(C.fileName(e.level.id), t);
        e.saved = t; e.onDisk = true;
        writeDraft(e);
      }
      await writeIndex();
      setStatus(`Saved ${todo.length} level${todo.length === 1 ? '' : 's'}`, 'ok');
    } catch (err) {
      setStatus('Could not save: ' + err.message, 'bad');
    }
    renderAll();
  }

  async function save() {
    const e = cur();
    const t = text(e), name = C.fileName(e.level.id);
    try {
      if (state.dir) {
        await ensurePermission();
        await writeFile(name, t);
        e.saved = t; e.onDisk = true;
        await writeIndex();
        setStatus(`Saved ${name}`, 'ok');
      } else { // no folder access: download the file instead
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([t], { type: 'application/json' }));
        a.download = name;
        a.click();
        URL.revokeObjectURL(a.href);
        e.saved = t;
        setStatus(`${name} was downloaded – put it in the levels folder`, 'warn');
      }
      writeDraft(e);
      renderAll();
    } catch (err) {
      setStatus('Could not save: ' + err.message, 'bad');
    }
  }

  // ---------- play test ----------
  // The real game in an iPhone 15-sized frame, playing the level as it is in the editor (saved or not).
  // Opened from disk, the editor cannot load the game's modules, so it uses the published game instead;
  // served over http (the published editor, or a local server) it uses the game next to it.
  const LIVE_GAME = 'https://mightynicko.github.io/neon-breaker/';
  function gameUrl() { return location.protocol === 'file:' ? LIVE_GAME : new URL('../', location.href).href; }
  function playTest() {
    const e = cur();
    if (!e) return;
    if (!C.stats(e.level.cells).total) { setStatus('Draw some bricks first', 'warn'); return; }
    const P = C.IPHONE_15, frame = $('playtest-frame'), dlg = $('playtest');
    frame.width = P.w; frame.height = P.h;
    // a new query each time, so the frame loads again even when only the level (the hash) has changed
    frame.src = `${gameUrl()}?test=${Date.now()}#level=${encodeURIComponent(text(e))}`;
    $('playtest-title').textContent = `Level ${e.level.id}`;
    $('playtest-where').textContent = location.protocol === 'file:' ? 'published game' : 'local game';
    state.playStatus = null;
    renderPlayInfo();
    if (!dlg.open) dlg.showModal();
    fitPlaytest();
    frame.focus();
  }
  function fitPlaytest() { // the phone keeps its size in points; the frame is scaled to fit the window
    const P = C.IPHONE_15, box = $('playtest-screen'), dlg = $('playtest');
    const h = window.innerHeight - 40 - 24 - 46;
    const scale = Math.min(1.25, h / P.h);
    box.style.width = `${Math.floor(P.w * scale)}px`;
    box.style.height = `${Math.floor(P.h * scale)}px`;
    $('playtest-frame').style.transform = `scale(${scale})`;
    dlg.style.height = 'auto';
  }
  // The game in the frame reports what is left a few times a second (see main.js).
  function onPlayMessage(ev) {
    if (ev.source !== $('playtest-frame').contentWindow || !ev.data || typeof ev.data.neonBreakerTest !== 'object') return;
    state.playStatus = ev.data.neonBreakerTest;
    renderPlayInfo();
  }
  function renderPlayInfo() {
    const box = $('playtest-info'), s = state.playStatus;
    box.replaceChildren();
    const head = (txt) => { const d = document.createElement('div'); d.className = 'h'; d.textContent = txt; box.append(d); };
    const row = (name, value, zero) => {
      const d = document.createElement('div'); d.className = 'row-n' + (zero ? ' zero' : '');
      const a = document.createElement('span'); a.textContent = name;
      const b = document.createElement('b'); b.textContent = value;
      d.append(a, b); box.append(d);
    };
    const note = (txt) => { const p = document.createElement('div'); p.className = 'note'; p.textContent = txt; box.append(p); };
    if (!s) {
      head('Left on the board');
      note(location.protocol === 'file:'
        ? 'Waiting for the game… The published game only reports this once the latest version is pushed.'
        : 'Waiting for the game…');
      return;
    }
    head('Bricks left to break');
    const b = s.bricks;
    row('Normal', b.normal, !b.normal);
    row('2 hits', b.cracked ? `${b.twoHit} (${b.cracked} hit once)` : b.twoHit, !b.twoHit);
    row('Bomb', b.bomb, !b.bomb);
    row('Total', s.remaining, !s.remaining);
    row('Unbreakable', b.solid, !b.solid);
    head('Power-ups left to find');
    const keys = Object.keys(s.powerups);
    if (!keys.length) note('This level has no power-ups.');
    for (const key of keys) {
      const p = s.powerups[key], name = (C.POWERUPS.find((x) => x.key === key) || { name: key }).name;
      if (!p.built) { row(name, `${p.total} · not in the game yet`, true); continue; }
      row(name, `${p.hidden} of ${p.total}${p.falling ? ` · ${p.falling} falling` : ''}`, !p.hidden && !p.falling);
    }
    head('Now');
    row('Balls', s.balls, !s.balls);
    if (s.wideLeft) row('Wider paddle', `${s.wideLeft} s left`);
    row('Seed', s.seed);
  }

  function closePlaytest() {
    $('playtest').close();
  }

  // ---------- order: drag and drop, delete ----------
  // Gives the levels in `order` the numbers 1, 2, 3 ... and renames their files to match. A level's number is its
  // place in the game, so moving level 6 to place 1 moves levels 1-5 one step on. `removed` levels lose their files.
  async function renumber(order, removed = []) {
    if (state.pendingDir) { setStatus(`Open the folder ${state.pendingDir.name} first`, 'warn'); return false; }
    if (state.broken.length) { setStatus('Fix or remove the unreadable files first (red in the strip)', 'bad'); return false; }
    const all = order.concat(removed);
    const oldFiles = new Set(all.filter((e) => e.saved !== null).map((e) => C.fileName(e.level.id)));
    for (const e of all) ls.del(draftKey(e.level.id));
    const renamed = [];
    order.forEach((e, i) => {
      if (e.level.id === i + 1) return;
      e.level.id = i + 1;
      if (e.saved !== null) { const s = C.fromFile(e.saved); s.id = i + 1; e.saved = C.toFile(s); }
      renamed.push(e);
    });
    state.levels = new Map(order.map((e) => [e.level.id, e]));
    for (const e of order) writeDraft(e);
    if (state.dir) {
      try {
        await ensurePermission();
        for (const e of renamed) if (e.saved !== null) await writeFile(C.fileName(e.level.id), e.saved);
        const newFiles = new Set(order.filter((e) => e.saved !== null).map((e) => C.fileName(e.level.id)));
        for (const n of oldFiles) if (!newFiles.has(n)) await state.dir.removeEntry(n);
        await writeIndex();
      } catch (err) {
        setStatus('Could not update the files: ' + err.message, 'bad');
        return false;
      }
    }
    return true;
  }
  const sorted = () => [...state.levels.values()].sort((a, b) => a.level.id - b.level.id);

  async function moveLevel(fromId, toId) {
    const order = sorted(), from = order.findIndex((e) => e.level.id === fromId), to = order.findIndex((e) => e.level.id === toId);
    if (from < 0 || to < 0 || from === to) return;
    const moving = state.levels.get(fromId), shown = cur();
    order.splice(to, 0, order.splice(from, 1)[0]);
    if (await renumber(order)) setStatus(`Moved level ${fromId} to place ${moving.level.id}`, 'ok');
    state.current = shown.level.id;
    renderAll();
  }

  function ask(title, body, yes) {
    const dlg = $('confirm');
    $('confirm-title').textContent = title; $('confirm-text').textContent = body; $('confirm-yes').textContent = yes;
    return new Promise((resolve) => {
      const done = (v) => { dlg.close(); $('confirm-yes').onclick = $('confirm-no').onclick = dlg.oncancel = null; resolve(v); };
      $('confirm-yes').onclick = () => done(true);
      $('confirm-no').onclick = () => done(false);
      dlg.oncancel = () => done(false);
      dlg.showModal();
      $('confirm-no').focus();
    });
  }

  async function deleteLevel() {
    const e = cur(), id = e.level.id, later = state.levels.size - id;
    const body = (state.dir && e.saved !== null ? `This deletes ${C.fileName(id)} from the folder ${state.dir.name}. ` : '')
      + (later > 0 ? `Levels ${id + 1}–${id + later} move down one number. ` : '') + 'This cannot be undone.';
    if (!await ask(`Delete level ${id}?`, body, `Delete level ${id}`)) return;
    const order = sorted().filter((x) => x !== e);
    if (!await renumber(order, [e])) return;
    setStatus(`Deleted level ${id}`, 'ok');
    if (!state.levels.size) { newLevel(); return; }
    select(Math.min(id, state.levels.size));
  }

  // ---------- drawing a brick ----------
  // A brick exactly b x b at (x, y). Types: 1 normal, 2 two hits (double edge), 3 unbreakable (striped), 4 bomb (5 hits).
  function brick(g, x, y, b, t, h, glow) {
    const lw = Math.max(1, Math.round(b * 0.075));
    g.save();
    if (t === C.NORMAL || t === C.TWO_HIT) {
      g.strokeStyle = `hsl(${h},100%,${t === C.TWO_HIT ? 72 : 66}%)`; g.lineWidth = lw;
      if (glow) { g.shadowColor = `hsl(${h},100%,60%)`; g.shadowBlur = b * 0.4; }
      g.strokeRect(x + lw / 2, y + lw / 2, b - lw, b - lw);
      g.shadowBlur = 0;
      g.fillStyle = `hsla(${h},100%,60%,.18)`; g.fillRect(x + lw, y + lw, b - 2 * lw, b - 2 * lw);
      if (t === C.TWO_HIT) {
        const d = lw * 2.5;
        if (b - 2 * d > lw * 2) g.strokeRect(x + d + lw / 2, y + d + lw / 2, b - 2 * d - lw, b - 2 * d - lw);
      }
    } else if (t === C.SOLID) {
      g.fillStyle = '#1c1e29'; g.fillRect(x, y, b, b);
      g.beginPath(); g.rect(x, y, b, b); g.clip();
      g.strokeStyle = '#353a4f'; g.lineWidth = Math.max(1, b * 0.06);
      const step = Math.max(3, b * 0.2);
      g.beginPath();
      for (let k = -b; k < b; k += step) { g.moveTo(x + k, y + b); g.lineTo(x + k + b, y); }
      g.stroke();
      g.strokeStyle = '#9aa0b8'; g.lineWidth = lw; g.strokeRect(x + lw / 2, y + lw / 2, b - lw, b - lw);
    } else if (t === C.BOMB) {
      if (glow) { g.shadowColor = 'rgba(255,90,60,.9)'; g.shadowBlur = b * 0.45; }
      g.strokeStyle = '#ff6a3c'; g.lineWidth = lw; g.strokeRect(x + lw / 2, y + lw / 2, b - lw, b - lw);
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(255,90,60,.35)'; g.fillRect(x + lw, y + lw, b - 2 * lw, b - 2 * lw);
      if (b >= 9) {
        g.fillStyle = '#ffd9a0'; g.font = `800 ${Math.round(b * 0.58)}px -apple-system, system-ui, sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('5', x + b / 2, y + b / 2 + b * 0.04);
      }
    }
    g.restore();
  }

  function fitCanvas(canvas, w, h) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return g;
  }

  // ---------- grid ----------
  // the cells to show: during a rectangle, line or move drag, a preview of the result
  function shownCells() {
    const e = cur(), d = state.drag;
    if (!d || !d.cur) return e.level.cells;
    const [x0, y0] = d.start, [x1, y1] = d.cur;
    if (d.tool === 'rect') return C.paint(d.base, C.withMirror(C.rect(x0, y0, x1, y1), state.mirror), d.paintType);
    if (d.tool === 'line') return C.paint(d.base, C.withMirror(C.line(x0, y0, x1, y1), state.mirror), d.paintType);
    if (d.tool === 'move') return C.shift(d.base, x1 - x0, y1 - y0);
    return e.level.cells;
  }

  function drawGrid() {
    if (state.current === null) return;
    const wrap = $('grid-wrap'), w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) return;
    const g = fitCanvas($('grid'), w, h);
    const cs = Math.max(8, Math.floor(Math.min((w - 40) / C.COLS, (h - 40) / C.ROWS)));
    const ox = Math.round((w - cs * C.COLS) / 2), oy = Math.round((h - cs * C.ROWS) / 2);
    state.view = { cs, ox, oy };
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(10,6,20,.55)'; g.fillRect(ox, oy, cs * C.COLS, cs * C.ROWS);
    g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 1;
    g.beginPath();
    for (let x = 0; x <= C.COLS; x++) { g.moveTo(ox + x * cs + 0.5, oy); g.lineTo(ox + x * cs + 0.5, oy + cs * C.ROWS); }
    for (let y = 0; y <= C.ROWS; y++) { g.moveTo(ox, oy + y * cs + 0.5); g.lineTo(ox + cs * C.COLS, oy + y * cs + 0.5); }
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,.28)'; g.font = '10px system-ui, sans-serif'; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let y = 0; y < C.ROWS; y++) if ((y + 1) % 5 === 0 || y === C.ROWS - 1) g.fillText(y + 1, ox - 6, oy + y * cs + cs / 2);

    const cells = shownCells(), inset = Math.max(1, Math.round(cs * 0.045));
    for (let y = 0; y < C.ROWS; y++) for (let x = 0; x < C.COLS; x++) {
      const t = cells[C.idx(x, y)];
      if (t) brick(g, ox + x * cs + inset, oy + y * cs + inset, cs - 2 * inset, t, hue(y), true);
    }
    // centre lines: the vertical one also shows while mirroring, since that is the mirror axis
    g.save(); g.setLineDash([4, 5]); g.strokeStyle = 'rgba(95,255,255,.55)'; g.lineWidth = 1;
    g.beginPath();
    if (state.mirror || state.guideV) { g.moveTo(ox + cs * C.COLS / 2, oy - 8); g.lineTo(ox + cs * C.COLS / 2, oy + cs * C.ROWS + 8); }
    if (state.guideH) { g.moveTo(ox - 8, oy + cs * C.ROWS / 2); g.lineTo(ox + cs * C.COLS + 8, oy + cs * C.ROWS / 2); }
    g.stroke();
    g.restore();
    if (state.hover && !state.drag && state.tool !== 'move') {
      const [hx, hy] = state.hover;
      g.strokeStyle = '#5ff'; g.lineWidth = 2;
      for (const [x, y] of C.withMirror([[hx, hy]], state.mirror)) g.strokeRect(ox + x * cs + 1, oy + y * cs + 1, cs - 2, cs - 2);
    }
  }

  function cellAt(ev) {
    const v = state.view;
    if (!v) return null;
    const r = $('grid').getBoundingClientRect();
    const x = Math.floor((ev.clientX - r.left - v.ox) / v.cs), y = Math.floor((ev.clientY - r.top - v.oy) / v.cs);
    return C.inside(x, y) ? [x, y] : null;
  }
  function clampCell(ev) { // for drags that leave the grid
    const v = state.view, r = $('grid').getBoundingClientRect();
    const x = Math.floor((ev.clientX - r.left - v.ox) / v.cs), y = Math.floor((ev.clientY - r.top - v.oy) / v.cs);
    return [Math.max(0, Math.min(C.COLS - 1, x)), Math.max(0, Math.min(C.ROWS - 1, y))];
  }

  function onGridDown(ev) {
    const at = cellAt(ev);
    if (!at || (ev.button !== 0 && ev.button !== 2)) return;
    ev.preventDefault();
    try { $('grid').setPointerCapture(ev.pointerId); } catch (e) { /* the pointer is already gone */ }
    const e = cur(), erase = state.tool === 'erase' || ev.button === 2;
    const paintType = erase ? C.EMPTY : state.type;
    const tool = ev.button === 2 && state.tool !== 'erase' ? 'pen' : state.tool; // right button erases with the pen
    state.drag = { tool, start: at, last: at, cur: null, base: e.level.cells.slice(), paintType };
    if (tool === 'pen' || tool === 'erase') {
      pushHistory(e);
      e.level.cells = C.paint(e.level.cells, C.withMirror([at], state.mirror), paintType);
      drawGrid(); drawPhone();
    } else if (tool === 'fill') {
      const pts = C.fillArea(e.level.cells, at[0], at[1]);
      const mirrored = state.mirror ? C.fillArea(e.level.cells, C.COLS - 1 - at[0], at[1]) : [];
      state.drag = null;
      edit((l) => { l.cells = C.paint(l.cells, pts.concat(mirrored), paintType); });
    } else {
      state.drag.cur = at;
      drawGrid();
    }
  }
  function onGridMove(ev) {
    const d = state.drag;
    if (!d) {
      const at = cellAt(ev);
      if (String(at) !== String(state.hover)) { state.hover = at; drawGrid(); }
      return;
    }
    const at = clampCell(ev);
    if (d.tool === 'pen' || d.tool === 'erase') {
      if (String(at) === String(d.last)) return;
      const e = cur();
      e.level.cells = C.paint(e.level.cells, C.withMirror(C.line(d.last[0], d.last[1], at[0], at[1]), state.mirror), d.paintType);
      d.last = at;
      drawGrid(); drawPhone();
    } else if (String(at) !== String(d.cur)) {
      d.cur = at;
      drawGrid(); drawPhone();
    }
  }
  function onGridUp() {
    const d = state.drag;
    if (!d) return;
    const e = cur();
    if (d.tool === 'pen' || d.tool === 'erase') {
      state.drag = null;
      if (e.level.cells.join() === d.base.join()) e.history.pop(); // a click that changed nothing
      else changed(e);
      renderAll();
      return;
    }
    const result = shownCells();
    state.drag = null;
    if (result.join() !== e.level.cells.join()) edit((l) => { l.cells = result; });
    else renderAll();
  }

  // ---------- phone preview: the level as the game lays it out on an iPhone 15 ----------
  function drawPhone() {
    if (state.current === null) return;
    const wrap = $('phone-wrap'), P = C.IPHONE_15, G = C.GAME;
    // the frame sits outside the screen, so nothing on the screen is covered
    const bezel = Math.max(5, Math.round(wrap.clientWidth * 0.03));
    const w = Math.floor(Math.min(wrap.clientWidth - 2 * bezel, (wrap.clientHeight - 2 * bezel) * P.w / P.h));
    if (w < 40) return;
    const h = Math.round(w * P.h / P.w), outer = fitCanvas($('phone'), w + 2 * bezel, h + 2 * bezel);
    const r = w * 0.14;
    outer.fillStyle = '#241e33'; outer.beginPath(); outer.roundRect(0, 0, w + 2 * bezel, h + 2 * bezel, r + bezel); outer.fill();
    outer.translate(bezel, bezel);
    const g = outer;
    const cells = shownCells(), L = C.gameLayout(P);
    const u = L.s * w / P.w, X = (x) => (x + L.offX) * u, Y = (y) => (y + L.offY) * u;
    g.save();
    g.beginPath(); g.roundRect(0, 0, w, h, r); g.clip();
    g.fillStyle = '#0a0614'; g.fillRect(0, 0, w, h);
    const rg = g.createRadialGradient(w / 2, h * 0.42, 2, w / 2, h * 0.42, h * 0.38);
    rg.addColorStop(0, 'rgba(60,24,110,.5)'); rg.addColorStop(1, 'rgba(60,24,110,0)');
    g.fillStyle = rg; g.fillRect(0, 0, w, h);
    // bricks across the whole width, as in the game
    const span = P.w / L.s, gap = (span - C.COLS * G.BR) / (C.COLS - 1), b = G.BR * u;
    for (let y = 0; y < C.ROWS; y++) for (let x = 0; x < C.COLS; x++) {
      const t = cells[C.idx(x, y)];
      if (!t) continue;
      brick(g, X(-L.offX + x * (G.BR + gap)), Y(L.gy + (G.CELL - G.BR) / 2 + y * G.CELL), b, t, hue(y), true);
    }
    // ceiling, HUD, touch zone, paddle and ball
    g.save(); g.setLineDash([3, 4]); g.strokeStyle = 'rgba(255,90,120,.55)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, Y(L.ceiling)); g.lineTo(w, Y(L.ceiling)); g.stroke(); g.restore();
    g.fillStyle = 'rgba(255,90,120,.75)'; g.font = `${Math.max(8, 8 * u)}px system-ui, sans-serif`; g.textAlign = 'right'; g.textBaseline = 'bottom';
    g.fillText('ceiling', w - 6, Y(L.ceiling) - 2);
    g.fillStyle = 'rgba(255,255,255,.85)'; g.font = `500 ${11 * u}px system-ui, sans-serif`; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(`LEVEL ${cur().level.id}`, X(14), Y(L.safeTop + 24));
    for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(X(G.W / 2 - 12 + i * 12), Y(L.safeTop + 24), 2.6 * u, 0, 7); g.fill(); }
    g.save(); g.setLineDash([2 * u, 5 * u]); g.strokeStyle = 'rgba(255,255,255,.14)';
    g.beginPath(); g.roundRect(X(8), Y(L.paddleY - 44), (G.W - 16) * u, Math.max(60, L.H - L.paddleY + 36 - L.safeBottom) * u, 18 * u); g.stroke(); g.restore();
    g.shadowColor = '#e040ff'; g.shadowBlur = 10 * u; g.strokeStyle = '#fff'; g.lineWidth = 1.6 * u;
    g.beginPath(); g.roundRect(X(G.W / 2 - 32), Y(L.paddleY), 64 * u, 6 * u, 3 * u); g.stroke();
    g.shadowColor = '#ff7bff'; g.fillStyle = '#fff';
    g.beginPath(); g.arc(X(G.W / 2), Y(L.paddleY - 5), 4 * u, 0, 7); g.fill();
    g.shadowBlur = 0;
    // dynamic island and home indicator
    g.fillStyle = '#000'; g.beginPath(); g.roundRect(w / 2 - w * 0.16, h * 0.013, w * 0.32, h * 0.042, h * 0.021); g.fill();
    g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.roundRect(w / 2 - w * 0.17, h - h * 0.015, w * 0.34, Math.max(2, h * 0.006), 2); g.fill();
    g.restore();
  }

  // ---------- strip of levels ----------
  function thumb(level) {
    const c = document.createElement('canvas'), s = 3;
    c.width = C.COLS * s; c.height = C.ROWS * s;
    const g = c.getContext('2d');
    for (let y = 0; y < C.ROWS; y++) for (let x = 0; x < C.COLS; x++) {
      const t = level.cells[C.idx(x, y)];
      if (!t) continue;
      g.fillStyle = t === C.SOLID ? '#8a90a8' : t === C.BOMB ? '#ff6a3c' : `hsl(${hue(y)},100%,${t === C.TWO_HIT ? 75 : 62}%)`;
      g.fillRect(x * s, y * s, s - 1, s - 1);
    }
    return c;
  }
  function renderStrip() {
    const strip = $('strip');
    strip.replaceChildren();
    for (const id of [...state.levels.keys()].sort((a, b) => a - b)) {
      const e = state.levels.get(id), d = document.createElement('div');
      d.className = 'thumb' + (id === state.current ? ' on' : '') + (isDirty(e) ? ' dirty' : '');
      d.title = (isDirty(e) ? 'Unsaved changes' : C.fileName(id)) + ' · drag to change the order';
      d.append(thumb(e.level), document.createTextNode(`Level ${id}`));
      d.addEventListener('click', () => select(id));
      // drag and drop: dropping on a level puts the dragged level in its place
      d.draggable = true;
      d.addEventListener('dragstart', (ev) => { state.dragId = id; d.classList.add('dragging'); ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', String(id)); });
      d.addEventListener('dragend', () => { state.dragId = null; renderStrip(); });
      d.addEventListener('dragover', (ev) => {
        if (state.dragId === null || state.dragId === id) return;
        ev.preventDefault();
        d.classList.toggle('drop-before', state.dragId > id);
        d.classList.toggle('drop-after', state.dragId < id);
      });
      d.addEventListener('dragleave', () => d.classList.remove('drop-before', 'drop-after'));
      d.addEventListener('drop', (ev) => { ev.preventDefault(); const from = state.dragId; state.dragId = null; moveLevel(from, id); });
      strip.append(d);
    }
    for (const b of state.broken) {
      const d = document.createElement('div');
      d.className = 'thumb broken'; d.title = b.error; d.textContent = b.name;
      strip.append(d);
    }
    const add = document.createElement('div');
    add.className = 'thumb add'; add.title = 'New level'; add.textContent = '+';
    add.addEventListener('click', () => newLevel());
    strip.append(add);
  }

  // ---------- panel ----------
  function buildPanel() {
    const box = $('powerups');
    for (const pu of C.POWERUPS) {
      const row = document.createElement('div');
      row.className = 'pu'; row.dataset.key = pu.key;
      const name = document.createElement('span'); name.className = 'name'; name.textContent = pu.name;
      if (pu.negative) { const n = document.createElement('span'); n.className = 'neg'; n.textContent = 'negative'; name.append(n); }
      const step = document.createElement('div'); step.className = 'step';
      const minus = document.createElement('button'); minus.type = 'button'; minus.textContent = '−'; minus.title = 'Fewer';
      const count = document.createElement('b');
      const plus = document.createElement('button'); plus.type = 'button'; plus.textContent = '+'; plus.title = 'More';
      minus.addEventListener('click', () => { if (cur().level.powerups[pu.key] > 0) edit((l) => { l.powerups[pu.key]--; }); });
      plus.addEventListener('click', () => { if (cur().level.powerups[pu.key] < 99) edit((l) => { l.powerups[pu.key]++; }); });
      step.append(minus, count, plus);
      row.append(name, step);
      box.append(row);
    }
    $('f-speed').addEventListener('change', (ev) => {
      const v = Number(ev.target.value);
      if (v !== cur().level.speed) edit((l) => { l.speed = v; });
    });
  }

  // the named speeds, plus the level's own value when it is not one of them (the five original levels)
  function renderSpeed(speed) {
    const list = C.SPEED_PRESETS.map((p) => [p.v, `${p.name} (${p.v})`]);
    if (!C.SPEED_PRESETS.some((p) => p.v === speed)) list.push([speed, `Custom (${speed})`]);
    list.sort((a, b) => a[0] - b[0]);
    $('f-speed').replaceChildren(...list.map(([v, label]) => {
      const o = document.createElement('option'); o.value = v; o.textContent = label; o.selected = v === speed; return o;
    }));
  }

  function renderPanel() {
    const l = cur().level, st = C.stats(l.cells);
    for (const row of $('powerups').children) {
      const n = l.powerups[row.dataset.key];
      row.querySelector('b').textContent = n;
      row.classList.toggle('zero', n === 0);
    }
    $('f-id').textContent = l.id;
    $('f-zone').textContent = C.zoneOf(l.id);
    renderSpeed(l.speed);

    const pus = Object.values(l.powerups).reduce((a, b) => a + b, 0);
    const rows = [['Bricks', st.total], ['Normal', st.normal], ['2 hits', st.twoHit], ['Unbreakable', st.solid], ['Bombs', st.bomb],
      ['Rows', C.usedRows(l.cells)], ['Power-ups', pus], ['Bricks that can carry them', st.carriers]];
    $('stats').replaceChildren(...rows.flatMap(([k, v]) => {
      const a = document.createElement('span'); a.textContent = k;
      const b = document.createElement('b'); b.textContent = v;
      return [a, b];
    }));

    // filled in by Claude after testing; the editor only shows it
    const box = $('test'), t = l.test, msg = (cls, s) => { const d = document.createElement('div'); d.className = 'msg ' + cls; d.textContent = s; return d; };
    if (!t) box.replaceChildren(msg('info', 'Not tested yet. Claude fills in the difficulty and checks after testing the level.'));
    else {
      const out = [];
      if (Number.isInteger(t.difficulty)) out.push(msg('info', 'Difficulty ' + '●'.repeat(t.difficulty) + '○'.repeat(Math.max(0, 5 - t.difficulty))));
      if (typeof t.playable === 'boolean') out.push(msg(t.playable ? 'ok' : 'warn', t.playable ? 'Can be cleared' : 'Cannot be cleared'));
      const bot = t.bot && typeof t.bot === 'object' ? t.bot : null, time = (s) => (s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`);
      if (bot && bot.cleared > 0 && Number.isInteger(bot.fastestSeconds)) {
        out.push(msg('info', `Bot cleared it ${bot.cleared} of ${bot.runs} times`));
        out.push(msg('info', `Fastest ${time(bot.fastestSeconds)} · average ${time(bot.averageSeconds)} · slowest ${time(bot.slowestSeconds)}`));
      }
      for (const n of Array.isArray(t.notes) ? t.notes : []) if (!/^Bot: /.test(n)) out.push(msg('warn', String(n)));
      if (t.date) out.push(msg('info', 'Tested ' + t.date));
      box.replaceChildren(...out);
    }
  }

  function renderToolbar() {
    for (const b of $('tools').children) b.classList.toggle('on', b.dataset.tool === state.tool);
    for (const b of $('types').children) b.classList.toggle('on', Number(b.dataset.type) === state.type && state.tool !== 'erase');
    $('btn-mirror').classList.toggle('on', state.mirror);
    $('btn-guide-v').classList.toggle('on', state.guideV);
    $('btn-guide-h').classList.toggle('on', state.guideH);
    savePrefs();
    const e = cur();
    $('btn-undo').disabled = !e.history.length;
    $('btn-redo').disabled = !e.future.length;
  }
  function buildToolbar() {
    for (const t of TOOLS) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn icon'; b.dataset.tool = t.id; b.title = `${t.name} (${t.key.toUpperCase()})`;
      if (t.svg) b.innerHTML = t.svg; else b.textContent = t.icon; // the SVGs are fixed strings in this file
      b.addEventListener('click', () => { state.tool = t.id; renderToolbar(); });
      $('tools').append(b);
    }
    for (const ty of C.TYPES) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn'; b.dataset.type = ty.t; b.title = `${ty.name} (${ty.key})`;
      const sw = document.createElement('canvas'); sw.className = 'type-swatch';
      brick(fitCanvas(sw, 18, 18), 0, 0, 18, ty.t, 30, false);
      b.append(sw, document.createTextNode(ty.name.split(' ·')[0]));
      b.addEventListener('click', () => { state.type = ty.t; if (state.tool === 'erase') state.tool = 'pen'; renderToolbar(); });
      $('types').append(b);
    }
  }

  let statusTimer = 0;
  function setStatus(s, kind) {
    const el = $('status');
    el.textContent = s; el.className = 'status ' + (kind || '');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { statusTimer = 0; renderStatus(); }, 5000);
  }
  function renderStatus() {
    const dirty = [...state.levels.values()].filter(isDirty).length, el = $('status');
    if (!state.dir) { el.textContent = dirty ? `${dirty} levels only in the browser` : 'No levels folder chosen'; el.className = 'status warn'; }
    else if (dirty) { el.textContent = `${dirty} unsaved (kept in the browser)`; el.className = 'status warn'; }
    else { el.textContent = 'All saved'; el.className = 'status ok'; }
  }

  function renderAll() {
    if (state.current === null) return;
    const e = cur();
    $('where').textContent = state.dir ? `${state.dir.name}/${C.fileName(e.level.id)}` : C.fileName(e.level.id);
    $('btn-folder').textContent = state.pendingDir ? `Open ${state.pendingDir.name} again` : state.dir ? 'Change levels folder' : 'Choose levels folder';
    $('btn-save-all').disabled = ![...state.levels.values()].some(isDirty);
    renderStrip(); renderToolbar(); renderPanel(); drawGrid(); drawPhone();
    if (!statusTimer) renderStatus();
  }

  // ---------- splitters (widths are remembered) ----------
  // The phone column is kept as a share of the window width, so it grows and shrinks with the window.
  let applyWidths = () => {};
  function setupSplitters() {
    const root = document.documentElement, body = $('body');
    let widths = { phoneShare: 0.2, panel: 300 };
    try {
      const saved = JSON.parse(ls.get(KEY + '.widths')) || {};
      if (saved.phoneShare) widths.phoneShare = saved.phoneShare;
      if (saved.panel) widths.panel = saved.panel;
    } catch (e) { /* defaults */ }
    const px = () => widths.phoneShare * body.clientWidth;
    const apply = () => {
      const total = body.clientWidth;
      widths.panel = Math.max(280, Math.min(520, widths.panel));
      const phone = Math.max(160, Math.min(total - widths.panel - 340, px()));
      if (total) widths.phoneShare = phone / total;
      root.style.setProperty('--phone-w', Math.round(phone) + 'px');
      root.style.setProperty('--panel-w', widths.panel + 'px');
    };
    applyWidths = apply;
    apply();
    for (const [id, move] of [
      ['split-1', (w, dx) => { widths.phoneShare = (w.phone - dx) / body.clientWidth; }],        // grid | phone
      ['split-2', (w, dx) => { widths.phoneShare = (w.phone + dx) / body.clientWidth; widths.panel = w.panel - dx; }], // phone | panel
    ]) {
      const el = $(id);
      el.addEventListener('pointerdown', (ev) => {
        el.setPointerCapture(ev.pointerId); el.classList.add('drag');
        const start = { phone: px(), panel: widths.panel }, x0 = ev.clientX;
        const mv = (e2) => { move(start, e2.clientX - x0); apply(); };
        const up = () => {
          el.classList.remove('drag');
          el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up);
          ls.set(KEY + '.widths', JSON.stringify(widths));
        };
        el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up);
      });
    }
  }

  // ---------- keys ----------
  function onKey(ev) {
    const mod = ev.ctrlKey || ev.metaKey, k = ev.key.toLowerCase();
    if (mod && k === 's') { ev.preventDefault(); if (ev.shiftKey) saveAll(); else save(); return; }
    if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLSelectElement || $('confirm').open) return;
    if (mod && k === 'z' && !ev.shiftKey) { ev.preventDefault(); undo(); return; }
    if (mod && (k === 'y' || (k === 'z' && ev.shiftKey))) { ev.preventDefault(); redo(); return; }
    if (mod || ev.altKey) return;
    if ($('playtest').open) { if (k === 'r') playTest(); return; }
    const ty = C.TYPES.find((t) => t.key === k);
    if (ty) { state.type = ty.t; if (state.tool === 'erase') state.tool = 'pen'; renderToolbar(); return; }
    if (k === '0') { state.tool = 'erase'; renderToolbar(); return; }
    const tool = TOOLS.find((t) => t.key === k);
    if (tool) { state.tool = tool.id; renderToolbar(); return; }
    if (k === 's') { state.mirror = !state.mirror; renderToolbar(); drawGrid(); return; }
    if (k === 'v' || k === 'h') { const g = k === 'v' ? 'guideV' : 'guideH'; state[g] = !state[g]; renderToolbar(); drawGrid(); }
  }

  // ---------- start ----------
  async function init() {
    loadPrefs();
    buildToolbar();
    buildPanel();
    setupSplitters();
    const grid = $('grid');
    grid.addEventListener('pointerdown', onGridDown);
    grid.addEventListener('pointermove', onGridMove);
    grid.addEventListener('pointerup', onGridUp);
    grid.addEventListener('pointercancel', onGridUp);
    grid.addEventListener('pointerleave', () => { if (!state.drag && state.hover) { state.hover = null; drawGrid(); } });
    grid.addEventListener('contextmenu', (ev) => ev.preventDefault());
    $('btn-folder').addEventListener('click', chooseFolder);
    $('btn-save').addEventListener('click', save);
    $('btn-save-all').addEventListener('click', saveAll);
    $('btn-copy').addEventListener('click', () => newLevel(cur().level));
    $('btn-delete').addEventListener('click', deleteLevel);
    $('btn-play').addEventListener('click', playTest);
    $('playtest-restart').addEventListener('click', playTest);
    $('playtest-close').addEventListener('click', closePlaytest);
    $('playtest').addEventListener('close', () => { $('playtest-frame').src = 'about:blank'; }); // stops the game and its music
    window.addEventListener('resize', () => { if ($('playtest').open) fitPlaytest(); });
    window.addEventListener('message', onPlayMessage);
    $('btn-mirror').addEventListener('click', () => { state.mirror = !state.mirror; renderToolbar(); drawGrid(); });
    $('btn-guide-v').addEventListener('click', () => { state.guideV = !state.guideV; renderToolbar(); drawGrid(); });
    $('btn-guide-h').addEventListener('click', () => { state.guideH = !state.guideH; renderToolbar(); drawGrid(); });
    $('btn-undo').addEventListener('click', undo);
    $('btn-redo').addEventListener('click', redo);
    $('btn-clear').addEventListener('click', () => {
      const l = cur().level;
      if (!C.stats(l.cells).total && !Object.values(l.powerups).some(Boolean)) return;
      edit((lv) => { lv.cells = C.newLevel(lv.id).cells; lv.powerups = C.newLevel(lv.id).powerups; });
      setStatus('Level cleared – Ctrl+Z undoes it', 'ok');
    });
    document.addEventListener('keydown', onKey);
    new ResizeObserver(() => { applyWidths(); drawGrid(); drawPhone(); }).observe($('body'));
    new ResizeObserver(() => drawPhone()).observe($('phone-wrap'));

    loadDrafts();
    const dir = await recallDir();
    if (dir) {
      let perm = 'denied';
      try { perm = await dir.queryPermission({ mode: 'readwrite' }); } catch (e) { /* not supported */ }
      if (perm === 'granted') { await openDir(dir); return; }
      state.pendingDir = dir;
    }
    state.current = state.levels.size ? Math.min(...state.levels.keys()) : null;
    if (state.current === null) newLevel(); else renderAll();
    setStatus(state.pendingDir ? `Click "Open ${state.pendingDir.name} again" to read the levels` : 'Choose the project\'s levels folder to read and save the levels', 'warn');
  }

  window.editor = { state, openDir, moveLevel, saveAll }; // for tests in the browser
  init();
})();
