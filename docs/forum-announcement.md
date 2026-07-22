# Forum announcement draft

Post to https://forum.obsidian.md/c/share-showcase/9 **once the plugin is accepted**
into the community directory (the Browse install path below only works after that).
For Discord `#updates` (requires the developer role), use the first two paragraphs
plus the links.

## Title

HTML Font Toolbar — Word-like formatting that stays one clean HTML span

## Body

Hi everyone! I'd like to share my first Obsidian plugin: **HTML Font Toolbar**, a floating formatting toolbar for text colors, highlights, font sizes, font families, bold/italic/underline/strikethrough, and alignment.

![The floating toolbar over a note](https://raw.githubusercontent.com/Charette-AI-Group/html-font-toolbar/main/docs/toolbarOn.png)

**What makes it different from other formatting plugins?** Everything it produces is *one clean inline HTML span*. Markdown formatting and HTML styling don't nest predictably — mix a highlight plugin with a color plugin and you get conflicting wrappers. This plugin stays in one layer instead:

- Select a word → click red → click yellow highlight → click Large → click **B**
- Result: `<span style="color:#e0313a; background-color:rgba(255,213,0,0.4); font-size:1.25em; font-weight:bold">word</span>`

One span, never nested. Click inside an already-styled word and press another button — the plugin finds the existing span (even when Live Preview hides the markup), edits it in place, and even repairs pre-existing nested spans. And because the output is plain inline HTML, your notes render identically if you ever remove the plugin.

**Other things it does:**

- Semi-transparent highlight presets that stay readable in both light and dark themes
- Table-aware alignment: aligns paragraphs, whole markdown table columns (`:---:`), or just a selected fragment inside a cell
- Every preset is customizable in the settings tab — add, rename, or recolor colors, highlights, sizes, and fonts, with one-click restore of defaults
- Clear-formatting eraser, ribbon/command/hotkey toggle, and release assets with GitHub artifact attestations

![The settings tab with editable presets](https://raw.githubusercontent.com/Charette-AI-Group/html-font-toolbar/main/docs/toolbarSettings.png)

**Install:** search for "HTML Font Toolbar" in Settings → Community plugins → Browse (desktop only for now), or grab it from the [GitHub releases](https://github.com/Charette-AI-Group/html-font-toolbar/releases/latest).

**Links:** [GitHub repo](https://github.com/Charette-AI-Group/html-font-toolbar) · [Plugin page](https://charette-ai-group.github.io/web/htmlFontToolbar.html) · [Donate](https://www.paypal.com/donate/?hosted_button_id=FEM4WLD7LHY36)

This is v1 — feedback, bug reports, and feature ideas are very welcome, here or on the [GitHub issues](https://github.com/Charette-AI-Group/html-font-toolbar/issues). Thanks for reading!
