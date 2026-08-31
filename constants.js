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
    { key: 'nativeAlphabetNA', kind: 'checkbox', page: 'Personal 1',
      label: 'Full Name in Native Alphabet — tick "Does Not Apply"',
      def: 'YES', why: 'Indonesia writes names in the Latin alphabet, so there is no native-alphabet form.' },
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
    { key: 'immediateRelativesUS', kind: 'yesno', page: 'Family',
      label: 'Do you have any immediate relatives in the U.S.?',
      def: 'NO', why: 'Spouse, child, parent or sibling living in the U.S. Check this per applicant.' },
    { key: 'otherRelativesUS', kind: 'yesno', page: 'Family',
      label: 'Do you have any other relatives in the U.S.?',
      def: 'NO', why: 'Check this per applicant.' },

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
