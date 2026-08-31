/* The extension's fetch rules: which hosts it will touch, and which
   URLs it tries for a WorkDrive link. Run: node test/background.test.js

   background.js is a service worker, so the two pure pieces are lifted
   out of the source rather than imported. */
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'extension', 'background.js'), 'utf8');
// A `const`/`function` declared inside eval() stays inside it, so the
// values are pulled out as expressions.
const ALLOWED = eval(src.match(/const ALLOWED = ([^\n]+);\s*\n/)[1]);
const candidates = eval('(' + src.match(/function candidates\(url\)[\s\S]*?\n\}/)[0] + ')');

let pass = 0, fail = 0;
function eq(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++;
  else { fail++; console.log('FAIL ' + label + '\n  got  ' + g + '\n  want ' + w); }
}

// -- only Zoho, only https --------------------------------------------
eq('workdrive allowed', ALLOWED.test('https://workdrive.zoho.com/file/abc'), true);
eq('download host allowed', ALLOWED.test('https://download-accl.zoho.com/v1/workdrive/download/abc'), true);
eq('regional zoho allowed', ALLOWED.test('https://workdrive.zoho.eu/file/abc'), true);
eq('other hosts refused', ALLOWED.test('https://evil.example.com/x.pdf'), false);
eq('lookalike host refused', ALLOWED.test('https://zoho.com.evil.example/x.pdf'), false);
eq('plain http refused', ALLOWED.test('http://workdrive.zoho.com/file/abc'), false);

// -- a /file/<id> link is a viewer, so the download endpoints follow ---
const viewer = 'https://workdrive.zoho.com/file/bvdhvc466bf2bef1849ad8aeeeaa083d34ce0';
eq('workdrive candidates', candidates(viewer), [
  viewer,
  'https://download-accl.zoho.com/v1/workdrive/download/bvdhvc466bf2bef1849ad8aeeeaa083d34ce0',
  viewer + '/download',
]);
eq('a direct file url is tried as-is',
   candidates('https://zoho.com/letters/SL-DANIEL.pdf'), ['https://zoho.com/letters/SL-DANIEL.pdf']);
eq('trailing slash does not double up',
   candidates('https://workdrive.zoho.com/file/abc123/')[2], 'https://workdrive.zoho.com/file/abc123/download');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
