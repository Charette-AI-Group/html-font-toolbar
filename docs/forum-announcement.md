# Forum announcement draft

Post to https://forum.obsidian.md/c/share-showcase/9 (Share & showcase).

**IMPORTANT — the category has a required template.** When you click "+ New Topic"
in Share & showcase, Discourse pre-fills the body with that template. Keep it and
fill in the fields; do NOT paste over it. The composer's version is authoritative
if it differs from the reconstruction below. Leaving a placeholder (e.g. "xyz") or
omitting the disclaimer gets the post rejected by moderators.

The disclaimer block and the community directory link must both be present.

For Discord `#updates` (requires the developer role), use the intro paragraph plus
the links; the disclaimer template is forum-only.

## Title

HTML Font Toolbar — Word-like formatting that stays one clean HTML span

## Body

## Disclaimer

> Is this project **open source**? Yes
> Is this project completely **free**? Yes
> Is this project **vibe-coded** beyond the author's ability to comprehend how it works? No

---

[HTML Font Toolbar on the Community Directory](https://community.obsidian.md/plugins/html-font-toolbar)

Hi everyone! I'd like to share my first Obsidian plugin: **HTML Font Toolbar**, a floating formatting toolbar for text colors, highlights, font sizes, font families, bold/italic/underline/strikethrough, symbols, alignment, and indentation.

![The floating toolbar over a note](https://raw.githubusercontent.com/Charette-AI-Group/html-font-toolbar/main/docs/toolbarOn.png)

**What makes it different from other formatting plugins?** Everything it produces is *one clean inline HTML span*. Markdown formatting and HTML styling don't nest predictably — mix a highlight plugin with a color plugin and you get conflicting wrappers. This plugin stays in one layer instead:

- Select a word → click red → click yellow highlight → click Large → click **B**
- Result: `<span style="color:#e0313a; background-color:rgba(255,213,0,0.4); font-size:1.25em; font-weight:bold">word</span>`

One span, never nested. Click inside an already-styled word and press another button — the plugin finds the existing span (even when Live Preview hides the markup), edits it in place, and even repairs pre-existing nested spans. And because the output is plain inline HTML, your notes render identically if you ever remove the plugin.

**Other things it does:**

- Precise partial restyling: select any stretch of an already-styled sentence — even across differently-styled parts — and style just that; spans split and re-merge automatically, and markdown links in the selection keep working
- Semi-transparent highlight presets that stay readable in both light and dark themes
- Table-aware alignment: aligns paragraphs, whole markdown table columns (`:---:`), a selected fragment inside a cell, or image embeds — plus paragraph indent/outdent in 2em steps
- A symbol picker (Ω) with searchable groups — math, Greek, arrows, punctuation, currency, marks — and a recently-used row; characters insert at the cursor and inherit the styling around them
- Every button toggles: press the color, highlight, or B/I/U/S you already have to remove just that property
- Every preset is customizable in the settings tab — add, rename, or recolor colors, highlights, sizes, fonts, and symbol groups, with one-click restore of defaults

![The settings tab with editable presets](https://raw.githubusercontent.com/Charette-AI-Group/html-font-toolbar/main/docs/toolbarSettings.png)

**Install:** search for "HTML Font Toolbar" in Settings → Community plugins → Browse (desktop only for now).

**Links:** [GitHub repo](https://github.com/Charette-AI-Group/html-font-toolbar) · [Plugin page](https://charette-ai-group.github.io/web/htmlFontToolbar.html)

This is v1 — feedback, bug reports, and feature ideas are very welcome, here or on the [GitHub issues](https://github.com/Charette-AI-Group/html-font-toolbar/issues). Thanks for reading!
