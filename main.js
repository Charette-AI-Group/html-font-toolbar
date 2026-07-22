'use strict';

const { Plugin, PluginSettingTab, Setting, Notice, MarkdownView, setIcon, debounce } = require('obsidian');

const DEFAULT_SETTINGS = {
    visible: true,
    customText: '#e0313a',
    customHighlight: '#ffd500',
    // Text colors chosen to stay readable on both light and dark themes
    textColors: [
        { name: 'Red', value: '#e0313a' },
        { name: 'Orange', value: '#f76707' },
        { name: 'Gold', value: '#b58900' },
        { name: 'Green', value: '#2f9e44' },
        { name: 'Blue', value: '#1c7ed6' },
        { name: 'Purple', value: '#9c36b5' },
    ],
    // Semi-transparent highlights: work in light AND dark theme without forcing a text color
    highlights: [
        { name: 'Yellow', value: 'rgba(255, 213, 0, 0.4)' },
        { name: 'Green', value: 'rgba(64, 192, 87, 0.35)' },
        { name: 'Blue', value: 'rgba(51, 154, 240, 0.35)' },
        { name: 'Pink', value: 'rgba(246, 89, 171, 0.35)' },
        { name: 'Orange', value: 'rgba(255, 146, 43, 0.4)' },
        { name: 'Purple', value: 'rgba(151, 117, 250, 0.35)' },
    ],
    // Empty value = remove the property (back to normal size / default font)
    sizes: [
        { name: 'Small', value: '0.85em' },
        { name: 'Normal', value: '' },
        { name: 'Large', value: '1.25em' },
        { name: 'XL', value: '1.6em' },
        { name: 'XXL', value: '2em' },
    ],
    fonts: [
        { name: 'Default', value: '' },
        { name: 'Serif', value: 'Georgia, serif' },
        { name: 'Mono', value: 'Consolas, monospace' },
        { name: 'Hand', value: "'Segoe Script', 'Comic Sans MS', cursive" },
    ],
};

module.exports = class HtmlFontToolbarPlugin extends Plugin {
    async onload() {
        await this.loadSettings();
        this.app.workspace.onLayoutReady(() => this.buildToolbar());
        this.addRibbonIcon('palette', 'Toggle HTML font toolbar', () => this.toggleToolbar());
        this.addCommand({
            id: 'toggle-toolbar',
            name: 'Toggle toolbar',
            callback: () => this.toggleToolbar(),
        });
        this.addSettingTab(new HtmlFontToolbarSettingTab(this.app, this));
        // Rebuild is cheap (a few dozen nodes) but debounced so typing in the
        // settings tab doesn't thrash the DOM on every keystroke.
        this.requestRebuild = debounce(() => this.rebuildToolbar(), 400, true);
    }

    onunload() {
        if (this.toolbar) this.toolbar.remove();
    }

    async loadSettings() {
        this.settings = Object.assign({}, structuredClone(DEFAULT_SETTINGS), await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    toggleToolbar() {
        this.settings.visible = !this.settings.visible;
        this.saveSettings();
        if (this.toolbar) this.toolbar.classList.toggle('hft-hidden', !this.settings.visible);
    }

    rebuildToolbar() {
        if (this.toolbar) this.toolbar.remove();
        this.buildToolbar();
    }

    // ---------- core: read selection, mutate span properties, write back ----------

    getEditor() {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        return view ? view.editor : null;
    }

    // If the selection (or just the cursor) sits inside an existing span whose markup
    // is hidden by Live Preview, grow the selection to cover the whole span so we
    // merge into it instead of nesting a new one. Handles nested spans via depth count.
    expandToSpan(ed) {
        const from = ed.getCursor('from');
        const to = ed.getCursor('to');
        if (from.line !== to.line) return;
        const text = ed.getLine(from.line);
        const tok = /<span\b[^>]*>|<\/span>/g;
        let m;
        let depth = 0;
        let start = -1;
        while ((m = tok.exec(text)) !== null) {
            if (m[0][1] === '/') {
                depth--;
                if (depth === 0 && start >= 0) {
                    const end = m.index + m[0].length;
                    if (from.ch >= start && to.ch <= end) {
                        ed.setSelection({ line: from.line, ch: start }, { line: from.line, ch: end });
                        return;
                    }
                    start = -1;
                }
                if (depth < 0) depth = 0;
            } else {
                if (depth === 0) start = m.index;
                depth++;
            }
        }
    }

    transformSpan(mutate) {
        const ed = this.getEditor();
        if (!ed) { new Notice('Open a note in editing mode first'); return; }
        this.expandToSpan(ed);
        const sel = ed.getSelection();
        if (!sel) { new Notice('Select some text first'); return; }

        let inner = sel;
        const props = {};
        // Collect properties from EVERY span layer in the selection (inner layers win),
        // then strip all span tags — this merges, and also repairs nested spans.
        if (/<span/i.test(sel)) {
            const tagRe = /<span style="([^"]*)">/g;
            let t;
            while ((t = tagRe.exec(sel)) !== null) {
                t[1].split(';').forEach((pair) => {
                    const i = pair.indexOf(':');
                    if (i > 0) props[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
                });
            }
            inner = sel.replace(/<\/?span[^>]*>/g, '');
        }

        mutate(props);

        const styleStr = Object.entries(props).map(([k, v]) => k + ':' + v).join('; ');
        const out = styleStr ? '<span style="' + styleStr + '">' + inner + '</span>' : inner;

        const start = ed.posToOffset(ed.getCursor('from'));
        ed.replaceSelection(out);
        // Re-select the result so the next button press keeps working on the same text
        ed.setSelection(ed.offsetToPos(start), ed.offsetToPos(start + out.length));
        ed.focus();
    }

    applyStyle(prop, value) {
        this.transformSpan((props) => {
            if (value === null) delete props[prop];
            else props[prop] = value;
        });
    }

    toggleStyle(prop, value) {
        this.transformSpan((props) => {
            if (props[prop] === value) delete props[prop];
            else props[prop] = value;
        });
    }

    toggleDecoration(token) {
        this.transformSpan((props) => {
            const cur = (props['text-decoration'] || '').split(/\s+/).filter(Boolean);
            const i = cur.indexOf(token);
            if (i >= 0) cur.splice(i, 1);
            else cur.push(token);
            if (cur.length) props['text-decoration'] = cur.join(' ');
            else delete props['text-decoration'];
        });
    }

    // Locate the markdown table containing the given line, if any:
    // a contiguous block of '|' lines that includes a :---|---: separator row.
    tableInfo(ed, line) {
        const isRow = (t) => t.includes('|');
        const isDelim = (t) => /^\s*\|?(\s*:?-+:?\s*\|)*\s*:?-+:?\s*\|?\s*$/.test(t);
        if (!isRow(ed.getLine(line))) return null;
        let start = line;
        while (start > 0 && isRow(ed.getLine(start - 1))) start--;
        let end = line;
        const last = ed.lineCount() - 1;
        while (end < last && isRow(ed.getLine(end + 1))) end++;
        for (let i = start; i <= end; i++) {
            if (isDelim(ed.getLine(i))) return { start, end, delim: i };
        }
        return null;
    }

    // In a table, alignment lives in the separator row and applies per COLUMN
    // (that is markdown's native table alignment: :--- / :---: / ---:).
    alignTableColumn(ed, info, from, align) {
        const text = ed.getLine(from.line);
        let col = (text.slice(0, from.ch).match(/\|/g) || []).length;
        if (text.trimStart().startsWith('|')) col--;
        if (col < 0) col = 0;
        const dText = ed.getLine(info.delim);
        const hasLead = dText.trimStart().startsWith('|');
        const hasTrail = dText.trimEnd().endsWith('|');
        let cells = dText.trim();
        if (hasLead) cells = cells.slice(1);
        if (hasTrail) cells = cells.slice(0, -1);
        const parts = cells.split('|');
        if (col >= parts.length) col = parts.length - 1;
        const marker = align === 'center' ? ':---:' : align === 'right' ? '---:' : '---';
        parts[col] = ' ' + marker + ' ';
        const out = (hasLead ? '|' : '') + parts.join('|') + (hasTrail ? '|' : '');
        ed.replaceRange(out, { line: info.delim, ch: 0 }, { line: info.delim, ch: dText.length });
        new Notice('Aligned table column (tables align per column)');
        // Live Preview caches table alignment; rebuild the view so the change shows
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view && view.leaf && typeof view.leaf.rebuildView === 'function') {
            const pos = { line: from.line, ch: from.ch };
            Promise.resolve(view.leaf.rebuildView()).then(() => {
                const v2 = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (v2 && v2.editor) v2.editor.setCursor(pos);
            });
        } else {
            ed.focus();
        }
    }

    // Alignment is a paragraph property: applies to every whole line the
    // selection/cursor touches. 'left' unwraps (left is the default).
    // Inside a table it switches to markdown's per-column alignment instead.
    setAlignment(align) {
        const ed = this.getEditor();
        if (!ed) { new Notice('Open a note in editing mode first'); return; }
        const from = ed.getCursor('from');
        const to = ed.getCursor('to');

        const table = this.tableInfo(ed, from.line);
        if (table) {
            const sel = ed.getSelection();
            if (sel && from.line === to.line) {
                // A selection inside a cell: align just that piece with an HTML
                // block (tables have no per-cell alignment, but HTML inside a
                // cell renders fine). 'left' unwraps.
                const m = sel.match(/^<(?:p|div)[^>]*text-align[^>]*>([\s\S]*)<\/(?:p|div)>$/);
                const inner = m ? m[1] : sel;
                const out = align === 'left'
                    ? inner
                    : '<p style="text-align:' + align + '">' + inner + '</p>';
                const start = ed.posToOffset(from);
                ed.replaceSelection(out);
                ed.setSelection(ed.offsetToPos(start), ed.offsetToPos(start + out.length));
                ed.focus();
                return;
            }
            this.alignTableColumn(ed, table, from, align);
            return;
        }

        const wrapRe = /^<div style="text-align:(left|center|right)">([\s\S]*)<\/div>\s*$/;
        for (let ln = from.line; ln <= to.line; ln++) {
            if (this.tableInfo(ed, ln)) continue; // never wrap table rows in a div
            const text = ed.getLine(ln);
            const m = text.match(wrapRe);
            const inner = m ? m[2] : text;
            if (!inner.trim()) continue;
            const out = align === 'left'
                ? inner
                : '<div style="text-align:' + align + '">' + inner + '</div>';
            if (out !== text) {
                ed.replaceRange(out, { line: ln, ch: 0 }, { line: ln, ch: text.length });
            }
        }
        ed.focus();
    }

    clearFormatting() {
        const ed = this.getEditor();
        if (!ed) { new Notice('Open a note in editing mode first'); return; }
        this.expandToSpan(ed);
        const sel = ed.getSelection();
        if (!sel) { new Notice('Select some text first'); return; }
        const out = sel.replace(/<[^>]+>/g, '');
        const start = ed.posToOffset(ed.getCursor('from'));
        ed.replaceSelection(out);
        ed.setSelection(ed.offsetToPos(start), ed.offsetToPos(start + out.length));
        ed.focus();
    }

    // ---------- toolbar UI ----------

    buildToolbar() {
        const bar = document.createElement('div');
        bar.className = 'hft-toolbar';
        this.toolbar = bar;

        // Buttons live inside no-wrap groups: if the toolbar is too narrow it wraps
        // BETWEEN groups, never in the middle of one.
        const mkGroup = () => {
            const g = document.createElement('div');
            g.className = 'hft-group';
            bar.appendChild(g);
            return g;
        };

        const mkBtn = (group, title, onClick, cls) => {
            const b = document.createElement('button');
            b.className = 'hft-btn' + (cls ? ' ' + cls : '');
            b.title = title;
            // preventDefault on mousedown so the editor keeps focus + selection
            b.addEventListener('mousedown', (e) => e.preventDefault());
            b.addEventListener('click', onClick);
            group.appendChild(b);
            return b;
        };

        // Custom color = a real apply-button (click applies the remembered color, like
        // any preset) + a small ▾ that opens the OS picker to change the stored color.
        const mkCustomColor = (group, prop) => {
            const isText = prop === 'color';
            const key = isText ? 'customText' : 'customHighlight';
            const apply = mkBtn(
                group,
                (isText ? 'Custom text color' : 'Custom highlight') + ' (▾ to change it)',
                () => this.applyStyle(prop, this.settings[key]),
                isText ? 'hft-a' : 'hft-swatch'
            );
            const paint = () => {
                if (isText) {
                    apply.textContent = 'A';
                    apply.style.color = this.settings[key];
                } else {
                    apply.style.backgroundColor = this.settings[key];
                }
            };
            paint();
            const inp = document.createElement('input');
            inp.type = 'color';
            inp.className = 'hft-hidden-color';
            inp.value = this.settings[key];
            inp.addEventListener('change', () => {
                this.settings[key] = inp.value;
                this.saveSettings();
                paint();
                this.applyStyle(prop, inp.value);
            });
            group.appendChild(inp);
            const caret = mkBtn(
                group,
                'Pick custom ' + (isText ? 'text color' : 'highlight color'),
                () => inp.click(),
                'hft-caret'
            );
            caret.textContent = '▾';
        };

        const mkSelect = (group, placeholder, items, prop) => {
            const sel = document.createElement('select');
            sel.className = 'hft-select dropdown';
            sel.title = placeholder;
            const ph = new Option(placeholder, '');
            ph.disabled = true;
            ph.selected = true;
            sel.add(ph);
            items.forEach((item, idx) => sel.add(new Option(item.name, String(idx))));
            sel.addEventListener('change', () => {
                const idx = Number(sel.value);
                this.applyStyle(prop, items[idx].value || null);
                sel.selectedIndex = 0;
            });
            group.appendChild(sel);
        };

        // Text colors
        let g = mkGroup();
        for (const { name, value } of this.settings.textColors) {
            const b = mkBtn(g, 'Text color: ' + name, () => this.applyStyle('color', value), 'hft-a');
            b.textContent = 'A';
            b.style.color = value;
        }
        mkCustomColor(g, 'color');

        // Highlights
        g = mkGroup();
        for (const { name, value } of this.settings.highlights) {
            const b = mkBtn(g, 'Highlight: ' + name, () => this.applyStyle('background-color', value), 'hft-swatch');
            b.style.backgroundColor = value;
        }
        mkCustomColor(g, 'background-color');

        // Bold / Italic / Underline / Strikethrough (as span styles, so they merge too)
        g = mkGroup();
        mkBtn(g, 'Bold', () => this.toggleStyle('font-weight', 'bold'), 'hft-b').textContent = 'B';
        mkBtn(g, 'Italic', () => this.toggleStyle('font-style', 'italic'), 'hft-i').textContent = 'I';
        mkBtn(g, 'Underline', () => this.toggleDecoration('underline'), 'hft-u').textContent = 'U';
        mkBtn(g, 'Strikethrough', () => this.toggleDecoration('line-through'), 'hft-s').textContent = 'S';

        // Alignment (whole-line: cursor anywhere in the paragraph is enough)
        g = mkGroup();
        setIcon(mkBtn(g, 'Align left (removes alignment)', () => this.setAlignment('left')), 'align-left');
        setIcon(mkBtn(g, 'Align center', () => this.setAlignment('center')), 'align-center');
        setIcon(mkBtn(g, 'Align right', () => this.setAlignment('right')), 'align-right');

        // Size + font dropdowns
        g = mkGroup();
        mkSelect(g, 'Size', this.settings.sizes, 'font-size');
        mkSelect(g, 'Font', this.settings.fonts, 'font-family');

        // Clear formatting + hide toolbar
        g = mkGroup();
        const clear = mkBtn(g, 'Clear all formatting (strip HTML tags)', () => this.clearFormatting());
        setIcon(clear, 'eraser');
        const close = mkBtn(g, 'Hide toolbar (palette icon in the left ribbon brings it back)', () => this.toggleToolbar());
        close.textContent = '×';

        document.body.appendChild(bar);
        if (!this.settings.visible) bar.classList.add('hft-hidden');
    }
};

class HtmlFontToolbarSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    save() {
        this.plugin.saveSettings();
        this.plugin.requestRebuild();
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Show toolbar')
            .setDesc('The palette ribbon icon and the "Toggle toolbar" command toggle this too.')
            .addToggle((t) => t
                .setValue(this.plugin.settings.visible)
                .onChange((v) => {
                    if (v !== this.plugin.settings.visible) this.plugin.toggleToolbar();
                }));

        this.listSection({
            key: 'textColors',
            heading: 'Text colors',
            desc: 'Preset text-color buttons shown on the toolbar.',
            picker: true,
            valuePlaceholder: '#e0313a',
            addItem: () => ({ name: 'Color', value: '#e0313a' }),
        });

        this.listSection({
            key: 'highlights',
            heading: 'Highlights',
            desc: 'Preset highlight swatches. Any CSS color works; semi-transparent rgba() colors stay readable in both light and dark themes.',
            picker: true,
            valuePlaceholder: 'rgba(255, 213, 0, 0.4)',
            addItem: () => ({ name: 'Highlight', value: 'rgba(255, 213, 0, 0.4)' }),
        });

        this.listSection({
            key: 'sizes',
            heading: 'Font sizes',
            desc: 'Entries in the Size dropdown. Relative em units scale with the theme (e.g. 1.25em). Leave the value empty to make an entry that resets to normal size.',
            valuePlaceholder: '1.25em',
            addItem: () => ({ name: 'Size', value: '1.25em' }),
        });

        this.listSection({
            key: 'fonts',
            heading: 'Fonts',
            desc: 'Entries in the Font dropdown. The value is a CSS font-family list (e.g. Georgia, serif). Leave the value empty to make an entry that resets to the default font.',
            valuePlaceholder: 'Georgia, serif',
            addItem: () => ({ name: 'Font', value: 'Georgia, serif' }),
        });
    }

    listSection({ key, heading, desc, picker, valuePlaceholder, addItem }) {
        const { containerEl } = this;
        const items = this.plugin.settings[key];

        new Setting(containerEl)
            .setName(heading)
            .setDesc(desc)
            .setHeading()
            .addExtraButton((b) => b
                .setIcon('rotate-ccw')
                .setTooltip('Restore default ' + heading.toLowerCase())
                .onClick(() => {
                    this.plugin.settings[key] = structuredClone(DEFAULT_SETTINGS[key]);
                    this.save();
                    this.display();
                }));

        items.forEach((item, idx) => {
            const row = new Setting(containerEl);
            row.settingEl.addClass('hft-setting-row');
            row.addText((t) => t
                .setPlaceholder('Name')
                .setValue(item.name)
                .onChange((v) => {
                    item.name = v;
                    this.save();
                }));
            let valueText;
            row.addText((t) => {
                valueText = t;
                t.setPlaceholder(valuePlaceholder)
                    .setValue(item.value)
                    .onChange((v) => {
                        item.value = v.trim();
                        this.save();
                    });
                t.inputEl.addClass('hft-setting-value');
            });
            if (picker) {
                // The picker only speaks hex; it writes into the text field so
                // rgba() values typed by hand are still allowed.
                row.addColorPicker((c) => c
                    .setValue(/^#[0-9a-f]{6}$/i.test(item.value) ? item.value : '#000000')
                    .onChange((v) => {
                        item.value = v;
                        valueText.setValue(v);
                        this.save();
                    }));
            }
            row.addExtraButton((b) => b
                .setIcon('trash-2')
                .setTooltip('Remove')
                .onClick(() => {
                    items.splice(idx, 1);
                    this.save();
                    this.display();
                }));
        });

        new Setting(containerEl)
            .addButton((b) => b
                .setButtonText('Add')
                .onClick(() => {
                    items.push(addItem());
                    this.save();
                    this.display();
                }));
    }
}
