// Saves medals, best times and settings in localStorage (and copes when storage is unavailable).

const KEY = 'kestrel-isles-v1';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}

let data = load();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* private mode: keep in memory */ }
}

const RANK = { gold: 3, silver: 2, bronze: 1 };

export const Save = {
  record(id) { return (data.records || {})[id] || null; },
  /** Keeps the better medal and the faster time for a mission; returns true when it is a new best. */
  submit(id, result) {
    data.records = data.records || {};
    const old = data.records[id];
    const better = !old || (RANK[result.medal] || 0) > (RANK[old.medal] || 0) || ((RANK[result.medal] || 0) === (RANK[old.medal] || 0) && result.time < old.time);
    if (better) { data.records[id] = { medal: result.medal, time: result.time, fpm: result.landing ? result.landing.fpm : null }; save(); }
    return better;
  },
  setting(name, fallback) { return (data.settings || {})[name] ?? fallback; },
  setSetting(name, value) { data.settings = data.settings || {}; data.settings[name] = value; save(); },
};
