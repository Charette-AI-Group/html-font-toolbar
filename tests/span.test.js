'use strict';

// Regression tests for the span string-surgery in main.js.
// Run with: node --test "tests/*.test.js"

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

// Route require('obsidian') to the mock before loading the plugin
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
    if (request === 'obsidian') return path.join(__dirname, 'mocks', 'obsidian.js');
    return origResolve.call(this, request, ...rest);
};

const HtmlFontToolbarPlugin = require('../main.js');

// Mimics the slice of Obsidian's Editor API the plugin uses. Positions are
// { line, ch }; the document is an array of lines.
class MockEditor {
    constructor(text, from, to) {
        this.lines = String(text).split('\n');
        this.from = { ...from };
        this.to = to ? { ...to } : { ...from };
    }
    getCursor(which) { return which === 'from' ? { ...this.from } : { ...this.to }; }
    getLine(n) { return this.lines[n]; }
    lineCount() { return this.lines.length; }
    getValue() { return this.lines.join('\n'); }
    getSelection() {
        if (this.from.line === this.to.line) {
            return this.lines[this.from.line].slice(this.from.ch, this.to.ch);
        }
        const parts = [this.lines[this.from.line].slice(this.from.ch)];
        for (let i = this.from.line + 1; i < this.to.line; i++) parts.push(this.lines[i]);
        parts.push(this.lines[this.to.line].slice(0, this.to.ch));
        return parts.join('\n');
    }
    setSelection(a, b) { this.from = { ...a }; this.to = b ? { ...b } : { ...a }; }
    setCursor(p) { this.setSelection(p); }
    posToOffset(pos) {
        let off = 0;
        for (let i = 0; i < pos.line; i++) off += this.lines[i].length + 1;
        return off + pos.ch;
    }
    offsetToPos(off) {
        let line = 0;
        while (line < this.lines.length - 1 && off > this.lines[line].length) {
            off -= this.lines[line].length + 1;
            line++;
        }
        return { line, ch: off };
    }
    replaceRange(s, a, b) {
        const merged = this.lines[a.line].slice(0, a.ch) + s + this.lines[b.line].slice(b.ch);
        this.lines.splice(a.line, b.line - a.line + 1, ...merged.split('\n'));
    }
    replaceSelection(s) {
        const startOff = this.posToOffset(this.from);
        this.replaceRange(s, this.from, this.to);
        this.setSelection(this.offsetToPos(startOff + s.length));
    }
    focus() {}
}

function makePlugin(ed) {
    const app = { workspace: { getActiveViewOfType: () => (ed ? { editor: ed } : null) } };
    return new HtmlFontToolbarPlugin(app, { id: 'html-font-toolbar' });
}

// Select `target` (first occurrence) on line `line` of the editor
function select(ed, target, line = 0) {
    const ch = ed.getLine(line).indexOf(target);
    assert.ok(ch >= 0, 'target "' + target + '" not found in line');
    ed.setSelection({ line, ch }, { line, ch: ch + target.length });
}

const BOLD = '<span style="font-weight:bold">The quick brown fox</span>';
const SPLIT3 =
    '<span style="font-weight:bold">The quick </span>' +
    '<span style="font-weight:bold; text-decoration:underline">brown</span>' +
    '<span style="font-weight:bold"> fox</span>';

test('wraps a plain selection in a span', () => {
    const ed = new MockEditor('hello world', { line: 0, ch: 6 }, { line: 0, ch: 11 });
    makePlugin(ed).applyStyle('color', '#e0313a');
    assert.equal(ed.getValue(), 'hello <span style="color:#e0313a">world</span>\n');
    assert.equal(ed.getSelection(), '<span style="color:#e0313a">world</span>');
});

test('cursor click inside a span merges a second property', () => {
    const ed = new MockEditor('hello <span style="color:#e0313a">world</span>');
    const ch = ed.getLine(0).indexOf('world') + 2;
    ed.setSelection({ line: 0, ch });
    makePlugin(ed).applyStyle('background-color', 'rgba(255, 213, 0, 0.4)');
    assert.equal(
        ed.getValue(),
        'hello <span style="color:#e0313a; background-color:rgba(255, 213, 0, 0.4)">world</span>\n'
    );
});

test('toggling a style on and off restores the original text', () => {
    const ed = new MockEditor('hello world', { line: 0, ch: 6 }, { line: 0, ch: 11 });
    const p = makePlugin(ed);
    p.toggleStyle('font-weight', 'bold');
    assert.equal(ed.getValue(), 'hello <span style="font-weight:bold">world</span>\n');
    p.toggleStyle('font-weight', 'bold');
    assert.equal(ed.getValue(), 'hello world\n');
});

test('repairs nested spans into one flat span (inner wins)', () => {
    const line = '<span style="color:red"><span style="font-weight:bold">x</span></span>';
    const ed = new MockEditor(line, { line: 0, ch: 0 }, { line: 0, ch: line.length });
    makePlugin(ed).applyStyle('font-size', '1.25em');
    assert.equal(
        ed.getValue(),
        '<span style="color:red; font-weight:bold; font-size:1.25em">x</span>\n'
    );
});

test('partial selection splits a span into flat siblings', () => {
    const ed = new MockEditor(BOLD, { line: 0, ch: 0 });
    select(ed, 'brown');
    makePlugin(ed).toggleDecoration('underline');
    assert.equal(ed.getValue(), SPLIT3 + '\n');
    assert.equal(
        ed.getSelection(),
        '<span style="font-weight:bold; text-decoration:underline">brown</span>'
    );
});

test('toggling the split piece back re-merges the siblings', () => {
    const ed = new MockEditor(BOLD, { line: 0, ch: 0 });
    select(ed, 'brown');
    const p = makePlugin(ed);
    p.toggleDecoration('underline');
    assert.equal(ed.getValue(), SPLIT3 + '\n');
    p.toggleDecoration('underline'); // plugin kept the middle span selected
    assert.equal(ed.getValue(), BOLD + '\n');
});

test('selection across span boundaries styles each stretch precisely', () => {
    const ed = new MockEditor(SPLIT3, { line: 0, ch: 0 });
    const a = ed.getLine(0).indexOf('quick');
    const b = ed.getLine(0).indexOf('brown') + 'brown'.length;
    ed.setSelection({ line: 0, ch: a }, { line: 0, ch: b });
    makePlugin(ed).toggleStyle('font-style', 'italic');
    assert.equal(
        ed.getValue(),
        '<span style="font-weight:bold">The </span>' +
        '<span style="font-weight:bold; font-style:italic">quick </span>' +
        '<span style="font-weight:bold; text-decoration:underline; font-style:italic">brown</span>' +
        '<span style="font-weight:bold"> fox</span>\n'
    );
});

test('eraser on a partial selection clears just that piece', () => {
    const ed = new MockEditor(BOLD, { line: 0, ch: 0 });
    select(ed, 'brown');
    makePlugin(ed).clearFormatting();
    assert.equal(
        ed.getValue(),
        '<span style="font-weight:bold">The quick </span>brown<span style="font-weight:bold"> fox</span>\n'
    );
    assert.equal(ed.getSelection(), 'brown');
});

test('toggling an inherited style off a word un-bolds just that word', () => {
    const ed = new MockEditor(BOLD, { line: 0, ch: 0 });
    select(ed, 'brown');
    makePlugin(ed).toggleStyle('font-weight', 'bold');
    assert.equal(
        ed.getValue(),
        '<span style="font-weight:bold">The quick </span>brown<span style="font-weight:bold"> fox</span>\n'
    );
});

test('markdown links in a styled selection stay outside the spans', () => {
    const line = 'see [[My Note]] and [x](https://a.b) end';
    const ed = new MockEditor(line, { line: 0, ch: 0 }, { line: 0, ch: line.length });
    makePlugin(ed).applyStyle('color', '#e0313a');
    assert.equal(
        ed.getValue(),
        '<span style="color:#e0313a">see </span>[[My Note]]' +
        '<span style="color:#e0313a"> and </span>[x](https://a.b)' +
        '<span style="color:#e0313a"> end</span>\n'
    );
});

test('no padding is added when styled text is not at the document end', () => {
    const ed = new MockEditor('hello world\nsecond', { line: 0, ch: 6 }, { line: 0, ch: 11 });
    makePlugin(ed).applyStyle('font-weight', 'bold');
    assert.equal(ed.getValue(), 'hello <span style="font-weight:bold">world</span>\nsecond');
});

test('styling a fully selected aligned line keeps the div outside the span', () => {
    const line = '<div style="text-align:center">hello</div>';
    const ed = new MockEditor(line, { line: 0, ch: 0 }, { line: 0, ch: line.length });
    makePlugin(ed).applyStyle('background-color', 'rgba(255, 213, 0, 0.4)');
    assert.equal(
        ed.getValue(),
        '<div style="text-align:center"><span style="background-color:rgba(255, 213, 0, 0.4)">hello</span></div>\n'
    );
});

test('styling an aligned styled line merges into the span inside the div', () => {
    const line = '<div style="text-align:center"><span style="font-weight:bold">hello</span></div>';
    const ed = new MockEditor(line, { line: 0, ch: 0 }, { line: 0, ch: line.length });
    makePlugin(ed).applyStyle('color', '#e0313a');
    assert.equal(
        ed.getValue(),
        '<div style="text-align:center"><span style="font-weight:bold; color:#e0313a">hello</span></div>\n'
    );
});

test('toggling the only style off an aligned line restores the bare div', () => {
    const line = '<div style="text-align:center"><span style="font-weight:bold">hello</span></div>';
    const ed = new MockEditor(line, { line: 0, ch: 0 }, { line: 0, ch: line.length });
    makePlugin(ed).toggleStyle('font-weight', 'bold');
    assert.equal(ed.getValue(), '<div style="text-align:center">hello</div>\n');
});

test('restyling legacy span-around-div content repairs the tag order', () => {
    const line = '<span style="font-weight:bold"><div style="text-align:center">hello</div></span>';
    const ed = new MockEditor(line, { line: 0, ch: 0 }, { line: 0, ch: line.length });
    makePlugin(ed).applyStyle('color', '#e0313a');
    assert.equal(
        ed.getValue(),
        '<div style="text-align:center"><span style="font-weight:bold; color:#e0313a">hello</span></div>\n'
    );
});

test('paragraph alignment wraps and left-align unwraps', () => {
    const ed = new MockEditor('hello', { line: 0, ch: 2 });
    const p = makePlugin(ed);
    p.setAlignment('center');
    assert.equal(ed.getValue(), '<div style="text-align:center">hello</div>\n');
    p.setAlignment('left');
    assert.equal(ed.getValue(), 'hello\n');
});

test('alignment inside a table edits the delimiter row column', () => {
    const ed = new MockEditor('a|b\n---|---\n1|2', { line: 0, ch: 0 });
    makePlugin(ed).setAlignment('center');
    assert.equal(ed.getLine(1), ' :---: |---');
});

test('centering an image embed wraps it as a block with blank lines', () => {
    const ed = new MockEditor('![[Pasted image.png|434]]', { line: 0, ch: 3 });
    const p = makePlugin(ed);
    p.setAlignment('center');
    assert.equal(
        ed.getValue(),
        '<div style="text-align:center">\n\n![[Pasted image.png|434]]\n\n</div>\n'
    );
    // Cursor on the embed line inside the block: left-align unwraps it
    ed.setCursor({ line: 2, ch: 3 });
    p.setAlignment('left');
    assert.equal(ed.getValue(), '![[Pasted image.png|434]]\n');
});

test('re-aligning an image block only rewrites the opening div', () => {
    const ed = new MockEditor('![[img.png]]', { line: 0, ch: 0 });
    const p = makePlugin(ed);
    p.setAlignment('center');
    ed.setCursor({ line: 2, ch: 0 });
    p.setAlignment('right');
    assert.equal(
        ed.getValue(),
        '<div style="text-align:right">\n\n![[img.png]]\n\n</div>\n'
    );
});
