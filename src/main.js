import { LEVELS, loadLevels, parseLevel, setLevels } from './game/levels.js';
import { Game, PerfMeter } from './game/game.js';
import { Title } from './title/title.js';
import { buildMap } from './map/map.js';
import { TOTAL_LEVELS } from './data/zones.js';
import { showModal, hideModal } from './ui/modal.js';
import { t, setLang, getLang, LANGS, DEFAULT_LANG, langName as dictName } from './core/i18n.js';
import * as storage from './core/storage.js';
import * as cores from './core/cores.js';
import { coreSvg } from './ui/core-icon.js';
import { adProvider } from './core/ads.js';
import * as audio from './core/audio.js';
import { VERSION } from './version.js';

const $ = (id) => document.getElementById(id);
// Test play from the editor: index.html?test#level=<the level file>. Only that level is played, over and over,
// without Cores, progress, title or map.
let testLevel = null;
if (new URLSearchParams(location.search).has('test') && location.hash.startsWith('#level=')) {
  try { testLevel = parseLevel(decodeURIComponent(location.hash.slice(7))); } catch (e) { testLevel = null; }
}
// The levels come from levels/*.json. Without them the game still starts, and the map says why nothing is playable.
let levelsFailed = false;
if (testLevel) setLevels([testLevel]);
else try { await loadLevels(); } catch (e) { levelsFailed = true; }
const state = storage.load(LEVELS.length + 1, LANGS);
setLang(state.lang ?? DEFAULT_LANG);
cores.refresh(state);
storage.save(state);
audio.setEnabled(state.sound);

const probe = $('safe-probe');
// Dev aid: ?unlock=45 shows the map as if 45 levels were cleared (view only, never saved).
const devUnlock = Math.min(TOTAL_LEVELS, Math.max(0, parseInt(new URLSearchParams(location.search).get('unlock'), 10) || 0));
const screens = { title: $('screen-title'), settings: $('screen-settings'), map: $('screen-map'), game: $('screen-game') };
let currentLevel = 1;
let screen = 'title';

function show(name) {
  screen = name;
  for (const k in screens) screens[k].classList.toggle('hidden', k !== name);
  if (name === 'title') { resizeTitle(); title.start(); } else title.stop();
  if (name === 'map') { renderMap(true); if (levelsFailed) showModal({ title: t('levels_failed_title'), text: t('levels_failed'), buttons: [{ label: t('close'), primary: true }] }); }
  else if (name === 'game') resizeGame();
  else if (name === 'settings') renderSettings();
}

// ---------- HUD (Cores) ----------
let shownCores = -1;
function renderCores() {
  cores.refresh(state);
  if (shownCores !== state.cores) { // the icons are only rebuilt when the number changes
    const box = $('cores');
    box.replaceChildren(...Array.from({ length: storage.MAX_CORES }, (_, i) => coreSvg(i < state.cores)));
    shownCores = state.cores;
  }
  const ms = cores.msToNext(state);
  $('core-timer').textContent = ms > 0 ? t('next_core', { time: cores.formatMs(ms) }) : t('cores_full');
}

// ---------- static text, title, settings ----------
function applyText() {
  document.documentElement.lang = getLang();
  $('version').textContent = VERSION;
  $('btn-play').textContent = t('play');
  $('btn-settings').textContent = t('settings');
  $('btn-back').textContent = '‹ ' + t('back');
  $('btn-menu').textContent = '‹ ' + t('menu');
  $('settings-title').textContent = t('settings');
  $('lbl-lang').textContent = t('language');
  $('lbl-sound').textContent = t('sound');
  $('lbl-progress').textContent = t('progress');
  $('btn-reset').textContent = t('reset_progress');
}

const title = new Title($('title-canvas'));
function resizeTitle() {
  const cs = getComputedStyle(probe);
  title.resize(parseFloat(cs.paddingTop) || 0, parseFloat(cs.paddingBottom) || 0);
}

function renderSettings() {
  $('btn-sound').textContent = t(state.sound ? 'sound_on' : 'sound_off');
  $('btn-sound').classList.toggle('sel', state.sound);
  renderDev();
  const list = $('lang-list');
  list.replaceChildren();
  for (const code of LANGS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn' + (code === getLang() ? ' sel' : '');
    b.textContent = dictName(code);
    b.addEventListener('click', () => {
      setLang(code); state.lang = code; storage.save(state);
      applyText(); renderSettings();
    });
    list.append(b);
  }
}

function resetProgress() {
  showModal({
    title: t('reset_title'),
    text: t('reset_text'),
    buttons: [
      { label: t('cancel'), primary: true },
      { label: t('reset_yes'), onClick: () => {
        state.unlocked = 1; state.cores = storage.MAX_CORES; state.coreTs = null; state.tutorialDone = false;
        storage.save(state);
      } },
    ],
  });
}

// ---------- developer mode ----------
// Seven quick taps on the version number turn it on or off. Its tools are listed in the settings while it is on.
const DEV_TAPS = 7, DEV_TAP_WINDOW = 3000;
let devTaps = [];
const dev = (tool) => state.dev.on && state.dev[tool];

function onVersionTap() {
  const now = Date.now();
  devTaps = devTaps.filter((ts) => now - ts < DEV_TAP_WINDOW);
  devTaps.push(now);
  if (devTaps.length < DEV_TAPS) return;
  devTaps = [];
  state.dev.on = !state.dev.on;
  storage.save(state);
  applyDev();
  showModal({ title: t(state.dev.on ? 'dev_on' : 'dev_off'), text: state.dev.on ? t('dev_on_text') : '', buttons: [{ label: t('close'), primary: true }] });
}

function applyDev() {
  game.perf = dev('perf') || new URLSearchParams(location.search).has('perf') ? (game.perf || new PerfMeter()) : null;
  game.showSeed = dev('seed');
}

function renderDev() {
  $('dev-section').classList.toggle('hidden', !state.dev.on);
  $('lbl-dev').textContent = t('developer');
  const list = $('dev-list');
  list.replaceChildren();
  if (!state.dev.on) return;
  for (const tool of storage.DEV_TOOLS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn' + (state.dev[tool] ? ' sel' : '');
    b.textContent = `${t('dev_' + tool)} · ${t(state.dev[tool] ? 'sound_on' : 'sound_off')}`;
    b.addEventListener('click', () => { state.dev[tool] = !state.dev[tool]; storage.save(state); applyDev(); renderDev(); });
    list.append(b);
  }
  const off = document.createElement('button');
  off.type = 'button'; off.className = 'btn'; off.textContent = t('dev_leave');
  off.addEventListener('click', () => { state.dev.on = false; storage.save(state); applyDev(); renderDev(); });
  list.append(off);
}

// the highest level that can be played: what the player has reached, or every level in developer mode
const reachable = () => (dev('unlockAll') ? Math.max(state.unlocked, LEVELS.length) : state.unlocked);

// ---------- map ----------
let mapScreenW = 0;
function renderMap(scroll) {
  mapScreenW = $('map-scroll').clientWidth;
  const info = buildMap($('map'), Math.max(reachable(), devUnlock), onSelect, { playable: LEVELS.length, dev: devUnlock > 0, screenW: mapScreenW });
  renderCores();
  if (scroll) requestAnimationFrame(() => {
    const sc = $('map-scroll'), scale = $('map').clientWidth / info.width;
    sc.scrollTop = Math.max(0, info.nodeY * scale - sc.clientHeight * 0.6);
  });
}

function onSelect(n) {
  if (n > reachable() || n > LEVELS.length) return;
  currentLevel = n;
  showModal({
    title: t('level', { n }),
    buttons: [
      { label: t('play'), primary: true, onClick: () => tryPlay(n) },
      { label: t('close') },
    ],
  });
}

// ?seed=123 repeats a start exactly: colours and where the power-ups hide. The seed is shown in test play's pause menu.
const seedParam = parseInt(new URLSearchParams(location.search).get('seed'), 10);
const seedOpt = () => (Number.isInteger(seedParam) ? { seed: seedParam } : {});

function playTest() {
  hideModal();
  currentLevel = 1;
  show('game');
  audio.setMusic(true);
  game.start(0, seedOpt());
}

function tryPlay(n) {
  cores.refresh(state);
  if (state.cores <= 0 && !dev('infiniteCores')) { noCores(); return; }
  currentLevel = n;
  show('game');
  audio.setMusic(true);
  game.start(n - 1, { tutorial: n === 1 && !state.tutorialDone && state.unlocked === 1, ...seedOpt() });
}

// ---------- no Cores ----------
function noCores() {
  let timer = 0;
  showModal({
    title: t('no_cores_title'),
    text: t('no_cores_text'),
    onClose: () => clearInterval(timer),
    build: (card) => {
      const p = document.createElement('p');
      p.className = 'timer';
      const upd = () => { p.textContent = t('next_core', { time: cores.formatMs(cores.msToNext(state)) }); renderCores(); };
      upd(); timer = setInterval(upd, 1000);
      card.append(p);
    },
    buttons: [
      { label: t('watch_ad'), primary: true, onClick: watchAd },
      { label: t('wait') },
    ],
  });
}

async function watchAd() {
  let line;
  showModal({
    title: t('ad_title'),
    build: (card) => { line = document.createElement('p'); card.append(line); },
  });
  const ok = await adProvider.rewarded((s) => { line.textContent = t('ad_text', { s }); });
  hideModal();
  if (ok) { cores.addCore(state); storage.save(state); renderCores(); }
}

// ---------- game ----------
function resizeGame() {
  const cs = getComputedStyle(probe);
  game.resize(parseFloat(cs.paddingTop) || 0, parseFloat(cs.paddingBottom) || 0);
}

// A miss is free; going on costs a Core. With none left the level ends. Test play just goes on.
function onMiss() {
  if (testLevel) { game.continueBall(); return; }
  audio.setMusic(false);
  cores.refresh(state);
  const free = dev('infiniteCores');
  if (state.cores <= 0 && !free) {
    showModal({ title: t('no_cores_title'), text: t('level_ends'), buttons: [{ label: t('map'), primary: true, onClick: toMap }] });
    return;
  }
  showModal({
    title: t('missed_title'),
    text: free ? '' : t('missed_text', { n: state.cores }),
    buttons: [
      { label: t('use_core'), primary: true, onClick: () => {
        if (!free) { cores.spendCore(state); storage.save(state); }
        game.continueBall();
        audio.setMusic(true);
      } },
      { label: t('cancel'), onClick: toMap },
    ],
  });
}

const game = new Game($('game'), {
  sfx: audio.play,
  onMiss,
  cores: () => (testLevel ? '' : dev('infiniteCores') ? '∞' : state.cores),
  onTutorialDone() { state.tutorialDone = true; storage.save(state); },
  onEnd(won) {
    if (testLevel) {
      showModal({ title: t('complete_title'), buttons: [{ label: t('retry'), primary: true, onClick: playTest }] });
      return;
    }
    if (!won) return; // a level is only left by winning, or from the miss and pause menus
    state.unlocked = Math.max(state.unlocked, Math.min(currentLevel + 1, LEVELS.length + 1));
    storage.save(state);
    const hasNext = currentLevel < LEVELS.length;
    showModal({
      title: t('complete_title'),
      buttons: [
        ...(hasNext ? [{ label: t('next_level'), primary: true, onClick: () => tryPlay(currentLevel + 1) }] : []),
        { label: t('map'), primary: !hasNext, onClick: toMap },
      ],
    });
  },
});

// ?perf, or the developer mode, shows frame times in the game's HUD, to find stutter on a real phone.
applyDev();

function toMap() { game.stop(); audio.setMusic(false); show('map'); }

function pauseGame() {
  if (screen !== 'game') return;
  if (game.state !== 'playing' && game.state !== 'ready') return;
  game.pause();
  audio.setMusic(false);
  showModal({
    title: t('paused'),
    text: testLevel || dev('seed') ? t('seed', { n: game.seed }) : '',
    buttons: [
      { label: t('resume'), primary: true, onClick: () => { game.resume(); audio.setMusic(true); } },
      testLevel ? { label: t('retry'), onClick: playTest }
        : { label: t('quit'), onClick: toMap }, // free: misses are what cost
    ],
    onClose: () => {},
  });
}

$('btn-pause').addEventListener('click', pauseGame);
$('btn-play').addEventListener('click', () => show('map'));
$('btn-settings').addEventListener('click', () => show('settings'));
$('btn-back').addEventListener('click', () => show('title'));
$('btn-menu').addEventListener('click', () => show('title'));
$('btn-reset').addEventListener('click', resetProgress);
$('version').addEventListener('click', onVersionTap);
$('btn-sound').addEventListener('click', () => {
  state.sound = !state.sound; storage.save(state);
  audio.setEnabled(state.sound);
  renderSettings();
  audio.play('paddle');
});
// iOS only starts audio from inside a user gesture.
for (const ev of ['pointerup', 'touchend', 'click']) document.addEventListener(ev, audio.unlock, { passive: true });

document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
function onResize() {
  if (screen === 'game') resizeGame();
  if (screen === 'title') resizeTitle();
  if (screen === 'map' && $('map-scroll').clientWidth !== mapScreenW) renderMap(false);
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 200));
// iOS: block pinch zoom, double-tap zoom and rubber-banding while playing.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (screen === 'game') e.preventDefault(); }, { passive: false });

setInterval(() => { if (screen === 'map') renderCores(); }, 1000);

// Test play in the editor's frame: tell the editor what is left, a few times a second.
if (testLevel && window.parent !== window) {
  setInterval(() => { if (game.type) window.parent.postMessage({ neonBreakerTest: game.status() }, '*'); }, 250);
}

applyText();
if (testLevel) playTest(); else show('title');

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
