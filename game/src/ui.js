// Menu screens drawn in HTML over the 3D view: title, sortie select, briefing, pause and debrief.
import { Save } from './storage.js';
import { formatTime } from './hud.js';

const TOD_LABEL = { morning: 'Morning', noon: 'Midday', golden: 'Golden hour', dusk: 'Dusk' };
const MEDAL_ICON = { gold: '🥇', silver: '🥈', bronze: '🥉' };

const CONTROLS = [
  ['W / S  or  ↑ / ↓', 'Nose down / nose up'], ['A / D  or  ← / →', 'Roll left / right'], ['Q / E', 'Rudder left / right'],
  ['Shift / Z  ·  wheel  ·  1–0', 'Throttle up / down'], ['Drag with the mouse', 'Fly with the mouse as a stick'], ['M', 'Mouse yoke on/off (stick follows the cursor)'],
  ['G', 'Landing gear'], ['F / V', 'Flaps down / up'], ['B', 'Wheel brakes (hold)'], ['C', 'Chase / cockpit view'],
  ['P or Esc', 'Pause'], ['R', 'Restart sortie'], ['N', 'Sound on/off'],
];

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export class UI {
  constructor(root, actions) {
    this.root = root;
    this.actions = actions;
    this.screen = null;
  }

  show(node, name) {
    this.root.innerHTML = '';
    if (node) this.root.appendChild(node);
    this.screen = name;
    this.root.classList.toggle('open', !!node);
    const first = node && node.querySelector('[data-primary]');
    if (first) setTimeout(() => first.focus({ preventScroll: true }), 30);
  }

  hide() { this.show(null, null); }

  bind(node) {
    node.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { this.actions.click(); this.actions[b.dataset.go](b.dataset.arg); }));
    return node;
  }

  title(muted) {
    this.show(this.bind(el(`
      <section class="screen title">
        <div class="logo"><span class="kicker">K-7 KESTREL</span><h1>Kestrel <em>Isles</em></h1><p>An island-hopping bush-pilot flight game</p></div>
        <div class="menu">
          <button data-go="missions" data-primary>Fly a sortie</button>
          <button data-go="free">Free flight</button>
          <button data-go="controls" class="ghost">Controls</button>
          <button data-go="toggleMute" class="ghost small">${muted ? 'Sound: off' : 'Sound: on'}</button>
        </div>
        <footer>Six sorties · three airfields · keyboard, mouse or touch</footer>
      </section>`)), 'title');
  }

  missions(list) {
    const cards = list.filter((m) => m.id !== 'free').map((m, i) => {
      const rec = Save.record(m.id);
      const badge = rec ? `<span class="medal ${rec.medal}">${MEDAL_ICON[rec.medal] || ''} ${formatTime(rec.time)}</span>` : '<span class="medal none">Not flown</span>';
      return `<button class="card tod-${m.time}" data-go="brief" data-arg="${m.id}" ${i === 0 ? 'data-primary' : ''}>
        <span class="num">${String(i + 1).padStart(2, '0')}</span>
        <span class="tag">${m.tag} · ${TOD_LABEL[m.time]}</span>
        <strong>${m.name}</strong>
        <span class="brief">${m.brief}</span>
        <span class="foot">Par ${formatTime(m.par)} ${badge}</span>
      </button>`;
    }).join('');
    this.show(this.bind(el(`
      <section class="screen missions">
        <h2>Choose a sortie</h2>
        <div class="cards">${cards}</div>
        <div class="row"><button data-go="title" class="ghost">Back</button><button data-go="free" class="ghost">Free flight</button></div>
      </section>`)), 'missions');
  }

  brief(m) {
    this.show(this.bind(el(`
      <section class="screen brief tod-${m.time}">
        <span class="tag">${m.tag} · ${TOD_LABEL[m.time]} · wind ${String(m.wind.from).padStart(3, '0')}° at ${Math.round(m.wind.speed * 1.94)} kt · fuel ${Math.round(m.fuel * 100)}%</span>
        <h2>${m.name}</h2>
        <p class="lead">${m.brief}</p>
        <p class="tip"><b>Pilot's note:</b> ${m.tips}</p>
        <ul class="keys">
          <li><kbd>Shift</kbd>/<kbd>Z</kbd> throttle</li><li><kbd>W</kbd><kbd>S</kbd> pitch</li><li><kbd>A</kbd><kbd>D</kbd> roll</li>
          <li><kbd>G</kbd> gear</li><li><kbd>F</kbd>/<kbd>V</kbd> flaps</li><li><kbd>B</kbd> brakes</li><li><kbd>C</kbd> view</li>
        </ul>
        <div class="row"><button data-go="missions" class="ghost">Back</button><button data-go="launch" data-arg="${m.id}" data-primary>Start engine ▶</button></div>
      </section>`)), 'brief');
  }

  controls(back) {
    const rows = CONTROLS.map(([k, d]) => `<tr><td><kbd>${k}</kbd></td><td>${d}</td></tr>`).join('');
    this.show(this.bind(el(`
      <section class="screen controls">
        <h2>Flight controls</h2>
        <table>${rows}</table>
        <p class="tip">On a phone or tablet: left thumb on the stick, right thumb on the throttle lever, buttons for gear, flaps, brakes and view.</p>
        <p class="tip">Landing: line up early, flaps 2, gear down, 60–70 kt, and aim for less than 300 ft/min on touchdown. Then hold B.</p>
        <div class="row"><button data-go="${back}" data-primary>Back</button></div>
      </section>`)), 'controls');
  }

  pause() {
    this.show(this.bind(el(`
      <section class="screen pause">
        <h2>Paused</h2>
        <div class="menu">
          <button data-go="resume" data-primary>Resume</button>
          <button data-go="restart">Restart sortie</button>
          <button data-go="pauseControls" class="ghost">Controls</button>
          <button data-go="missions" class="ghost">Leave to sortie select</button>
        </div>
      </section>`)), 'pause');
  }

  debrief(m, r, next) {
    const L = r.landing;
    const rows = [
      ['Time', formatTime(r.time) + (m.par ? `  (par ${formatTime(m.par)})` : '')],
      r.ringsTotal ? ['Rings', `${r.rings} / ${r.ringsTotal}`] : null,
      L ? ['Touchdown', `${L.fpm} ft/min · ${L.kt} kt — ${L.text}`] : null,
      L && L.centreline !== undefined ? ['Centreline', `${L.centreline.toFixed(1)} m off`] : null,
      ['Fuel left', `${Math.round(r.fuel * 100)}%`], ['Airframe', r.damage > 1 ? `${Math.round(r.damage)}% damage` : 'No damage'],
    ].filter(Boolean).map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
    const head = r.success ? (r.medal ? `<div class="medal-big ${r.medal}">${MEDAL_ICON[r.medal]}<span>${r.medal.toUpperCase()}</span></div>` : '') : '<div class="medal-big failed">✕</div>';
    this.show(this.bind(el(`
      <section class="screen debrief ${r.success ? 'ok' : 'bad'}">
        ${head}
        <h2>${r.success ? 'Sortie complete' : 'Sortie failed'}</h2>
        <p class="lead">${r.success ? (r.newBest ? 'New personal best on ' : 'Well flown on ') + m.name + '.' : r.reason}</p>
        <table class="stats">${rows}</table>
        <div class="row">
          <button data-go="restart" ${r.success ? '' : 'data-primary'}>Fly again</button>
          ${next ? `<button data-go="brief" data-arg="${next.id}" ${r.success ? 'data-primary' : ''}>Next: ${next.name}</button>` : ''}
          <button data-go="missions" class="ghost">Sorties</button>
        </div>
      </section>`)), 'debrief');
  }
}
