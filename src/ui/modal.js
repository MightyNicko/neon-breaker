// Modal dialogs built with DOM APIs only (no innerHTML).
const root = () => document.getElementById('modal');

export function showModal({ title, text, buttons = [], onClose, build }) {
  const overlay = root();
  const card = overlay.firstElementChild;
  card.replaceChildren();
  if (title) { const h = document.createElement('h2'); h.textContent = title; card.append(h); }
  if (text) { const p = document.createElement('p'); p.textContent = text; card.append(p); }
  const handle = { close, card };
  if (build) build(card, handle);
  const row = document.createElement('div');
  row.className = 'buttons';
  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.className = 'btn' + (b.primary ? ' primary' : '');
    btn.textContent = b.label;
    if (b.icon) { btn.prepend(b.icon()); btn.classList.add('has-icon'); } // an icon before the text, e.g. the Core on buttons that cost one
    btn.addEventListener('click', () => { if (b.keepOpen !== true) close(); b.onClick?.(); });
    row.append(btn);
  }
  card.append(row);
  overlay.classList.remove('hidden');
  function close() {
    overlay.classList.add('hidden');
    card.replaceChildren();
    onClose?.();
  }
  return handle;
}

export function hideModal() {
  const overlay = root();
  overlay.classList.add('hidden');
  overlay.firstElementChild.replaceChildren();
}
