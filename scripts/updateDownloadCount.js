/*
 * Records this plugin's download count, so a page elsewhere can show a number
 * that matches the community directory.
 *
 * Obsidian publishes community-plugin-stats.json in the obsidian-releases
 * repo, but that file trails the figure on the plugin's own directory page.
 * Measured on 2026-08-11, the file said 342 while the directory said 393, and
 * it had not moved at all over the previous day. The directory page carries
 * the current number in its server-rendered HTML, and a workflow may read it
 * because CORS restricts browsers, not servers.
 *
 * Writes stats/downloads.json, and only when the number actually changed, so
 * this does not add a commit a day. Run daily by
 * .github/workflows/downloadCount.yml, or by hand:
 *
 *   node scripts/updateDownloadCount.js
 *
 * It is deliberately noisy. Scraping a page nobody promised to keep stable is
 * the price of a current number, so every check that fails throws instead of
 * writing a value it is not sure of: a broken read stops the workflow rather
 * than quietly publishing a wrong count.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outputFile = path.join(root, 'stats', 'downloads.json');

function pluginId() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  if (!manifest.id) {
    throw new Error('manifest.json has no id');
  }
  return manifest.id;
}

function previousCount() {
  try {
    return JSON.parse(fs.readFileSync(outputFile, 'utf8')).downloads;
  } catch (error) {
    return null; // First run, or the file was deliberately removed.
  }
}

function extractCount(html) {
  // The figure sits just before the word "downloads" in the rendered banner:
  //   </svg>393<!-- -->&nbsp;downloads</span>
  // The comment is React's marker between adjacent text nodes and the space is
  // a non-breaking one, so both are normalised away before matching rather
  // than written into the pattern.
  const text = html.replace(/<!-- -->/g, '').replace(/&nbsp;| /g, ' ');
  const matches = [...text.matchAll(/([\d,]+)\s*downloads/gi)]
    .map((match) => Number(match[1].replace(/,/g, '')))
    .filter((value) => Number.isInteger(value));

  if (matches.length === 0) {
    throw new Error('no "<number> downloads" on the page - its markup has changed');
  }
  const distinct = [...new Set(matches)];
  if (distinct.length > 1) {
    throw new Error(`the page offers several download counts (${distinct.join(', ')})`);
  }
  return distinct[0];
}

async function main() {
  const plugin = pluginId();
  const source = `https://community.obsidian.md/plugins/${plugin}`;

  const response = await fetch(source, { headers: { Accept: 'text/html' } });
  if (!response.ok) {
    throw new Error(`${source} returned ${response.status}`);
  }

  const downloads = extractCount(await response.text());
  const previous = previousCount();

  // Downloads only ever accumulate, so a fall means the number was misread.
  if (previous !== null && downloads < previous) {
    throw new Error(`count fell from ${previous} to ${downloads} - refusing to write it`);
  }

  if (downloads === previous) {
    console.log(`${plugin}: unchanged at ${downloads}`);
    return;
  }

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(
    outputFile,
    JSON.stringify(
      { plugin, downloads, updated: new Date().toISOString(), source },
      null,
      2
    ) + '\n'
  );
  console.log(`${plugin}: ${previous === null ? 'first run, ' : `was ${previous}, `}now ${downloads}`);
}

main().catch((error) => {
  console.error(`updateDownloadCount: ${error.message}`);
  process.exit(1);
});
