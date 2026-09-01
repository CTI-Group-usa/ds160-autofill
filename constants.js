/* ------------------------------------------------------------------
 * Constant answers
 *
 * DS-160 asks questions the intake form never does. For Indonesian
 * seafarers most of them have the same answer every time, but they are
 * still answers on a visa application - so they live here, in the open,
 * where the agent can see and change each one, rather than buried in
 * the filler.
 *
 * Nothing here overwrites a value that came from the seafarer.
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';

  const STORE = 'ds160.constants';

  const CONSTANTS = [
    { key: 'otherNamesUsed', kind: 'yesno', page: 'Personal 1',
      label: 'Have you ever used other names?',
      def: 'NO', why: 'Set to Yes for anyone with a maiden, religious or alias name in their file.' },
    { key: 'telecode', kind: 'yesno', page: 'Personal 1',
      label: 'Do you have a telecode that represents your name?',
      def: 'NO', why: 'Telecodes are 4-digit codes used for Chinese and some other Asian names.' },
    { key: 'otherNationality', kind: 'yesno', page: 'Personal 2',
      label: 'Do you hold any nationality other than the one above?',
      def: 'NO', why: 'Yes only for dual nationals.' },
    { key: 'otherCountryPermRes', kind: 'yesno', page: 'Personal 2',
      label: 'Are you a permanent resident of another country?',
      def: 'NO', why: 'Yes if the seafarer holds PR somewhere other than Indonesia.' },
    { key: 'ssnNA', kind: 'checkbox', page: 'Personal 2',
      label: 'U.S. Social Security Number - tick "Does Not Apply"',
      def: 'YES', why: 'Seafarers who have never worked in the U.S. have no SSN.' },
    { key: 'taxIdNA', kind: 'checkbox', page: 'Personal 2',
      label: 'U.S. Taxpayer ID Number - tick "Does Not Apply"',
      def: 'YES', why: 'Only applies to someone who has filed U.S. tax returns.' },
    { key: 'mailingSameAsHome', kind: 'yesno', page: 'Address and Phone',
      label: 'Is your mailing address the same as your home address?',
      def: 'YES', why: 'The intake form collects only one address.' },
    /* The U.S. contact and the paying company are the same on every
       application CTI files - they describe the cruise line, not the
       seafarer. Values below are Carnival UK, taken from a filed
       application; change them here for a different principal. */
    { key: 'travelCompanions', kind: 'yesno', page: 'Travel Companions',
      label: 'Are there other persons traveling with you?',
      def: 'NO', why: 'Crew join individually.' },

    { key: 'lengthOfStay', kind: 'text', page: 'Travel',
      label: 'Intended Length of Stay - number', def: '8',
      why: 'The contract length. Change it per contract if it differs.' },
    { key: 'lengthOfStayUnit', kind: 'text', page: 'Travel',
      label: 'Intended Length of Stay - unit', def: 'MONTH(S)' },
    { key: 'stayAddr1', kind: 'text', page: 'Travel',
      label: 'Where you will stay - street address (line 1)', def: '6600 NW 16TH ST',
      why: 'Same address as the U.S. contact.' },
    { key: 'stayAddr2', kind: 'text', page: 'Travel',
      label: 'Where you will stay - street address (line 2)', def: 'SUITE 8' },
    { key: 'stayCity', kind: 'text', page: 'Travel',
      label: 'Where you will stay - city', def: 'PLANTATION' },
    { key: 'stayState', kind: 'text', page: 'Travel',
      label: 'Where you will stay - state', def: 'FLORIDA' },
    { key: 'stayZip', kind: 'text', page: 'Travel',
      label: 'Where you will stay - ZIP code', def: '33313' },

    { key: 'tripPayer', kind: 'text', page: 'Travel',
      label: 'Person/Entity Paying for Your Trip', def: 'COMPANY/ORGANIZATION',
      why: 'Must read exactly as the CEAC dropdown option.' },
    { key: 'payerCompany', kind: 'text', page: 'Travel',
      label: 'Company/Organization Paying', def: 'CARNIVAL UK' },
    { key: 'payerPhone', kind: 'text', page: 'Travel',
      label: 'Paying company - telephone', def: '19545685888' },
    { key: 'payerRelationship', kind: 'text', page: 'Travel',
      label: 'Paying company - relationship to you', def: 'EMPLOYER' },
    { key: 'payerAddr1', kind: 'text', page: 'Travel',
      label: 'Paying company - street address', def: 'CARNIVAL HOUSE, 100 HARBOUR PARADE' },
    { key: 'payerAddr2', kind: 'text', page: 'Travel',
      label: 'Paying company - street address (line 2)', def: '',
      why: 'Carnival UK needs only one line; fill it for a principal that needs two.' },
    { key: 'payerCity', kind: 'text', page: 'Travel',
      label: 'Paying company - city', def: 'SOUTHAMPTON' },
    { key: 'payerState', kind: 'text', page: 'Travel',
      label: 'Paying company - state/province', def: 'HAMPSHIRE' },
    { key: 'payerZip', kind: 'text', page: 'Travel',
      label: 'Paying company - postal code', def: 'SO15 1ST' },
    { key: 'payerCountry', kind: 'text', page: 'Travel',
      label: 'Paying company - country/region', def: 'UNITED KINGDOM' },

    { key: 'usPocSurname', kind: 'text', page: 'U.S. Contact',
      label: 'Contact person - surnames', def: 'XAVIER' },
    { key: 'usPocGiven', kind: 'text', page: 'U.S. Contact',
      label: 'Contact person - given names', def: 'MARCOS' },
    { key: 'usPocOrg', kind: 'text', page: 'U.S. Contact',
      label: 'Organization name in the U.S.', def: 'DO NOT KNOW' },
    { key: 'usPocRelationship', kind: 'text', page: 'U.S. Contact',
      label: 'Relationship to you', def: 'BUSINESS ASSOCIATE' },
    { key: 'usPocAddr1', kind: 'text', page: 'U.S. Contact',
      label: 'U.S. contact - street address', def: '6600 NW 16TH ST' },
    { key: 'usPocAddr2', kind: 'text', page: 'U.S. Contact',
      label: 'U.S. contact - street address (line 2)', def: 'SUITE 8' },
    { key: 'usPocCity', kind: 'text', page: 'U.S. Contact',
      label: 'U.S. contact - city', def: 'PLANTATION' },
    { key: 'usPocState', kind: 'text', page: 'U.S. Contact',
      label: 'U.S. contact - state', def: 'FLORIDA' },
    { key: 'usPocZip', kind: 'text', page: 'U.S. Contact',
      label: 'U.S. contact - ZIP code', def: '33313' },
    { key: 'usPocPhone', kind: 'text', page: 'U.S. Contact',
      label: 'U.S. contact - phone', def: '019545695900' },
    { key: 'usPocEmail', kind: 'text', page: 'U.S. Contact',
      label: 'U.S. contact - email', def: 'marcos@carnivaluk.com' },

    { key: 'immediateRelativesUS', kind: 'yesno', page: 'Family',
      label: 'Do you have any immediate relatives in the U.S.?',
      def: 'NO', why: 'Spouse, child, parent or sibling living in the U.S. Check this per applicant.' },
    { key: 'otherRelativesUS', kind: 'yesno', page: 'Family',
      label: 'Do you have any other relatives in the U.S.?',
      def: 'NO', why: 'Check this per applicant.' },

    /* No constant for the previous visit's Length of Stay. It looked like one
       - crew transits are same-day - but the user corrected it on 2026-09-01:
       it is the seafarer's own answer and comes from the intake form. See
       `prevStayUnit` / `prevStayLength` in normalize.js. */

    /* Not a single control - a sweep across five pages. It has no matcher
       rule; content.js reads it straight off the record. It lives here so
       it sits alongside every other answer the agent is making on the
       applicant's behalf, and can be switched off in one click. */
    { key: 'securityAllNo', kind: 'toggle', page: 'Security and Background', field: false,
      label: 'Security and Background - answer "No" to every question',
      def: 'YES',
      why: 'These are sworn answers. Every question answered this way is outlined on the ' +
           'page and listed in the extension report - read them before clicking Next, and ' +
           'change any that are not true for this applicant.' },
  ];

  const BY_KEY = CONSTANTS.reduce((m, c) => (m[c.key] = c, m), {});

  function saved() {
    try { return JSON.parse(localStorage.getItem(STORE)) || {}; }
    catch (e) { return {}; }
  }

  /* Effective answer for every constant: the agent's setting if there
     is one, otherwise the default. '' means "leave it to the agent". */
  function values() {
    const s = saved(), out = {};
    for (const c of CONSTANTS) out[c.key] = (c.key in s) ? s[c.key] : c.def;
    return out;
  }

  function set(key, value) {
    if (!BY_KEY[key]) return;
    const s = saved();
    s[key] = value;
    try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) { /* private mode */ }
  }

  function reset() {
    try { localStorage.removeItem(STORE); } catch (e) { /* ignore */ }
  }

  /* Merge onto a record without ever clobbering the seafarer's own data. */
  function apply(rec) {
    const v = values(), out = Object.assign({}, rec);
    for (const c of CONSTANTS) {
      if (!v[c.key]) continue;
      if (out[c.key] === undefined || out[c.key] === '') out[c.key] = v[c.key];
    }
    return out;
  }

  /* Which ones are actually in play, for showing on the worksheet. */
  function active() {
    const v = values();
    return CONSTANTS.filter(c => v[c.key]).map(c => ({ ...c, value: v[c.key] }));
  }

  const api = { CONSTANTS, BY_KEY, values, set, reset, apply, active, STORE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DS160Const = api;
})(typeof self !== 'undefined' ? self : this);
