(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.FixtureSlider = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    function markers(entries) {
        const indices = new Set(Array.from({ length: Math.min(5, entries.length) }, (_, i, all) => i));
        if (entries.length > 5) {
            indices.clear();
            for (let i = 0; i < 5; i++) indices.add(Math.round(i * (entries.length - 1) / 4));
        }
        return [...indices].map(index => entries[index]);
    }
    function shortLabel(entry) {
        if (entry.shortLabel) return entry.shortLabel;
        if (/^round \d+$/i.test(entry.label)) return entry.label.replace(/round /i, 'R');
        if (/^week \d+$/i.test(entry.label)) return entry.label.replace(/week /i, 'W');
        if (/final/i.test(entry.label)) return /grand|super bowl/i.test(entry.label) ? 'Final' : entry.label.replace('Qualifying & Elimination Finals', 'Finals').replace('Preliminary Finals', 'Prelim').replace('Finals Week ', 'F');
        if (entry.date && Number.isFinite(Date.parse(entry.date))) return new Intl.DateTimeFormat('en-AU', {timeZone:'Australia/Sydney',day:'numeric',month:'short'}).format(new Date(entry.date));
        return String(entry.label || '').slice(0, 12);
    }
    function update(input, entries) {
        if (!input) return;
        const min = Number(input.min || 0), max = Number(input.max || 0), value = Number(input.value);
        input.style.setProperty('--fill', `${Math.max(0, Math.min(100, (value - min) / Math.max(1, max - min) * 100))}%`);
        let rail = input.nextElementSibling;
        if (!rail?.classList.contains('fixture-slider-markers')) {
            rail = document.createElement('div'); rail.className = 'fixture-slider-markers';
            rail.setAttribute('role', 'group'); rail.setAttribute('aria-label', 'Fixture timeline shortcuts');
            input.after(rail);
        }
        const signature = JSON.stringify([min, max, entries]);
        if (rail.dataset.signature !== signature) {
            rail.dataset.signature = signature;
            rail.replaceChildren();
            for (const entry of markers(entries)) {
                const button = document.createElement('button'); button.type = 'button';
                button.textContent = shortLabel(entry); button.title = entry.label;
                button.setAttribute('aria-label', `View ${entry.label}`);
                button.dataset.value = entry.value;
                const position = (Number(entry.value) - min) / Math.max(1, max - min) * 100;
                button.style.left = `${position}%`;
                if (position === 0) button.classList.add('fixture-slider-marker--first');
                if (position === 100) button.classList.add('fixture-slider-marker--last');
                button.addEventListener('click', () => { input.value = entry.value; input.dispatchEvent(new Event('input', {bubbles:true})); });
                rail.appendChild(button);
            }
        }
        for (const button of rail.children) {
            button.disabled = input.disabled;
            button.setAttribute('aria-pressed', String(Number(button.dataset.value) === value));
        }
    }
    return { markers, shortLabel, update };
});
