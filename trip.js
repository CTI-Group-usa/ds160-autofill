/* ------------------------------------------------------------------
 * Trip details, per applicant
 *
 * The Travel and U.S. Contact pages ask for things the intake form
 * never collects: arrival date, arrival city, flight, vessel, who is
 * paying, the U.S. point of contact. Each DS-160 is its own personal
 * application, so these are stored per applicant - keyed on passport
 * number - not shared across everyone in a file.
 *
 * "Copy from" is there only because re-typing the same cruise line
 * details is a waste; it is an explicit action, never automatic.
 *
 * Nothing here overwrites a value that came from the seafarer.
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';

  const STORE = 'ds160.trip';

  const FIELDS = [
    /* THESE THREE HAVE NO DEFAULT HERE, ON PURPOSE. They are visa-class
       answers, so each constants pack supplies its own - C1/D gets
       ALIEN IN TRANSIT (C) with specific plans NO, J1 gets
       EXCHANGE VISITOR (J) with YES.

       They used to carry the C1/D values right here, and that was a real
       leak: app.js applies trip details FIRST and constants second, and
       `DS160Const.apply()` never overwrites a value that is already set.
       So a J1 record would have been stamped ALIEN IN TRANSIT (C) by this
       file and the J1 pack could not correct it. Leaving them empty lets
       the class fill them, and the agent can still override either one
       per applicant in this panel. */
    { key: 'purposeOfTrip', page: 'Travel',
      label: 'Purpose of Trip to the U.S.', def: '',
      hint: 'Filled from the visa class. Must read exactly as the CEAC dropdown option.' },
    { key: 'specifyPurpose', page: 'Travel',
      label: 'Specify', def: '',
      hint: 'The second dropdown under Purpose of Trip. Filled from the visa class.' },
    { key: 'specificTravelPlans', page: 'Travel', kind: 'yesno',
      label: 'Have you made specific travel plans?', def: '',
      hint: 'Filled from the visa class: C1/D answers No, which drops the itinerary ' +
            'questions; J1 answers Yes, which demands arrival and departure dates.' },
    { key: 'arrivalDate', page: 'Travel', kind: 'date',
      label: 'Intended Date of Arrival in U.S.', def: '',
      hint: 'The sign-on date. Any format - it is converted to DD-MMM-YYYY.' },
    { key: 'arrivalFlight', page: 'Travel', label: 'Arrival Flight (if known)', def: '',
      showWhen: { key: 'specificTravelPlans', is: 'YES' } },
    { key: 'arrivalCity', page: 'Travel', label: 'Arrival City', def: '',
      hint: 'The sign-on port city.',
      showWhen: { key: 'specificTravelPlans', is: 'YES' } },
    { key: 'departureDate', page: 'Travel', kind: 'date',
      label: 'Date of Departure from U.S.', def: '',
      showWhen: { key: 'specificTravelPlans', is: 'YES' } },
    { key: 'departureFlight', page: 'Travel', label: 'Departure Flight (if known)', def: '',
      showWhen: { key: 'specificTravelPlans', is: 'YES' } },
    { key: 'departureCity', page: 'Travel', label: 'Departure City', def: '',
      showWhen: { key: 'specificTravelPlans', is: 'YES' } },
    { key: 'jobTitleAboard', page: 'Crew Visa', label: 'Specific job title aboard the vessel', def: '',
      hint: 'The "Working in the Capacity of" line in the supporting letter.' },
    { key: 'vesselName', page: 'Crew Visa', label: 'Seagoing Ship / Vessel Name', def: '',
      hint: 'From the supporting letter - differs per applicant.' },
    { key: 'vesselImo', page: 'Crew Visa', label: 'Vessel Identification Number (IMO)', def: '',
      hint: 'From the supporting letter - differs per applicant.' },

  ];

  const BY_KEY = FIELDS.reduce((m, f) => (m[f.key] = f, m), {});

  /* One application, one applicant: passport number identifies them, with
     email then name as fallbacks for rows that have no passport yet. */
  function idOf(rec) {
    return (rec && (rec.passportNumber || rec.email || rec.fullName) || '').trim().toUpperCase();
  }

  function all() {
    try { return JSON.parse(localStorage.getItem(STORE)) || {}; }
    catch (e) { return {}; }
  }

  function save(store) {
    try { localStorage.setItem(STORE, JSON.stringify(store)); } catch (e) { /* private mode */ }
  }

  function values(rec) {
    const mine = all()[idOf(rec)] || {}, out = {};
    for (const f of FIELDS) out[f.key] = (f.key in mine) ? mine[f.key] : f.def;
    return out;
  }

  /* Dates are normalised on the way in, so the agent can type 15/10/2026
     and CEAC still gets 15-OCT-2026. */
  function set(rec, key, value) {
    const f = BY_KEY[key];
    if (!f) return '';
    const id = idOf(rec);
    if (!id) return '';
    let v = String(value == null ? '' : value).trim();
    if (f.kind === 'date' && v && typeof DS160 !== 'undefined') v = DS160.dateStr(v) || v;
    const store = all();
    store[id] = Object.assign({}, store[id]);
    store[id][key] = v;
    save(store);
    return v;
  }

  function clear(rec) {
    const store = all();
    delete store[idOf(rec)];
    save(store);
  }

  /* Explicit convenience only - the agent asks for it, per applicant. */
  function copy(fromRec, toRec) {
    const store = all();
    const src = store[idOf(fromRec)];
    if (!src || !idOf(toRec)) return false;
    store[idOf(toRec)] = Object.assign({}, src);
    save(store);
    return true;
  }

  /* A question CEAC will not ask must not be sent as an answer. */
  function visible(f, v) {
    return !f.showWhen || v[f.showWhen.key] === f.showWhen.is;
  }

  function apply(rec) {
    const v = values(rec), out = Object.assign({}, rec);
    for (const f of FIELDS) {
      if (!v[f.key] || !visible(f, v)) continue;
      if (out[f.key] === undefined || out[f.key] === '') out[f.key] = v[f.key];
    }
    return out;
  }

  function filledCount(rec) {
    const v = values(rec);
    return FIELDS.filter(f => v[f.key]).length;
  }

  const api = { FIELDS, BY_KEY, idOf, values, set, clear, copy, apply, visible, filledCount, STORE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DS160Trip = api;
})(typeof self !== 'undefined' ? self : this);
