import { readFileSync } from 'node:fs';

const [version] = process.argv.slice(2);
if (!version) {
  console.error('Usage: node scripts/release-notes.mjs <version>');
  process.exit(1);
}

const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const headings = [...changelog.matchAll(/^## \[([^\]\r\n]+)\](?: - (\d{4}-\d{2}-\d{2}))?\r?$/gm)];
const matches = headings.filter(heading => heading[1] === version && heading[2]);
if (matches.length !== 1) {
  console.error(`Expected one dated changelog entry for ${version}.`);
  process.exit(1);
}

const heading = matches[0];
const nextHeading = headings[headings.indexOf(heading) + 1];
const body = changelog
  .slice(heading.index + heading[0].length, nextHeading?.index)
  .split(/^\[(?:Unreleased|\d[^\]\r\n]*)\]:\s+https?:\/\//m, 1)[0]
  .trim();

if (!body) {
  console.error(`The changelog entry for ${version} is empty.`);
  process.exit(1);
}

process.stdout.write(body + '\n');
