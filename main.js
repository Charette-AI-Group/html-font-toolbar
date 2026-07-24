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

// Parse #rgb / #rrggbb / rgb() / rgba() into { hex, alpha } so the settings
// color picker (hex-only) can preview and edit semi-transparent values.
function parseCssColor(value) {
    let m = /^#([0-9a-f]{6})$/i.exec(value);
    if (m) return { hex: '#' + m[1].toLowerCase(), alpha: 1 };
    m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
    if (m) return { hex: ('#' + m[1] + m[1] + m[2] + m[2] + m[3] + m[3]).toLowerCase(), alpha: 1 };
    m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(value);
    if (m) {
        const h = (n) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0');
        return { hex: '#' + h(m[1]) + h(m[2]) + h(m[3]), alpha: m[4] === undefined ? 1 : Number(m[4]) };
    }
    return null;
}

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

    // Wrap text in a styled span, keeping markdown links and embeds OUTSIDE
    // the span: link syntax inside inline HTML stops rendering as a link, so
    // the output alternates spans and bare links instead.
    wrapStyled(text, styleStr) {
        if (!styleStr) return text;
        const linkRe = /!?\[\[[^\]]*\]\]|!?\[[^\]]*\]\([^)]*\)/g;
        let out = '';
        let last = 0;
        let m;
        while ((m = linkRe.exec(text)) !== null) {
            if (m.index > last) out += '<span style="' + styleStr + '">' + text.slice(last, m.index) + '</span>';
            out += m[0];
            last = m.index + m[0].length;
        }
        if (last < text.length) out += '<span style="' + styleStr + '">' + text.slice(last) + '</span>';
        return out;
    }

    // Live Preview does not render a span/div that closes at the very end of
    // the note until another character follows it — add a trailing newline.
    padDocEnd(ed, line) {
        if (line !== ed.lineCount() - 1) return;
        const text = ed.getLine(line);
        if (/<\/(?:span|div|p)>\s*$/.test(text)) {
            ed.replaceRange('\n', { line, ch: text.length }, { line, ch: text.length });
        }
    }

    parseStyleProps(s) {
        const p = {};
        s.split(';').forEach((pair) => {
            const i = pair.indexOf(':');
            if (i > 0) p[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
        });
        return p;
    }

    // Tokenize a stretch of text into runs: plain text and top-level flat
    // spans. Returns null when the markup is nested or unbalanced, so callers
    // fall back to the whole-span repair path.
    parseRuns(text) {
        const runs = [];
        const tok = /<span\b[^>]*>|<\/span>/g;
        let m;
        let depth = 0;
        let spanStart = -1;
        let openTag = '';
        let plain = 0;
        while ((m = tok.exec(text)) !== null) {
            if (m[0][1] === '/') {
                depth--;
                if (depth < 0) return null;
                if (depth === 0) {
                    const sm = openTag.match(/^<span style="([^"]*)">$/i);
                    if (!sm) return null;
                    runs.push({
                        span: true,
                        start: spanStart,
                        end: m.index + m[0].length,
                        innerStart: spanStart + openTag.length,
                        innerEnd: m.index,
                        props: this.parseStyleProps(sm[1]),
                    });
                    plain = m.index + m[0].length;
                }
            } else {
                if (depth > 0) return null; // nested spans: repair path instead
                if (m.index > plain) runs.push({ span: false, start: plain, end: m.index, props: {} });
                spanStart = m.index;
                openTag = m[0];
                depth++;
            }
        }
        if (depth !== 0) return null;
        if (text.length > plain) runs.push({ span: false, start: plain, end: text.length, props: {} });
        return runs;
    }

    // Apply `mutate` to exactly the selected stretch of a line, preserving the
    // distinct styles of every span it touches. Handles selections inside a
    // span, across span boundaries, and over plain text in one pass, emitting
    // flat sibling spans (splitting and re-merging as needed). Returns false
    // when the shape is unsupported (no selection, multi-line, nested spans,
    // embedded block tags) so the caller can fall back.
    styleRange(ed, mutate) {
        const from = ed.getCursor('from');
        const to = ed.getCursor('to');
        if (from.line !== to.line || from.ch === to.ch) return false;
        const line = from.line;
        const text = ed.getLine(line);
        let regionStart = 0;
        let prefix = '';
        let suffix = '';
        const dm = text.match(/^(<(?:div|p) style="text-align:(?:left|center|right)">)([\s\S]*)(<\/(?:div|p)>)$/i);
        if (dm) {
            prefix = dm[1];
            suffix = dm[3];
            regionStart = prefix.length;
        }
        const region = dm ? dm[2] : text;
        if (/<(?:div|p)\b/i.test(region)) return false; // block tags inside: repair path
        const runs = this.parseRuns(region);
        if (!runs) return false;
        const a = Math.max(from.ch - regionStart, 0);
        const b = Math.min(to.ch - regionStart, region.length);
        if (a >= b) return false;

        // Cut every run into outside/inside pieces relative to the selection
        const pieces = [];
        const push = (t, props, inSel) => { if (t) pieces.push({ t, props, inSel }); };
        for (const r of runs) {
            const cs = r.span ? r.innerStart : r.start;
            const ce = r.span ? r.innerEnd : r.end;
            const s = Math.min(Math.max(a, cs), ce);
            const e = Math.max(Math.min(b, ce), cs);
            if (s >= e) {
                push(region.slice(cs, ce), Object.assign({}, r.props), false);
                continue;
            }
            push(region.slice(cs, s), Object.assign({}, r.props), false);
            const mp = Object.assign({}, r.props);
            mutate(mp);
            push(region.slice(s, e), mp, true);
            push(region.slice(e, ce), Object.assign({}, r.props), false);
        }

        // Re-merge neighbors that ended up with identical styles
        const same = (x, y) => {
            const kx = Object.keys(x);
            const ky = Object.keys(y);
            return kx.length === ky.length && kx.every((k) => x[k] === y[k]);
        };
        const merged = [];
        for (const p of pieces) {
            const last = merged[merged.length - 1];
            if (last && same(last.props, p.props)) {
                last.t += p.t;
                last.inSel = last.inSel || p.inSel;
            } else {
                merged.push(p);
            }
        }

        const styleOf = (p) => Object.entries(p).map(([k, v]) => k + ':' + v).join('; ');
        let out = '';
        let selA = -1;
        let selB = -1;
        for (const p of merged) {
            const frag = this.wrapStyled(p.t, styleOf(p.props));
            if (p.inSel && selA < 0) selA = out.length;
            out += frag;
            if (p.inSel) selB = out.length;
        }
        if (selA < 0) return false;

        ed.replaceRange(prefix + out + suffix, { line, ch: 0 }, { line, ch: text.length });
        ed.setSelection(
            { line, ch: regionStart + selA },
            { line, ch: regionStart + selB }
        );
        this.padDocEnd(ed, line);
        ed.focus();
        return true;
    }

    // If the text right before/after the current selection is a span with the
    // exact same style, extend the selection over it and return its inner
    // text, so the output merges into one span instead of leaving identical
    // siblings side by side (e.g. after a split is styled back to match).
    absorbSiblings(ed, styleStr) {
        const from = ed.getCursor('from');
        const to = ed.getCursor('to');
        if (from.line !== to.line) return { before: '', after: '' };
        const esc = styleStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const lt = ed.getLine(from.line);
        const bm = lt.slice(0, from.ch).match(new RegExp('<span style="' + esc + '">([^<]*)</span>$'));
        const am = lt.slice(to.ch).match(new RegExp('^<span style="' + esc + '">([^<]*)</span>'));
        if (bm || am) {
            ed.setSelection(
                { line: from.line, ch: from.ch - (bm ? bm[0].length : 0) },
                { line: to.line, ch: to.ch + (am ? am[0].length : 0) }
            );
        }
        return { before: bm ? bm[1] : '', after: am ? am[1] : '' };
    }

    transformSpan(mutate) {
        const ed = this.getEditor();
        if (!ed) { new Notice('Open a note in editing mode first'); return; }
        if (this.styleRange(ed, mutate)) return;
        this.expandToSpan(ed);
        const sel = ed.getSelection();
        if (!sel) { new Notice('Select some text first'); return; }

        let inner = sel;
        let prefix = '';
        let suffix = '';
        // An alignment wrapper (div/p from setAlignment) must stay OUTSIDE the
        // span: a block tag inside an inline span is invalid HTML and breaks
        // rendering. Peel it off, style the contents, re-wrap at the end.
        const dm = inner.match(/^(<(?:div|p) style="text-align:(?:left|center|right)">)([\s\S]*)(<\/(?:div|p)>)$/i);
        if (dm) {
            prefix = dm[1];
            inner = dm[2];
            suffix = dm[3];
        }
        const props = {};
        // Collect properties from EVERY span layer in the selection (inner layers win),
        // then strip all span tags — this merges, and also repairs nested spans.
        if (/<span/i.test(inner)) {
            const tagRe = /<span style="([^"]*)">/g;
            let t;
            while ((t = tagRe.exec(inner)) !== null) {
                t[1].split(';').forEach((pair) => {
                    const i = pair.indexOf(':');
                    if (i > 0) props[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
                });
            }
            inner = inner.replace(/<\/?span[^>]*>/g, '');
            // Repair legacy span-around-div content: after stripping the span
            // layers an alignment wrapper may surface — peel it off too so it
            // gets rebuilt on the outside
            if (!prefix) {
                const dm2 = inner.match(/^(<(?:div|p) style="text-align:(?:left|center|right)">)([\s\S]*)(<\/(?:div|p)>)$/i);
                if (dm2) {
                    prefix = dm2[1];
                    inner = dm2[2];
                    suffix = dm2[3];
                }
            }
        }

        mutate(props);

        const styleStr = Object.entries(props).map(([k, v]) => k + ':' + v).join('; ');
        let out;
        if (styleStr) {
            // Sibling absorption only applies to bare spans: neighbors of an
            // alignment wrapper live outside it and must not be pulled in
            if (!prefix) {
                const extra = this.absorbSiblings(ed, styleStr);
                inner = extra.before + inner + extra.after;
            }
            out = prefix + this.wrapStyled(inner, styleStr) + suffix;
        } else {
            out = prefix + inner + suffix;
        }

        const start = ed.posToOffset(ed.getCursor('from'));
        ed.replaceSelection(out);
        // Re-select the result so the next button press keeps working on the same text
        ed.setSelection(ed.offsetToPos(start), ed.offsetToPos(start + out.length));
        this.padDocEnd(ed, ed.offsetToPos(start + out.length).line);
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

        // Iterate bottom-up: aligning an embed inserts lines, which must not
        // shift the line numbers still to be visited
        const wrapRe = /^<div style="text-align:(left|center|right)">([\s\S]*)<\/div>\s*$/;
        for (let ln = to.line; ln >= from.line; ln--) {
            if (this.tableInfo(ed, ln)) continue; // never wrap table rows in a div
            const text = ed.getLine(ln);
            // Cursor anywhere inside an existing embed block (including on
            // the embed line itself): retarget or unwrap that block
            const blk = this.imageBlock(ed, ln);
            if (blk) {
                if (align === 'left') {
                    ed.replaceRange(blk.embed,
                        { line: blk.start, ch: 0 },
                        { line: blk.end, ch: ed.getLine(blk.end).length });
                } else {
                    const open = ed.getLine(blk.start);
                    ed.replaceRange('<div style="text-align:' + align + '">',
                        { line: blk.start, ch: 0 }, { line: blk.start, ch: open.length });
                }
                ln = blk.start;
                continue;
            }
            // An embed alone on its line (e.g. an image): markdown inside a
            // single-line HTML tag stops rendering, so wrap it as a block
            // with blank lines instead
            const em = text.trim().match(/^!\[\[[^\]]*\]\]$/);
            if (em) {
                if (align !== 'left') {
                    ed.replaceRange(
                        '<div style="text-align:' + align + '">\n\n' + em[0] + '\n\n</div>',
                        { line: ln, ch: 0 }, { line: ln, ch: text.length }
                    );
                }
                continue;
            }
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
        if (align !== 'left') this.padDocEnd(ed, ed.lineCount() - 1);
        ed.focus();
    }

    // Detect the 5-line block produced when aligning an embed:
    // <div style="text-align:X"> / blank / ![[...]] / blank / </div>
    imageBlock(ed, ln) {
        const last = ed.lineCount() - 1;
        for (let s = ln; s >= 0 && s >= ln - 4; s--) {
            if (!/^<div style="text-align:(?:left|center|right)">$/.test(ed.getLine(s))) continue;
            if (s + 4 > last || ln > s + 4) return null;
            if (ed.getLine(s + 1).trim() === '' &&
                /^!\[\[[^\]]*\]\]$/.test(ed.getLine(s + 2).trim()) &&
                ed.getLine(s + 3).trim() === '' &&
                ed.getLine(s + 4).trim() === '</div>') {
                return { start: s, end: s + 4, embed: ed.getLine(s + 2).trim() };
            }
            return null;
        }
        return null;
    }

    clearFormatting() {
        const ed = this.getEditor();
        if (!ed) { new Notice('Open a note in editing mode first'); return; }
        // A partial selection inside styled text clears just that stretch
        if (this.styleRange(ed, (props) => {
            for (const k of Object.keys(props)) delete props[k];
        })) return;
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
        // app.setting is undocumented API: guard so the button degrades to a
        // no-op if a future Obsidian version changes it
        const gear = mkBtn(g, 'Plugin settings', () => {
            const s = this.app.setting;
            if (s && typeof s.open === 'function' && typeof s.openTabById === 'function') {
                s.open();
                s.openTabById(this.manifest.id);
            }
        });
        setIcon(gear, 'settings');
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
            desc: 'Preset text-color buttons shown on the toolbar. Values can be hex (#e0313a) or rgba(); for text, fully opaque hex is usually the most readable.',
            picker: true,
            valuePlaceholder: '#e0313a',
            addItem: () => ({ name: 'Color', value: '#e0313a' }),
        });

        this.listSection({
            key: 'highlights',
            heading: 'Highlights',
            desc: 'Preset highlight swatches. Values can be hex or rgba(); the fourth rgba() number is opacity (0 to 1), and semi-transparent colors (around 0.35) stay readable in both light and dark themes.',
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
                // The picker only speaks opaque hex. Preview rgba() values by
                // their rgb part; on change, keep the value's original alpha so
                // semi-transparent highlights stay semi-transparent.
                const parsed = parseCssColor(item.value);
                row.addColorPicker((c) => c
                    .setValue(parsed ? parsed.hex : '#000000')
                    .onChange((v) => {
                        const cur = parseCssColor(item.value);
                        if (cur && cur.alpha < 1) {
                            const r = parseInt(v.slice(1, 3), 16);
                            const g = parseInt(v.slice(3, 5), 16);
                            const b = parseInt(v.slice(5, 7), 16);
                            item.value = 'rgba(' + r + ', ' + g + ', ' + b + ', ' + cur.alpha + ')';
                        } else {
                            item.value = v;
                        }
                        valueText.setValue(item.value);
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
