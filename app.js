/* DS-160 worksheet.
   Loads the VISA APPLICATIONS export, normalises every row, and shows
   each applicant in DS-160 page order with the problems flagged before
   anyone opens ceac.state.gov. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const STORE = 'ds160.rows';
  const RECORD_V = 5;          // 5 = native name filled, travel plans No + length of stay

  let rows = [];      // raw sheet rows (header -> value)
  let people = [];    // { rec, val }
  let selected = -1;
  let pendingLetter = null;   // survives the rebuild() that follows a parse
  let letterSeq = 0;

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

  /* 0,80 -> "CA2" : hyperlinks are keyed by cell reference. */
  function cellRef(row, col) {
    let s = '', n = col + 1;
    while (n) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - 1 - r) / 26; }
    return s + (row + 1);
  }

  function gridToObjects(grid, links) {
    if (grid.length < 2) throw new Error('Need a header row plus at least one data row.');
    const head = grid[0].map(h => String(h == null ? '' : h).trim());
    if (!head.some(h => /^name$/i.test(h)))
      throw new Error('No "Name" column found - is this the VISA APPLICATIONS sheet?');
    return grid.slice(1).map((r, ri) => {
      const o = {}, urls = {};
      head.forEach((h, i) => {
        if (!h) return;
        o[h] = String(r[i] == null ? '' : r[i]).trim();
        const u = links && links[cellRef(ri + 1, i)];
        if (u) urls[h] = u;
      });
      if (Object.keys(urls).length) o._links = urls;
      return o;
    }).filter(o => Object.keys(o).some(k => k !== '_links' && o[k] !== ''));
  }

  const toObjects = text => gridToObjects(parseDelimited(text, detectDelim(text)));

  // -- state -----------------------------------------------------------
  function build() {
    people = rows
      .filter(r => (r['Name'] || '').trim())
      .map(r => {
        const rec = DS160Const.apply(DS160Trip.apply(DS160.toRecord(r)));
        return { rec, val: DS160.validate(rec) };
      });
    $('loader').hidden = true;
    $('main').hidden = false;
    $('constPanel').hidden = false;
    renderConstants();
    renderList();
    if (people.length) select(0);
  }

  function accept(objects, note) {
    rows = objects;
    try { sessionStorage.setItem(STORE, JSON.stringify(rows)); } catch (e) { /* over quota, fine */ }
    $('loadMsg').textContent = note || '';
    build();
  }

  function loadText(text) {
    try { accept(toObjects(text)); }
    catch (e) { $('loadMsg').textContent = e.message; }
  }

  /* Excel keeps the sheet as a ZIP of XML, CSV is just text. Sniff the
     ZIP magic rather than trusting the file extension. */
  async function loadFile(file) {
    $('loadMsg').textContent = 'Reading ' + file.name + '...';
    try {
      const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      const isZip = head[0] === 0x50 && head[1] === 0x4b;
      if (/\.xls$/i.test(file.name) && !isZip)
        throw new Error('Old .xls files are not supported - re-save as .xlsx or CSV.');
      if (!isZip) { loadText(await file.text()); return; }

      const res = await XLSXLite.read(await file.arrayBuffer(), 'VISA APPLICATIONS');
      const rows = gridToObjects(res.grid, res.links);
      const linked = rows.filter(r => r._links && r._links['Supporting Letter']).length;
      accept(rows,
             'Loaded worksheet "' + res.name + '"' +
             (res.sheets.length > 1 ? ' of ' + res.sheets.length : '') +
             (linked ? ' - ' + linked + ' supporting letter link(s) found.' : ''));
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

  /* Trip details and constants feed validation, so an edit has to run
     the records through again rather than just repaint. */
  function rebuild() {
    const keep = selected;
    build();
    selected = Math.min(keep, people.length - 1);
    renderList();
    renderDetail();
    pendingLetter = null;   // shown by the render above; do not repeat it
  }

  // -- detail ----------------------------------------------------------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function renderDetail() {
    const p = people[selected];
    if (!p) { $('detail').innerHTML = '<div class="empty">Pick an applicant.</div>'; return; }
    const val = p.val;
    const rec = p.rec;   // constants and trip details are already merged in
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
    h += tripBlock(rec);

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

    const consts = DS160Const.active();
    if (consts.length) {
      h += '<div class="sec"><h3>Constant answers &mdash; not from the seafarer</h3><table>';
      for (const c of consts) {
        h += '<tr class="flag"><td class="k">' + esc(c.label) +
             '<br><small>' + esc(c.page) + ' &middot; ' + esc(c.why) + '</small></td>' +
             '<td class="v">' + esc(
               c.kind === 'checkbox' ? (c.value === 'YES' ? 'ticked' : 'left blank') :
               c.kind === 'toggle'   ? (c.value === 'YES' ? 'No to every question' : 'left to the agent') :
               c.value) +
             '</td><td class="a"></td></tr>';
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


  /* Everything the intake form cannot supply, at the top of the view:
     it is the first thing the agent has to deal with, and burying it
     under fourteen DS-160 sections meant nobody found it. */
  function tripBlock(rec) {
    const tv = DS160Trip.values(rec);
    let page = '', h = '<div class="sec"><h3>Trip details &mdash; this applicant</h3>' +
      '<p class="secnote">Not collected by the intake form. Stored against passport ' +
      esc(rec.passportNumber || '(none)') + '.</p>' + letterBox(rec) + '<table>';
    for (const f of DS160Trip.FIELDS) {
      if (!DS160Trip.visible(f, tv)) continue;
      if (f.page !== page) { page = f.page; h += '<tr><td class="grp" colspan="3">' + esc(page) + '</td></tr>'; }
      const v = tv[f.key] || '';
      const input = f.kind === 'yesno'
        ? '<select class="tf" data-k="' + esc(f.key) + '">' +
          ['YES', 'NO', ''].map(o => '<option value="' + o + '"' + (v === o ? ' selected' : '') + '>' +
            (o || 'leave blank') + '</option>').join('') + '</select>'
        : '<input class="tf" data-k="' + esc(f.key) + '" value="' + esc(v) + '"' +
          (f.hint ? ' title="' + esc(f.hint) + '"' : '') + '>';
      h += '<tr><td class="k">' + esc(f.label) +
           (f.hint ? '<br><small>' + esc(f.hint) + '</small>' : '') +
           '</td><td class="v" colspan="2">' + input + '</td></tr>';
    }
    h += '</table><div class="row"><select id="tripFrom"><option value="">copy from...</option>' +
         people.map((q, i) => i === selected ? '' :
           '<option value="' + i + '">' + esc(q.rec.surname + ', ' + q.rec.givenNames) + '</option>').join('') +
         '</select><button id="tripClear" class="tiny">Clear</button></div></div>';
    return h;
  }

  /* Fetching is the normal path; pasting is the fallback for when the
     link is a viewer page or the extension is not installed. */
  function letterBox(rec) {
    const url = rec.supportingLetterUrl;
    return '<div class="letter">' +
      (url
        ? '<button id="letterFetch" class="primary">Read supporting letter</button> ' +
          '<a href="' + esc(url) + '" target="_blank" rel="noopener">open it</a>'
        : '<b>No supporting letter link in this row.</b>') +
      '<span id="letterMsg"></span>' +
      '<details><summary>paste it instead</summary>' +
      '<textarea id="letterText" placeholder="Paste the whole letter"></textarea>' +
      '<button id="letterParse" class="tiny">Read pasted text</button></details></div>';
  }

  function letterMsg(kind, text) {
    const el = $('letterMsg');
    if (!el) return;
    el.className = kind;
    el.textContent = text;
  }

  function wireDetail(rec) {
    $('detail').querySelectorAll('.tf').forEach(el => {
      el.addEventListener('change', () => {
        DS160Trip.set(rec, el.dataset.k, el.value);
        rebuild();
      });
    });
    $('tripFrom').addEventListener('change', ev => {
      const i = +ev.target.value;
      if (ev.target.value === '' || !people[i]) return;
      DS160Trip.copy(people[i].rec, rec);
      rebuild();
    });
    $('tripClear').addEventListener('click', () => { DS160Trip.clear(rec); rebuild(); });

    function useLetterText(text) {
      const parsed = DS160Letter.parse(text);
      if (!parsed.found) {
        letterMsg('err', 'None of the expected lines were found - is this a C1/D supporting letter?');
        return;
      }
      const answers = DS160Letter.answers(parsed);
      for (const k in answers) DS160Trip.set(rec, k, answers[k]);
      const issues = DS160Letter.crossCheck(parsed, rec);
      pendingLetter = {
        kind: issues.length ? 'err' : 'ok',
        text: Object.keys(answers).length + ' field(s) read from the letter' +
          (parsed.missing.length ? '; not in this letter: ' + parsed.missing.join(', ') : '') +
          (issues.length ? ' — CHECK: ' + issues.map(i => i.msg).join(' | ') : ''),
      };
      rebuild();
    }

    /* The page cannot fetch a Zoho URL itself - cross-origin, and behind
       the user's login - so the extension does it and hands back bytes. */
    if ($('letterFetch')) $('letterFetch').addEventListener('click', () => {
      if (!hasExtension()) {
        letterMsg('err', 'The extension is not loaded on this page, so the letter cannot be fetched. Paste it instead.');
        return;
      }
      letterMsg('', 'Fetching the letter...');
      const id = 'f' + (letterSeq++);
      const done = ev => {
        const d = ev.data;
        if (!d || d.channel !== 'cti-ds160' || d.type !== 'fetch-letter-result' || d.id !== id) return;
        window.removeEventListener('message', done);
        clearTimeout(timer);
        if (!d.ok) { letterMsg('err', d.error || 'The letter could not be fetched.'); return; }
        letterMsg('', 'Reading ' + Math.round(d.bytes / 1024) + ' KB...');
        const bin = atob(d.b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        PDFText.extract(bytes.buffer)
          .then(useLetterText)
          .catch(e => letterMsg('err', 'Could not read the PDF: ' + e.message + '. Paste the text instead.'));
      };
      window.addEventListener('message', done);
      const timer = setTimeout(() => {
        window.removeEventListener('message', done);
        letterMsg('err', 'The extension did not answer. Reload it, refresh this page, or paste the letter.');
      }, 20000);
      window.postMessage({ channel: 'cti-ds160', type: 'fetch-letter', url: rec.supportingLetterUrl, id }, '*');
    });

    $('letterParse').addEventListener('click', () => {
      const text = $('letterText').value;
      if (!text.trim()) { letterMsg('err', 'Paste the letter text first.'); return; }
      useLetterText(text);
    });

    if (pendingLetter) letterMsg(pendingLetter.kind, pendingLetter.text);

    $('detail').querySelectorAll('.cp').forEach(b => b.addEventListener('click', () => {
      navigator.clipboard.writeText(b.dataset.v);
      b.textContent = 'copied';
      setTimeout(() => b.textContent = 'copy', 900);
    }));
    $('copyJson').addEventListener('click', () => {
      const clone = stamp(rec);
      navigator.clipboard.writeText(JSON.stringify(clone, null, 2));
      $('sendMsg').textContent = 'JSON copied.';
    });
    $('copyAll').addEventListener('click', () => {
      navigator.clipboard.writeText(worksheetText(rec));
      $('sendMsg').textContent = 'Worksheet copied.';
    });
    /* The bridge content script answers with record-ack once it has the
       record in chrome.storage. No answer means the extension is not
       actually listening on this page, whatever the badge says. */
    $('send').addEventListener('click', () => {
      const clone = stamp(rec);
      let acked = false;

      function onAck(ev) {
        if (ev.source !== window) return;
        const d = ev.data;
        if (!d || d.channel !== 'cti-ds160' || d.type !== 'record-ack') return;
        acked = true;
        window.removeEventListener('message', onAck);
        say('ok', 'Loaded: ' + (d.name || rec.fullName) +
                  '. Now open the DS-160 tab, click the extension icon, then Fill this page.');
      }
      window.addEventListener('message', onAck);
      say('', 'Sending...');
      window.postMessage({ channel: 'cti-ds160', type: 'record', record: clone }, '*');

      setTimeout(() => {
        if (acked) return;
        window.removeEventListener('message', onAck);
        say('err', 'The extension did not answer. Reload it at chrome://extensions, ' +
                   'refresh this page, then try again - or use Copy JSON.');
      }, 1200);
    });

    /* RECORD_V goes up whenever the shape the extension expects changes,
       so a record sent by an older worksheet can be spotted and resent. */
    function stamp(r) {
      const c = Object.assign({}, r);
      delete c._raw;
      c._v = RECORD_V;
      c._sentAt = new Date().toISOString();
      return c;
    }

    function say(kind, text) {
      const el = $('sendMsg');
      el.className = kind;
      el.textContent = text;
    }
  }

  const hasExtension = () => document.documentElement.getAttribute('data-ds160-extension') === '1';

  // -- constant answers -------------------------------------------------
  function renderConstants() {
    const v = DS160Const.values();
    const on = Object.values(v).filter(Boolean).length;
    $('constCount').textContent = on + ' of ' + DS160Const.CONSTANTS.length + ' answered automatically';
    $('constList').innerHTML = DS160Const.CONSTANTS.map(c => {
      const cur = v[c.key];
      const opts = c.kind === 'checkbox'
        ? [['YES', 'Tick "Does Not Apply"'], ['', 'Leave to the agent']]
        : c.kind === 'toggle'
        ? [['YES', 'Answer "No" to all'], ['', 'Leave to the agent']]
        : [['NO', 'No'], ['YES', 'Yes'], ['', 'Leave to the agent']];
      return '<div class="const"><div><b>' + esc(c.label) + '</b>' +
        '<small>' + esc(c.page) + ' &middot; ' + esc(c.why) + '</small></div>' +
        '<select data-key="' + esc(c.key) + '">' +
        opts.map(([val, txt]) =>
          '<option value="' + esc(val) + '"' + (cur === val ? ' selected' : '') + '>' + esc(txt) + '</option>'
        ).join('') + '</select></div>';
    }).join('');

    $('constList').querySelectorAll('select').forEach(sel => {
      sel.addEventListener('change', () => {
        DS160Const.set(sel.dataset.key, sel.value);
        renderConstants();
        rebuild();
      });
    });
  }

  // -- wiring ----------------------------------------------------------
  $('constReset').addEventListener('click', () => { DS160Const.reset(); renderConstants(); rebuild(); });
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
    if (f) loadFile(f);
  });
  drop.addEventListener('click', () => $('file').click());
  $('file').addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) loadFile(f);
    e.target.value = '';
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
