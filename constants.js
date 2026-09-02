/* ------------------------------------------------------------------
 * Constant answers - the engine
 *
 * DS-160 asks questions the intake form does not. For Indonesian
 * applicants most have the same answer every time, but they are still
 * answers on a visa application - so they live in the open, in a pack
 * per visa class, where the agent can see and change each one rather
 * than having it buried in the filler.
 *
 * Nothing here ever overwrites a value that came from the applicant.
 *
 * ONE PACK AT A TIME, NEVER MERGED. `constants-c1d.js` and
 * `constants-j1.js` each register themselves; `use()` selects one. That
 * is a hard boundary rather than a conditional, and the reason is
 * concrete: C1/D ticks "Does Not Apply" for the SSN, the tax ID and the
 * monthly salary because its intake form never collects them, while the
 * J1 form collects all three. Leaking the C1/D pack into a J1
 * application would tick those boxes over numbers that exist in the
 * sheet - a wrong answer on a sworn form, and invisible, because a
 * ticked box is not a gap.
 *
 * So `values()` and `apply()` REFUSE to run until a class is chosen.
 * There is deliberately no default: a silent fallback to C1/D is
 * exactly the failure this separation exists to prevent.
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';

  const PACKS = {};
  let ACTIVE = '';

  /* The overrides an agent has set live per class. `ds160.constants` with
     no suffix was the single-class key; it is adopted once, for C1/D
     only, so nobody's deliberate choices vanish on upgrade. */
  const LEGACY_STORE = 'ds160.constants';
  const storeKey = () => 'ds160.constants.' + ACTIVE;

  function register(cls, list) {
    PACKS[cls] = list;
    return api;
  }

  function use(cls) {
    if (!PACKS[cls]) {
      throw new Error('DS160Const.use("' + cls + '"): no such pack. Load constants-' +
                      cls + '.js first. Registered: ' + Object.keys(PACKS).join(', '));
    }
    ACTIVE = cls;
    migrateLegacy();
    return api;
  }

  function active() { return ACTIVE; }
  function classes() { return Object.keys(PACKS); }

  function pack() {
    if (!ACTIVE) {
      throw new Error('DS160Const: no visa class selected. Call DS160Const.use("c1d") ' +
                      'or use("j1") before reading constants - there is no default on ' +
                      'purpose, because the wrong pack fills a sworn form with the ' +
                      'wrong answers.');
    }
    return PACKS[ACTIVE];
  }

  function byKey() {
    return pack().reduce((m, c) => (m[c.key] = c, m), {});
  }

  function saved() {
    try { return JSON.parse(localStorage.getItem(storeKey())) || {}; }
    catch (e) { return {}; }
  }

  /* Runs once per class on `use()`: if this class has no stored overrides
     but the pre-split key does, adopt them for C1/D. Only C1/D, because
     those choices were made against the C1/D pack and mean nothing for
     another class. */
  function migrateLegacy() {
    if (ACTIVE !== 'c1d') return;
    try {
      if (localStorage.getItem(storeKey()) !== null) return;
      const old = localStorage.getItem(LEGACY_STORE);
      if (old !== null) localStorage.setItem(storeKey(), old);
    } catch (e) { /* private mode - defaults are fine */ }
  }

  /* Effective answer for every constant: the agent's setting if there is
     one, otherwise the default. '' means "leave it to the agent". */
  function values() {
    const s = saved(), out = {};
    for (const c of pack()) out[c.key] = (c.key in s) ? s[c.key] : c.def;
    return out;
  }

  function set(key, value) {
    if (!byKey()[key]) return;
    const s = saved();
    s[key] = value;
    try { localStorage.setItem(storeKey(), JSON.stringify(s)); } catch (e) { /* private mode */ }
  }

  function reset() {
    try { localStorage.removeItem(storeKey()); } catch (e) { /* ignore */ }
  }

  /* Merge onto a record without ever clobbering the applicant's own data.
     The class is stamped on so the extension popup can say which one it
     is holding - filling a J1 application from a C1/D record puts the
     cruise line's U.S. contact on it, and the fields are the same, so
     nothing else would notice. */
  function apply(rec) {
    const v = values(), out = Object.assign({}, rec);
    for (const c of pack()) {
      if (!v[c.key]) continue;
      if (out[c.key] === undefined || out[c.key] === '') out[c.key] = v[c.key];
    }
    out._class = ACTIVE;
    return out;
  }

  /* Which ones are actually in play, for showing on the worksheet. */
  function inPlay() {
    const v = values();
    return pack().filter(c => v[c.key]).map(c => Object.assign({}, c, { value: v[c.key] }));
  }

  const api = { register, use, classes, activeClass: active, values, set, reset, apply };

  /* Kept as live getters so app.js reads the CURRENT pack rather than a
     snapshot taken before `use()` ran. */
  Object.defineProperty(api, 'CONSTANTS', { get: pack, enumerable: true });
  Object.defineProperty(api, 'BY_KEY', { get: byKey, enumerable: true });
  Object.defineProperty(api, 'STORE', { get: storeKey, enumerable: true });
  /* `active()` was the old name for "the constants in play". It is now
     `inPlay()`, because `activeClass()` answers a different question and
     one of them had to give. */
  api.active = inPlay;
  api.inPlay = inPlay;

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DS160Const = api;
})(typeof self !== 'undefined' ? self : this);
