'use strict';

// Minimal stand-in for the 'obsidian' module so main.js can be loaded and its
// pure string-surgery logic tested under Node (node --test tests/).

class Plugin {
    constructor(app, manifest) {
        this.app = app;
        this.manifest = manifest;
    }
    addRibbonIcon() {}
    addCommand() {}
    addSettingTab() {}
    loadData() { return Promise.resolve({}); }
    saveData() { return Promise.resolve(); }
}

class PluginSettingTab {
    constructor(app, plugin) {
        this.app = app;
        this.plugin = plugin;
    }
}

class Setting {
    setName() { return this; }
    setDesc() { return this; }
    setHeading() { return this; }
    addText() { return this; }
    addToggle() { return this; }
    addButton() { return this; }
    addExtraButton() { return this; }
    addColorPicker() { return this; }
}

class MarkdownView {}

// The picker modal is DOM-driven; tests exercise the plugin methods it calls,
// so this only needs to exist for `class ... extends Modal` to load.
class Modal {
    constructor(app) { this.app = app; }
    open() {}
    close() {}
}

const notices = [];
class Notice {
    constructor(msg) { notices.push(msg); }
}

function setIcon() {}
function debounce(fn) { return fn; }

module.exports = { Plugin, PluginSettingTab, Setting, Modal, MarkdownView, Notice, setIcon, debounce, __notices: notices };
