import { LEVELS, loadLevels } from './game/levels.js';
import { Game } from './game/game.js';
import { Title } from './title/title.js';
import { buildMap } from './map/map.js';
import { TOTAL_LEVELS } from './data/zones.js';
import { showModal, hideModal } from './ui/modal.js';
import { t, setLang, getLang, LANGS, DEFAULT_LANG, langName as dictName } from './core/i18n.js';
import * as storage from './core/storage.js';
import * as lives from './core/lives.js';
import { adProvider } from './core/ads.js';
import * as audio from './core/audio.js';
import { VERSION } from './version.js';

const $ = (id) => document.getElementById(id);
// The levels come from levels/*.json. Without them the game still starts, and the map says why nothing is playable.
let levelsFailed = false;
try { await loadLevels(); } catch (e) { levelsFailed = true; }
const state = storage.load(LEVELS.length + 1, LANGS);
setLang(state.lang ?? DEFAULT_LANG);
lives.refresh(state);
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

// ---------- HUD (lives) ----------
function renderLives() {
  lives.refresh(state);
  const box = $('hearts');
  if (box.childElementCount !== storage.MAX_LIVES) {
    box.replaceChildren();
    for (let i = 0; i < storage.MAX_LIVES; i++) { const s = document.createElement('span'); s.textContent = '♥'; box.append(s); }
  }
  [...box.children].forEach((s, i) => s.classList.toggle('full', i < state.lives));
  const ms = lives.msToNext(state);
  $('life-timer').textContent = ms > 0 ? t('next_life', { time: lives.formatMs(ms) }) : t('lives_full');
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
        state.unlocked = 1; state.lives = storage.MAX_LIVES; state.lifeTs = null; state.tutorialDone = false;
        storage.save(state);
      } },
    ],
  });
}

// ---------- map ----------
let mapScreenW = 0;
function renderMap(scroll) {
  mapScreenW = $('map-scroll').clientWidth;
  const info = buildMap($('map'), Math.max(state.unlocked, devUnlock), onSelect, { playable: LEVELS.length, dev: devUnlock > 0, screenW: mapScreenW });
  renderLives();
  if (scroll) requestAnimationFrame(() => {
    const sc = $('map-scroll'), scale = $('map').clientWidth / info.width;
    sc.scrollTop = Math.max(0, info.nodeY * scale - sc.clientHeight * 0.6);
  });
}

function onSelect(n) {
  if (n > state.unlocked || n > LEVELS.length) return;
  currentLevel = n;
  showModal({
    title: t('level', { n }),
    buttons: [
      { label: t('play'), primary: true, onClick: () => tryPlay(n) },
      { label: t('close') },
    ],
  });
}

function tryPlay(n) {
  lives.refresh(state);
  if (state.lives <= 0) { noLives(); return; }
  currentLevel = n;
  show('game');
  audio.setMusic(true);
  game.start(n - 1, { tutorial: n === 1 && !state.tutorialDone && state.unlocked === 1 });
}

// ---------- no lives ----------
function noLives() {
  let timer = 0;
  showModal({
    title: t('no_lives_title'),
    text: t('no_lives_text'),
    onClose: () => clearInterval(timer),
    build: (card) => {
      const p = document.createElement('p');
      p.className = 'timer';
      const upd = () => { p.textContent = t('next_life', { time: lives.formatMs(lives.msToNext(state)) }); renderLives(); };
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
  if (ok) { lives.addLife(state); storage.save(state); renderLives(); }
}

// ---------- game ----------
function resizeGame() {
  const cs = getComputedStyle(probe);
  game.resize(parseFloat(cs.paddingTop) || 0, parseFloat(cs.paddingBottom) || 0);
}

const game = new Game($('game'), {
  sfx: audio.play,
  onTutorialDone() { state.tutorialDone = true; storage.save(state); },
  onEnd(won) {
    if (won) {
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
    } else {
      lives.loseLife(state); storage.save(state);
      const canRetry = state.lives > 0;
      showModal({
        title: t('failed_title'),
        text: t('failed_text'),
        buttons: [
          ...(canRetry ? [{ label: t('retry'), primary: true, onClick: () => tryPlay(currentLevel) }] : []),
          { label: t('map'), primary: !canRetry, onClick: toMap },
        ],
      });
    }
  },
});

function toMap() { game.stop(); audio.setMusic(false); show('map'); }

function pauseGame() {
  if (screen !== 'game') return;
  if (game.state !== 'playing' && game.state !== 'ready') return;
  game.pause();
  audio.setMusic(false);
  showModal({
    title: t('paused'),
    text: t('quit_warning'),
    buttons: [
      { label: t('resume'), primary: true, onClick: () => { game.resume(); audio.setMusic(true); } },
      { label: t('quit'), onClick: () => { lives.loseLife(state); storage.save(state); toMap(); } },
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

setInterval(() => { if (screen === 'map') renderLives(); }, 1000);

applyText();
show('title');

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
