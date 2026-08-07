// repo.test.js: repo hygiene.
//
// The things that are easy to leave inconsistent and embarrassing to ship that way:
// a version that disagrees with itself, a missing licence, a stray build directory
// that made it into a commit.

const { makeReporter, DIR } = require('./harness');
const fs = require('fs');
const path = require('path');

const r = makeReporter();

const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

// ── 1. the name and version agree everywhere they are shown ──
r.section('1. Name and version are consistent');

const manifest = JSON.parse(read('manifest.json'));
const pkg = JSON.parse(read('package.json'));

r.eq(manifest.name, 'HideLLM', 'manifest name');
r.eq(pkg.name, 'hidellm', 'package name');
r.eq(manifest.version, pkg.version, `manifest and package versions agree (${manifest.version})`);
r.ok(/^\d+\.\d+\.\d+$/.test(manifest.version), 'the version is semver');

for (const page of ['src/popup/popup.html', 'src/options/options.html']) {
  const title = read(page).match(/<title>([^<]*)<\/title>/)?.[1] || '';
  r.ok(/HideLLM/.test(title), `${page}: the window title is branded`);
}

r.ok(read('README.md').includes('# HideLLM'), 'README leads with the product name');
r.ok(read('CHANGELOG.md').includes(manifest.version), 'the changelog has an entry for the current version');

// ── 2. the files an open-source repo needs ──
r.section('2. Open-source paperwork is present');
for (const file of [
  'README.md',
  'LICENSE',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md',
  'SECURITY.md',
  'PRIVACY.md',
  'package.json',
  '.editorconfig',
  '.gitignore',
  'docs/ARCHITECTURE.md',
  'docs/THEMES.md',
  '.github/workflows/ci.yml',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/ISSUE_TEMPLATE/bug_report.yml',
]) {
  r.ok(fs.existsSync(path.join(DIR, file)), `${file} exists`);
}

r.ok(read('LICENSE').includes('MIT License'), 'the licence is MIT');

// ── 3. no build or tooling output is tracked ──
r.section('3. No development artefacts are tracked');
const ignored = read('.gitignore');
for (const junk of ['dist', 'node_modules']) {
  r.ok(!fs.existsSync(path.join(DIR, junk)) || ignored.includes(junk), `${junk} is absent or ignored`);
}

r.finish();
