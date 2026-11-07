const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../viewer-theme.js'), 'utf8');

function harness({ stored, dark = false, blocked = false } = {}) {
    const listeners = new Map();
    const button = { setAttribute(name, value) { this[name] = value; } };
    const favicon = {};
    const document = {
        documentElement: { dataset: {} },
        getElementById: () => favicon,
        querySelectorAll: () => [button],
        addEventListener: (event, callback) => listeners.set(event, callback)
    };
    const system = { matches: dark, addEventListener: (event, callback) => listeners.set(event, callback) };
    const localStorage = {
        getItem() { if (blocked) throw Error('Storage unavailable'); return stored; },
        setItem(key, value) { if (blocked) throw Error('Storage unavailable'); stored = value; }
    };
    const window = { addEventListener: (event, callback) => listeners.set(event, callback) };
    vm.runInNewContext(source, { document, window, localStorage, matchMedia: () => system });
    return {
        theme: () => document.documentElement.dataset.theme,
        getStored: () => stored,
        changeSystem: dark => { system.matches = dark; listeners.get('change')(); },
        click: () => listeners.get('click')({ target: { closest: () => button } }),
        sync: newValue => listeners.get('storage')({ key: 'cgrillo-theme', newValue }),
        button,
        favicon
    };
}

test('theme follows the system until a valid choice is saved', () => {
    const app = harness({ stored: 'corrupt', dark: true });
    assert.equal(app.theme(), 'dark');
    assert.equal(app.favicon.href, 'favicon-dark.svg');
    app.changeSystem(false);
    assert.equal(app.theme(), 'light');
    assert.equal(app.button['aria-pressed'], 'false');
    app.click();
    assert.equal(app.theme(), 'dark');
    assert.equal(app.getStored(), 'dark');
    assert.equal(app.button['aria-pressed'], 'true');
    app.changeSystem(false);
    assert.equal(app.theme(), 'dark');
});

test('existing choices survive startup and updates sync across tabs', () => {
    const app = harness({ stored: 'light', dark: true });
    assert.equal(app.theme(), 'light');
    app.sync('dark');
    assert.equal(app.theme(), 'dark');
    app.sync(null);
    app.changeSystem(false);
    assert.equal(app.theme(), 'light');
});

test('a blocked storage API still allows a theme choice for the current page', () => {
    const app = harness({ blocked: true });
    app.click();
    assert.equal(app.theme(), 'dark');
    assert.equal(app.button['aria-pressed'], 'true');
});
