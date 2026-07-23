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
        if (a.line === b.line) {
            const line = this.lines[a.line];
            this.lines[a.line] = line.slice(0, a.ch) + s + line.slice(b.ch);
        } else {
            const merged = this.lines[a.line].slice(0, a.ch) + s + this.lines[b.line].slice(b.ch);
            this.lines.splice(a.line, b.line - a.line + 1, ...merged.split('\n'));
        }
    }
    replaceSelection(s) {
        const startOff = this.posToOffset(this.from);
        this.replaceRange(s, this.from, this.to);
        const p = this.offsetToPos(startOff + s.length);
        this.setSelection(p);
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
    assert.equal(ed.getValue(), 'hello <span style="color:#e0313a">world</span>');
    assert.equal(ed.getSelection(), '<span style="color:#e0313a">world</span>');
});

test('cursor click inside a span merges a second property', () => {
    const ed = new MockEditor('hello <span style="color:#e0313a">world</span>');
    const ch = ed.getLine(0).indexOf('world') + 2;
    ed.setSelection({ line: 0, ch });
    makePlugin(ed).applyStyle('background-color', 'rgba(255, 213, 0, 0.4)');
    assert.equal(
        ed.getValue(),
        'hello <span style="color:#e0313a; background-color:rgba(255, 213, 0, 0.4)">world</span>'
    );
});

test('toggling a style on and off restores the original text', () => {
    const ed = new MockEditor('hello world', { line: 0, ch: 6 }, { line: 0, ch: 11 });
    const p = makePlugin(ed);
    p.toggleStyle('font-weight', 'bold');
    assert.equal(ed.getValue(), 'hello <span style="font-weight:bold">world</span>');
    p.toggleStyle('font-weight', 'bold');
    assert.equal(ed.getValue(), 'hello world');
});

test('repairs nested spans into one flat span (inner wins)', () => {
    const line = '<span style="color:red"><span style="font-weight:bold">x</span></span>';
    const ed = new MockEditor(line, { line: 0, ch: 0 }, { line: 0, ch: line.length });
    makePlugin(ed).applyStyle('font-size', '1.25em');
    assert.equal(
        ed.getValue(),
        '<span style="color:red; font-weight:bold; font-size:1.25em">x</span>'
    );
});

test('partial selection splits a span into flat siblings', () => {
    const ed = new MockEditor(BOLD, { line: 0, ch: 0 });
    select(ed, 'brown');
    makePlugin(ed).toggleDecoration('underline');
    assert.equal(ed.getValue(), SPLIT3);
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
    assert.equal(ed.getValue(), SPLIT3);
    p.toggleDecoration('underline'); // plugin kept the middle span selected
    assert.equal(ed.getValue(), BOLD);
});

test('eraser on a partial selection clears just that piece', () => {
    const ed = new MockEditor(BOLD, { line: 0, ch: 0 });
    select(ed, 'brown');
    makePlugin(ed).clearFormatting();
    assert.equal(
        ed.getValue(),
        '<span style="font-weight:bold">The quick </span>brown<span style="font-weight:bold"> fox</span>'
    );
    assert.equal(ed.getSelection(), 'brown');
});

test('toggling an inherited style off a word un-bolds just that word', () => {
    const ed = new MockEditor(BOLD, { line: 0, ch: 0 });
    select(ed, 'brown');
    makePlugin(ed).toggleStyle('font-weight', 'bold');
    assert.equal(
        ed.getValue(),
        '<span style="font-weight:bold">The quick </span>brown<span style="font-weight:bold"> fox</span>'
    );
});

test('styling a fully selected aligned line keeps the div outside the span', () => {
    const line = '<div style="text-align:center">hello</div>';
    const ed = new MockEditor(line, { line: 0, ch: 0 }, { line: 0, ch: line.length });
    makePlugin(ed).applyStyle('background-color', 'rgba(255, 213, 0, 0.4)');
    assert.equal(
        ed.getValue(),
        '<div style="text-align:center"><span style="background-color:rgba(255, 213, 0, 0.4)">hello</span></div>'
    );
});

test('styling an aligned styled line merges into the span inside the div', () => {
    const line = '<div style="text-align:center"><span style="font-weight:bold">hello</span></div>';
    const ed = new MockEditor(line, { line: 0, ch: 0 }, { line: 0, ch: line.length });
    makePlugin(ed).applyStyle('color', '#e0313a');
    assert.equal(
        ed.getValue(),
        '<div style="text-align:center"><span style="font-weight:bold; color:#e0313a">hello</span></div>'
    );
});

test('toggling the only style off an aligned line restores the bare div', () => {
    const line = '<div style="text-align:center"><span style="font-weight:bold">hello</span></div>';
    const ed = new MockEditor(line, { line: 0, ch: 0 }, { line: 0, ch: line.length });
    makePlugin(ed).toggleStyle('font-weight', 'bold');
    assert.equal(ed.getValue(), '<div style="text-align:center">hello</div>');
});

test('paragraph alignment wraps and left-align unwraps', () => {
    const ed = new MockEditor('hello', { line: 0, ch: 2 });
    const p = makePlugin(ed);
    p.setAlignment('center');
    assert.equal(ed.getValue(), '<div style="text-align:center">hello</div>');
    p.setAlignment('left');
    assert.equal(ed.getValue(), 'hello');
});

test('alignment inside a table edits the delimiter row column', () => {
    const ed = new MockEditor('a|b\n---|---\n1|2', { line: 0, ch: 0 });
    makePlugin(ed).setAlignment('center');
    assert.equal(ed.getLine(1), ' :---: |---');
});
