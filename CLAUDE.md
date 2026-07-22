# HTML Font Toolbar — Obsidian community plugin

Obsidian plugin (plain JS, no build step: `main.js` + `styles.css` + `manifest.json` at repo root) being prepared for submission to the official Obsidian community-plugin directory.

## What it does
Floating toolbar that styles selected text with inline HTML spans (color, highlight, size, font, B/I/U/S, alignment). Key differentiator: all formatting **merges into a single span** — it detects existing spans (even when Live Preview hides markup), edits them in place, and repairs nested spans. Alignment is context-aware: paragraph → div wrap; table cursor → markdown column markers (then forces `leaf.rebuildView()` because Live Preview caches table alignment); table selection → `<p style="text-align:...">` around the fragment.

## Development workflow
- Live-test in the author's vault: run `scripts/syncToVault.ps1` (copies the 3 files to `myJourney/.obsidian/plugins/html-font-toolbar/`), then reload Obsidian ("Reload app without saving").
- Version bumps: update `manifest.json` version + add entry to `versions.json`. Releases: push a git tag → `.github/workflows/release.yml` attaches the 3 files.
- Target app: user runs Obsidian **1.12.7, the latest PUBLIC version as of 2026-07** (1.13.x is Catalyst early-access only). `minAppVersion` is 1.12.0. Do not use APIs newer than 1.12.

## Business decisions (already made)
- Author: **Charette AI Group** (legal: Charette AI Group, LLC), site https://charette-ai-group.github.io/web/
- Funding: PayPal `https://www.paypal.com/donate/?hosted_button_id=FEM4WLD7LHY36` (same button as saeCalculator project)
- GitHub: account FrancoisCharette, repo `Charette-AI-Group/html-font-toolbar` (created 2026-07-21)
- Name: **FINAL — "HTML Font Toolbar"** (id `html-font-toolbar`), confirmed by user 2026-07-21.

## Remaining roadmap (in order)
1. ~~Settings tab~~ — done in 1.7.0 (customizable text colors, highlights, sizes, fonts; restore-defaults per section)
2. ~~Create GitHub repo under org + push~~ — done 2026-07-21
3. Screenshots/GIF for README
4. Mobile check (toolbar vs on-screen keyboard) or set `isDesktopOnly: true` for v1
5. Detail page as the "third card" on the company website (repo `web` under the org): benefits, instructions, screenshots, donation button
6. Review against https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines then submit PR to `obsidianmd/obsidian-releases`

## Conventions
- Plain JS (`require('obsidian')`), 4-space indent, no bundler — keep it dependency-free
- CSS uses Obsidian theme variables (`--background-secondary`, etc.) so it adapts to themes
