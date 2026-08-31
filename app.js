/* DS-160 worksheet.
   Loads the VISA APPLICATIONS export, normalises every row, and shows
   each applicant in DS-160 page order with the problems flagged before
   anyone opens ceac.state.gov. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const STORE = 'ds160.rows';

  let rows = [];      // raw sheet rows (header -> value)
  let people = [];    // { rec, val }
  let selected = -1;

  // -- CSV / TSV -------------------------------------------------------
  function detectDelim(text) {
    const line = text.split(/\r?\n/, 1)[0] || '';
    return (line.split('\t').length > line.split(',').length) ? '\t' : ',';
  }

  function parseDelimited(text, delim) {
    const out = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else quoted = false;
        } else field += c;
      } else if (c === '"') quoted = true;
      else if (c === delim) { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); out.push(row); row = []; field = ''; }
      else if (c !== '\r') field += c;
    }
    if (field !== '' || row.length) { row.push(field); out.push(row); }
    return out.filter(r => r.some(v => v.trim() !== ''));
  }

  function toObjects(text) {
    const grid = parseDelimited(text, detectDelim(text));
    if (grid.length < 2) throw new Error('Need a header row plus at least one data row.');
    const head = grid[0].map(h => h.trim());
    if (!head.some(h => /^name$/i.test(h)))
      throw new Error('No "Name" column found - is this the VISA APPLICATIONS sheet?');
    return grid.slice(1).map(r => {
      const o = {};
      head.forEach((h, i) => { if (h) o[h] = (r[i] || '').trim(); });
      return o;
    });
  }

  // -- state -----------------------------------------------------------
  function build() {
    people = rows
      .filter(r => (r['Name'] || '').trim())
      .map(r => { const rec = DS160.toRecord(r); return { rec, val: DS160.validate(rec) }; });
    $('loader').hidden = true;
    $('main').hidden = false;
    renderList();
    if (people.length) select(0);
  }

  function loadText(text) {
    try {
      rows = toObjects(text);
      try { sessionStorage.setItem(STORE, JSON.stringify(rows)); } catch (e) { /* over quota, fine */ }
      $('loadMsg').textContent = '';
      build();
    } catch (e) {
      $('loadMsg').textContent = e.message;
    }
  }

  // -- list ------------------------------------------------------------
  function renderList() {
    const q = $('search').value.trim().toLowerCase();
    const onlyBad = $('onlyProblems').checked;
    const html = people.map((p, i) => {
      if (onlyBad && p.val.errors.length === 0) return '';
      const hay = (p.rec.fullName + ' ' + p.rec.passportNumber + ' ' + p.rec.email).toLowerCase();
      if (q && hay.indexOf(q) < 0) return '';
      const e = p.val.errors.length, w = p.val.warnings.length;
      return '<div class="person' + (i === selected ? ' sel' : '') + '" data-i="' + i + '">' +
        '<b>' + esc(p.rec.surname + ', ' + p.rec.givenNames) + '</b>' +
        '<small>' + esc(p.rec.passportNumber || 'no passport') + ' &middot; ' +
        esc(p.rec.cruiseLine || p.rec.visaType || '') + '</small>' +
        '<div class="pills">' +
          (e ? '<span class="pill e">' + e + ' error' + (e > 1 ? 's' : '') + '</span>'
             : '<span class="pill ok">ready</span>') +
          (w ? '<span class="pill w">' + w + ' to check</span>' : '') +
        '</div></div>';
    }).join('');
    $('people').innerHTML = html || '<div class="empty">No matches.</div>';
  }

  function select(i) { selected = i; renderList(); renderDetail(); }

  // -- detail ----------------------------------------------------------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function renderDetail() {
    const p = people[selected];
    if (!p) { $('detail').innerHTML = '<div class="empty">Pick an applicant.</div>'; return; }
    const { rec, val } = p;
    const flagged = {};
    val.errors.forEach(e => flagged[e.field] = 'bad');
    val.warnings.forEach(w => { if (!flagged[w.field]) flagged[w.field] = 'flag'; });
    val.missing.forEach(m => { if (!flagged[m.field]) flagged[m.field] = 'flag'; });

    let h = '<div class="who"><div>' +
      '<h2>' + esc(rec.surname) + ', ' + esc(rec.givenNames) + '</h2>' +
      '<div class="sub">' + esc(rec.fullName) + ' &middot; ' + esc(rec.passportNumber || 'no passport') +
      ' &middot; ' + esc(rec.dob || '') + '</div></div><div class="row">' +
      '<button class="primary" id="send">Send to extension</button>' +
      '<button id="copyJson">Copy JSON</button>' +
      '<button id="copyAll">Copy worksheet</button>' +
      '<span id="sendMsg"></span></div></div>';

    h += '<div class="issues">';
    if (!val.errors.length && !val.warnings.length) h += '<div class="clear">Nothing to fix.</div>';
    val.errors.forEach(e => h += '<div class="issue e"><code>' + esc(e.field) + '</code>' + esc(e.msg) + '</div>');
    val.warnings.forEach(w => h += '<div class="issue w"><code>' + esc(w.field) + '</code>' + esc(w.msg) + '</div>');
    if (val.missing.length) {
      h += '<details class="missing"><summary>' + val.missing.length +
        ' DS-160 field(s) the intake form never asks for</summary>' +
        val.missing.map(m => '<div class="issue w"><code>' + esc(m.field) + '</code>' +
                             esc(m.msg) + '</div>').join('') +
        '</details>';
    }
    h += '</div>';

    for (const sec of DS160.SECTIONS) {
      h += '<div class="sec"><h3>' + esc(sec.title) + '</h3><table>';
      for (const [key, label] of sec.fields) {
        const v = rec[key];
        const cls = flagged[key] ? ' class="' + (flagged[key] === 'bad' ? 'bad' : 'flag') + '"' : '';
        h += '<tr' + cls + '><td class="k">' + esc(label) + '</td>' +
          '<td class="v' + (v ? '' : ' blank') + '">' + esc(v || 'not collected') + '</td>' +
          '<td class="a">' + (v ? '<button class="tiny cp" data-v="' + esc(v) + '">copy</button>' : '') +
          '</td></tr>';
      }
      h += '</table></div>';
    }
    $('detail').innerHTML = h;
    wireDetail(rec);
  }

  function worksheetText(rec) {
    return DS160.SECTIONS.map(sec =>
      '== ' + sec.title + ' ==\n' +
      sec.fields.map(([k, l]) => l + ': ' + (rec[k] || '')).join('\n')
    ).join('\n\n');
  }

  function wireDetail(rec) {
    $('detail').querySelectorAll('.cp').forEach(b => b.addEventListener('click', () => {
      navigator.clipboard.writeText(b.dataset.v);
      b.textContent = 'copied';
      setTimeout(() => b.textContent = 'copy', 900);
    }));
    $('copyJson').addEventListener('click', () => {
      const clone = Object.assign({}, rec); delete clone._raw;
      navigator.clipboard.writeText(JSON.stringify(clone, null, 2));
      $('sendMsg').textContent = 'JSON copied.';
    });
    $('copyAll').addEventListener('click', () => {
      navigator.clipboard.writeText(worksheetText(rec));
      $('sendMsg').textContent = 'Worksheet copied.';
    });
    $('send').addEventListener('click', () => {
      const clone = Object.assign({}, rec); delete clone._raw;
      window.postMessage({ channel: 'cti-ds160', type: 'record', record: clone }, '*');
      $('sendMsg').textContent = hasExtension() ? 'Sent.' : 'Extension not detected - use Copy JSON instead.';
    });
  }

  const hasExtension = () => document.documentElement.getAttribute('data-ds160-extension') === '1';

  // -- wiring ----------------------------------------------------------
  $('btnParse').addEventListener('click', () => loadText($('paste').value));
  $('btnLoad').addEventListener('click', () => { $('loader').hidden = false; $('main').hidden = true; });
  $('search').addEventListener('input', renderList);
  $('onlyProblems').addEventListener('change', renderList);
  $('people').addEventListener('click', ev => {
    const el = ev.target.closest('.person');
    if (el) select(+el.dataset.i);
  });

  const drop = $('drop');
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => {
    e.preventDefault(); drop.classList.add('hot');
  }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, () => drop.classList.remove('hot')));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) f.text().then(loadText);
  });

  $('btnDemo').addEventListener('click', () => {
    $('paste').value =
      'Name,Gender,Marital Status,Date of Birth,Place of Birth,Nationality,KTP Number,Address,' +
      'Phone Number,Email Address,Passport Number,Passport Issued Date,Passport Expired Date,' +
      "Father's Name,Mother's Name,Current Workplace's Name,Current Employment Position,Cruise Line,Appointment Date\n" +
      'Budi Santoso,Male,Single,25/03/1995,Denpasar,Indonesia,5103021234567890,"Jl. Raya Kuta 12, Badung",' +
      '081234567890,budi@example.com,C1234567,2024-02-10,2029-02-09,Santoso,Wayan Sari,PT Bahari,Waiter,' +
      'Royal Caribbean,2026-10-01\n' +
      'Sukarno,Male,Married,05/03/1990,Surabaya,Indonesia,12345,Jl. Melati 3,12,not-an-email,X 12,' +
      '2020-01-01,2026-11-01,Fauzi,,,,Carnival,2026-10-01\n';
  });

  window.addEventListener('message', ev => {
    if (ev.data && ev.data.channel === 'cti-ds160' && ev.data.type === 'record-ack')
      $('sendMsg').textContent = 'Loaded into the extension.';
  });

  // Restore whatever was loaded before a refresh.
  try {
    const saved = sessionStorage.getItem(STORE);
    if (saved) { rows = JSON.parse(saved); build(); }
  } catch (e) { /* ignore */ }

  setTimeout(() => {
    const on = hasExtension();
    $('extBadge').textContent = on ? 'extension connected' : 'extension not detected';
    $('extBadge').className = 'badge ' + (on ? 'on' : 'off');
  }, 300);
})();
