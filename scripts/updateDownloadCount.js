/*
 * Records this plugin's download count, so a page elsewhere can show it
 * without pulling a 2 MB file on every visit.
 *
 * The number comes from community-plugin-stats.json in obsidian-releases,
 * which Obsidian rewrites daily just after 00:15 UTC. It is the exact figure,
 * and it trails Obsidian's own counter by a day or two.
 *
 * This script used to read the plugin's community directory page instead,
 * because that page was fresher: on 2026-08-11 it showed 393 while the file
 * said 342. That stopped working the moment the count passed a thousand - the
 * page now renders "1k", and would go on saying "1k" until it reached 2k. A
 * rounded current number is worth less than an exact stale one, so the file
 * won. The guard caught it rather than writing 1, which is the whole reason
 * this script refuses to parse anything it is unsure of.
 *
 * Writes stats/downloads.json, and only when the number changed, so this does
 * not add a commit a day. Run daily by .github/workflows/downloadCount.yml,
 * or by hand:
 *
 *   node scripts/updateDownloadCount.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const STATS_URL =
  'https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugin-stats.json';

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

async function main() {
  const plugin = pluginId();

  const response = await fetch(STATS_URL, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`stats file returned ${response.status}`);
  }

  const entry = (await response.json())[plugin];
  if (!entry) {
    throw new Error(`${plugin} is not listed in the stats file`);
  }
  const downloads = entry.downloads;
  if (!Number.isInteger(downloads) || downloads < 0) {
    throw new Error(`${plugin} has no usable download count (${JSON.stringify(downloads)})`);
  }

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
      { plugin, downloads, updated: new Date().toISOString(), source: STATS_URL },
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
