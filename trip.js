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
    { key: 'purposeOfTrip', page: 'Travel',
      label: 'Purpose of Trip to the U.S.', def: 'ALIEN IN TRANSIT (C)',
      hint: 'Must read exactly as the CEAC dropdown option.' },
    { key: 'specifyPurpose', page: 'Travel',
      label: 'Specify', def: 'CREWMEMBER IN TRANSIT (C1/D)',
      hint: 'The second dropdown under Purpose of Trip.' },
    { key: 'specificTravelPlans', page: 'Travel', kind: 'yesno',
      label: 'Have you made specific travel plans?', def: 'YES',
      hint: 'Yes reveals the full itinerary; No asks only for an intended date and length of stay.' },
    { key: 'arrivalDate', page: 'Travel', kind: 'date',
      label: 'Date of Arrival in U.S.', def: '',
      hint: 'The sign-on date. Any format - it is converted to DD-MMM-YYYY.' },
    { key: 'arrivalFlight', page: 'Travel', label: 'Arrival Flight (if known)', def: '' },
    { key: 'arrivalCity', page: 'Travel', label: 'Arrival City', def: '',
      hint: 'The sign-on port city.' },
    { key: 'departureDate', page: 'Travel', kind: 'date',
      label: 'Date of Departure from U.S.', def: '' },
    { key: 'departureFlight', page: 'Travel', label: 'Departure Flight (if known)', def: '' },
    { key: 'departureCity', page: 'Travel', label: 'Departure City', def: '' },
    { key: 'stayAddress', page: 'Travel', label: 'Address where you will stay in the U.S.', def: '',
      hint: 'Usually the vessel at its berth, or the crew hotel.' },
    { key: 'tripPayer', page: 'Travel', label: 'Person or entity paying for the trip', def: '',
      hint: 'Normally the cruise line.' },
    { key: 'jobTitleAboard', page: 'Crew Visa', label: 'Specific job title aboard the vessel', def: '',
      hint: 'The "Working in the Capacity of" line in the supporting letter.' },
    { key: 'vesselName', page: 'Crew Visa', label: 'Seagoing Ship / Vessel Name', def: '',
      hint: 'From the supporting letter - differs per applicant.' },
    { key: 'vesselImo', page: 'Crew Visa', label: 'Vessel Identification Number (IMO)', def: '',
      hint: 'From the supporting letter - differs per applicant.' },

    { key: 'usPocName', page: 'U.S. Contact', label: 'Contact person in the U.S.', def: '' },
    { key: 'usPocOrg', page: 'U.S. Contact', label: 'Organization name', def: '',
      hint: 'The cruise line or its U.S. agent.' },
    { key: 'usPocAddress', page: 'U.S. Contact', label: 'U.S. contact address', def: '' },
    { key: 'usPocPhone', page: 'U.S. Contact', label: 'U.S. contact phone', def: '' },
    { key: 'usPocEmail', page: 'U.S. Contact', label: 'U.S. contact email', def: '' },
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

  function apply(rec) {
    const v = values(rec), out = Object.assign({}, rec);
    for (const f of FIELDS) {
      if (!v[f.key]) continue;
      if (out[f.key] === undefined || out[f.key] === '') out[f.key] = v[f.key];
    }
    return out;
  }

  function filledCount(rec) {
    const v = values(rec);
    return FIELDS.filter(f => v[f.key]).length;
  }

  const api = { FIELDS, BY_KEY, idOf, values, set, clear, copy, apply, filledCount, STORE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DS160Trip = api;
})(typeof self !== 'undefined' ? self : this);
