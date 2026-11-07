const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname, "../editorial.js"), "utf8");

function harness(stored = {}) {
    const timers = new Map(), microtasks = [], storage = new Map(Object.entries(stored));
    let clock = 0, timerId = 0;
    const documentListeners = new Map();
    const document = {
        activeElement: null,
        addEventListener(type, listener) {
            const list = documentListeners.get(type) || [];
            list.push(listener);
            documentListeners.set(type, list);
        },
        emit(type, event) { for (const listener of documentListeners.get(type) || []) listener(event); }
    };
    class Element {
        constructor(dataset = {}) { this.dataset = dataset; this.children = []; this.listeners = new Map(); this.attributes = {}; this.hidden = true; }
        append(...children) { children.forEach(child => { child.parent = this; this.children.push(child); }); }
        addEventListener(type, listener) { const list = this.listeners.get(type) || []; list.push(listener); this.listeners.set(type, list); }
        setAttribute(name, value) { this.attributes[name] = value; }
        getAttribute(name) { return this.attributes[name]; }
        contains(target) { return target === this || this.children.some(child => child.contains(target)); }
        focus() { document.activeElement = this; }
        click() { this.emit("click"); }
        getClientRects() { return this.isUnrendered ? [] : [{}]; }
        querySelector(selector) {
            if (selector === "a") return this.children.find(child => child.isLink) || null;
            return this.parts?.[selector] || null;
        }
        emit(type, values = {}) {
            const event = { type, key: "", pointerType: "mouse", defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...values };
            let target = this;
            do {
                for (const listener of target.listeners.get(type) || []) listener(event);
                target = type === "keydown" ? target.parent : null;
            } while (target);
            return event;
        }
    }
    const date = new Element();
    const families = Object.fromEntries(["afl", "nrl", "nba"].map(id => {
        const group = new Element({ leagueGroup: id });
        const toggle = new Element(), menu = new Element(), subnav = new Element();
        const menuLink = new Element(), inlineLink = new Element();
        menuLink.isLink = inlineLink.isLink = true;
        menu.append(menuLink); subnav.append(inlineLink); group.append(toggle, menu, subnav);
        group.parts = { "[data-league-toggle]": toggle, "[data-league-menu]": menu, "[data-league-subnav]": subnav };
        return [id, { group, toggle, menu, subnav, menuLink, inlineLink }];
    }));
    document.querySelectorAll = selector => selector === "[data-edition-date]" ? [date] : selector === "[data-league-group]" ? Object.values(families).map(family => family.group) : [];
    vm.runInNewContext(source, {
        document, Date, Intl,
        sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
        setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, at: clock + delay }); return id; },
        clearTimeout: id => timers.delete(id), queueMicrotask: callback => microtasks.push(callback)
    });
    return {
        families, date, document, storage,
        flush() { while (microtasks.length) microtasks.shift()(); },
        advance(milliseconds) {
            clock += milliseconds;
            for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); timer.callback(); }
        }
    };
}

test("all three families initialise closed with inaccessible animated views", () => {
    const h = harness();
    for (const family of Object.values(h.families)) {
        assert.equal(family.toggle.getAttribute("aria-expanded"), "false");
        assert.equal(family.menu.inert, true);
        assert.equal(family.subnav.inert, true);
        assert.equal(family.menu.getAttribute("aria-hidden"), "true");
        assert.equal(family.subnav.getAttribute("aria-hidden"), "true");
        assert.equal(family.menu.hidden, false);
        assert.equal(family.subnav.hidden, false);
    }
    assert.match(h.date.dateTime, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(h.date.textContent.length > 15);
});

test("persistent family expansion is independent and uses family storage keys", () => {
    const h = harness();
    h.families.afl.toggle.emit("click");
    h.families.nrl.toggle.emit("click");
    assert.equal(h.families.afl.subnav.dataset.open, "true");
    assert.equal(h.families.nrl.subnav.dataset.open, "true");
    assert.equal(h.families.nba.subnav.dataset.open, "false");
    assert.equal(h.storage.get("cgrillo-family-afl-expanded"), "true");
    assert.equal(h.storage.get("cgrillo-family-nrl-expanded"), "true");
    assert.equal(h.storage.has("cgrillo-sport-expanded"), false);
});

test("stored expansion restores only the corresponding family", () => {
    const h = harness({ "cgrillo-family-nba-expanded": "true" });
    assert.equal(h.families.nba.subnav.inert, false);
    assert.equal(h.families.nba.menu.inert, true);
    assert.equal(h.families.afl.subnav.inert, true);
    assert.equal(h.families.nrl.subnav.inert, true);
});

test("hover preview has a cancellable 260ms pointer-leave grace period", () => {
    const h = harness(), { group, menu, toggle } = h.families.afl;
    group.emit("pointerenter");
    assert.equal(menu.inert, false);
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    group.emit("pointerleave"); h.advance(250);
    assert.equal(menu.dataset.open, "true");
    group.emit("pointerenter"); h.advance(20);
    assert.equal(menu.dataset.open, "true");
    group.emit("pointerleave"); h.advance(260);
    assert.equal(menu.dataset.open, "false");
    assert.equal(menu.inert, true);
});

test("touch pointer entry does not preview, while touch click expands inline", () => {
    const h = harness(), family = h.families.nrl;
    family.group.emit("pointerenter", { pointerType: "touch" });
    assert.equal(family.menu.dataset.open, "false");
    family.toggle.emit("click");
    assert.equal(family.subnav.dataset.open, "true");
    family.group.emit("pointerenter");
    assert.equal(family.menu.dataset.open, "false");
});

test("clicking after preview opens inline; collapse suppresses hover until pointer leaves", () => {
    const h = harness(), family = h.families.afl;
    family.group.emit("pointerenter"); family.toggle.emit("click");
    assert.equal(family.menu.inert, true);
    assert.equal(family.subnav.inert, false);
    family.toggle.emit("click"); family.group.emit("pointerenter");
    assert.equal(family.menu.dataset.open, "false");
    assert.equal(family.subnav.dataset.open, "false");
    family.group.emit("pointerleave"); family.group.emit("pointerenter");
    assert.equal(family.menu.dataset.open, "true");
});

test("entering another family dismisses other previews and preserves persistent groups", () => {
    const h = harness();
    h.families.afl.toggle.emit("click");
    h.families.nrl.group.emit("pointerenter");
    h.families.nba.group.emit("pointerenter");
    assert.equal(h.families.nrl.menu.dataset.open, "false");
    assert.equal(h.families.nba.menu.dataset.open, "true");
    assert.equal(h.families.afl.subnav.dataset.open, "true");
});

test("ArrowDown opens preview and focuses its first link; Escape closes and restores focus", () => {
    const h = harness(), family = h.families.afl;
    assert.equal(family.toggle.emit("keydown", { key: "ArrowDown" }).defaultPrevented, true);
    assert.equal(h.document.activeElement, family.menuLink);
    assert.equal(family.menu.inert, false);
    assert.equal(family.menuLink.emit("keydown", { key: "Escape" }).defaultPrevented, true);
    assert.equal(family.menu.inert, true);
    assert.equal(h.document.activeElement, family.toggle);
    assert.equal(family.toggle.getAttribute("aria-expanded"), "false");
});

test("expanded family sends ArrowDown to inline links and Escape clears persistent expansion", () => {
    const h = harness(), family = h.families.nba;
    family.toggle.emit("click"); family.toggle.emit("keydown", { key: "ArrowDown" });
    assert.equal(h.document.activeElement, family.inlineLink);
    family.inlineLink.emit("keydown", { key: "Escape" });
    assert.equal(family.subnav.inert, true);
    assert.equal(h.storage.get("cgrillo-family-nba-expanded"), "false");
    assert.equal(h.document.activeElement, family.toggle);
});

test("focus within a family prevents preview closure; moving outside closes only preview", () => {
    const h = harness(), family = h.families.nrl;
    family.toggle.emit("keydown", { key: "ArrowDown" });
    family.group.emit("pointerleave"); h.advance(300);
    assert.equal(family.menu.dataset.open, "true");
    family.group.emit("focusout"); h.flush();
    assert.equal(family.menu.dataset.open, "true");
    h.document.activeElement = null;
    family.group.emit("focusout"); h.flush();
    assert.equal(family.menu.dataset.open, "false");
    family.toggle.emit("click"); family.inlineLink.focus();
    family.group.emit("focusout"); h.flush();
    assert.equal(family.subnav.dataset.open, "true");
});

test("Escape cancels a pending preview timer without affecting another expanded family", () => {
    const h = harness(), family = h.families.afl;
    h.families.nba.toggle.emit("click");
    family.group.emit("pointerenter"); family.group.emit("pointerleave");
    family.group.emit("keydown", { key: "Escape" }); h.advance(300);
    assert.equal(family.menu.dataset.open, "false");
    assert.equal(h.families.nba.subnav.dataset.open, "true");
});

test("Escape outside a hover preview closes it without moving focus", () => {
    const h = harness(), family = h.families.nrl;
    const outside = {};
    h.document.activeElement = outside;
    family.group.emit("pointerenter");
    h.document.emit("keydown", { key: "Escape", defaultPrevented: false });
    assert.equal(family.menu.inert, true);
    assert.equal(h.document.activeElement, outside);
});

test("ArrowDown uses the inline links when a small viewport hides the hover preview", () => {
    const h = harness(), family = h.families.nba;
    family.menu.isUnrendered = true;
    family.toggle.emit("keydown", { key: "ArrowDown" });
    assert.equal(family.subnav.inert, false);
    assert.equal(h.document.activeElement, family.inlineLink);
});
