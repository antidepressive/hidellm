// run.js: the whole test suite. `node test/run.js` (or `npm test`) from the repo
// root. No framework, no dependencies, nothing to install.
//
// Each suite stubs chrome.* and loads the real extension source, so what's being
// tested is the code that ships.

const { execFileSync } = require('child_process');
const path = require('path');

const SUITES = [
  'core.test.js',   // themes, site matching, settings, the stylesheet builder
  'worker.test.js', // the service worker, driven through real Chrome events
  'ui.test.js',     // the popup and options page in a stub DOM
  'repo.test.js',   // repo hygiene: docs, licence, versions
];

let failed = [];

for (const suite of SUITES) {
  console.log(`\n══════════ ${suite} ══════════`);
  try {
    execFileSync(process.execPath, [path.join(__dirname, suite)], { stdio: 'inherit' });
  } catch {
    failed.push(suite);
  }
}

if (failed.length) {
  console.log(`\n✗ FAILED: ${failed.join(', ')}\n`);
  process.exit(1);
}

console.log('\n✓ all suites passed\n');
