(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.FixtureSlider = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    let contextId = 0;
    const states = new WeakMap();
    const sydneyDateFormat = new Intl.DateTimeFormat('en-AU', {timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit'});
    const validDate = value => value && Number.isFinite(Date.parse(value));
    function sydneyDay(value) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) {
            const timestamp = Date.parse(`${value}T12:00:00Z`);
            return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0,10) === value ? value : null;
        }
        if (!validDate(value)) return null;
        const parts = sydneyDateFormat.formatToParts(new Date(value));
        return ['year','month','day'].map(type => parts.find(part => part.type === type).value).join('-');
    }
    function dateLabel(entry, now = Date.now()) {
        const start = sydneyDay(entry?.date || entry?.startDate), end = sydneyDay(entry?.endDate);
        if (!start) return '';
        const format = (day, year = false) => new Intl.DateTimeFormat('en-AU', {timeZone:'Australia/Sydney',day:'numeric',month:'short',...(year ? {year:'numeric'} : {})}).format(new Date(`${day}T12:00:00Z`));
        const showYear = start.slice(0,4) !== sydneyDay(new Date(now).toISOString()).slice(0,4);
        if (!end || end <= start) return format(start, showYear);
        if (start.slice(0,7) === end.slice(0,7)) return `${Number(start.slice(-2))}–${format(end, showYear)}`;
        return `${format(start, start.slice(0,4) !== end.slice(0,4))} – ${format(end, showYear || start.slice(0,4) !== end.slice(0,4))}`;
    }
    function navigationState(entries, value, options = {}) {
        const now = options.now ?? Date.now(), today = sydneyDay(new Date(now).toISOString());
        const selectedIndex = entries.findIndex(entry => Number(entry.value) === Number(value));
        const unit = options.unit || (entries.some(entry => /^round\b/i.test(entry.label || '')) ? 'rounds' : entries.some(entry => /^week\b/i.test(entry.label || '')) ? 'weeks' : 'selections');
        const dated = entries.map(entry => ({entry,start:sydneyDay(entry.date || entry.startDate),end:sydneyDay(entry.endDate || entry.date || entry.startDate)})).filter(item => item.start && item.end >= item.start);
        let current = options.currentValue == null ? null : entries.find(entry => Number(entry.value) === Number(options.currentValue));
        let reference = 'current';
        if (!current) {
            const active = dated.filter(item => item.start <= today && item.end >= today).sort((a,b) => b.start.localeCompare(a.start))[0];
            const next = dated.filter(item => item.start > today).sort((a,b) => a.start.localeCompare(b.start))[0];
            const latest = [...dated].sort((a,b) => b.end.localeCompare(a.end))[0];
            const target = active || next || latest;
            current = target?.entry;
            reference = active ? 'current' : next ? 'next' : 'latest';
        }
        const singular = unit === 'rounds' ? 'round' : unit === 'weeks' ? 'week' : unit === 'weekends' ? 'weekend' : unit === 'days' ? 'day' : 'selection';
        const jumpLabel = options.currentLabel || `${reference === 'current' ? 'Current' : reference === 'next' ? 'Next' : 'Latest'} ${singular}`;
        return { selectedIndex, positionLabel: selectedIndex >= 0 ? `${selectedIndex + 1} of ${entries.length} ${unit}` : '', dateLabel: dateLabel(entries[selectedIndex], now),
            currentValue: current?.value ?? null, currentLabel: current?.label || '', jumpLabel,
            canJump: !!current && selectedIndex >= 0 && Number(current.value) !== Number(value) && entries.length > 1 };
    }
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
    function update(input, entries, options = {}) {
        if (!input) return;
        const doc = input.ownerDocument || document;
        const min = Number(input.min || 0), max = Number(input.max || 0), value = Number(input.value);
        input.style.setProperty('--fill', `${Math.max(0, Math.min(100, (value - min) / Math.max(1, max - min) * 100))}%`);
        let rail = input.nextElementSibling;
        if (!rail?.classList.contains('fixture-slider-markers')) {
            rail = doc.createElement('div'); rail.className = 'fixture-slider-markers';
            rail.setAttribute('role', 'group'); rail.setAttribute('aria-label', 'Fixture timeline shortcuts');
            input.after(rail);
        }
        const signature = JSON.stringify([min, max, entries]);
        if (rail.dataset.signature !== signature) {
            rail.dataset.signature = signature;
            rail.replaceChildren();
            for (const entry of markers(entries)) {
                const button = doc.createElement('button'); button.type = 'button';
                const visible = shortLabel(entry);
                button.textContent = visible;
                button.title = entry.label;
                if (visible !== entry.label) button.setAttribute('aria-label', `${visible} · ${entry.label}`);
                button.dataset.value = entry.value;
                const position = (Number(entry.value) - min) / Math.max(1, max - min) * 100;
                button.style.left = `${position}%`;
                if (position === 0) button.classList.add('fixture-slider-marker--first');
                if (position === 100) button.classList.add('fixture-slider-marker--last');
                button.addEventListener('click', () => { input.value = entry.value; input.dispatchEvent(new (doc.defaultView?.Event || Event)('input', {bubbles:true})); });
                rail.appendChild(button);
            }
        }
        for (const button of rail.children) {
            button.disabled = input.disabled;
            button.setAttribute('aria-pressed', String(Number(button.dataset.value) === value));
        }
        let controls = states.get(input)?.controls;
        if (!controls?.isConnected) {
            controls = doc.createElement('div'); controls.className = 'fixture-slider-context';
            const summary = doc.createElement('span'); summary.className = 'fixture-slider-context__summary'; summary.id = `fixture-slider-context-${++contextId}`;
            const position = doc.createElement('span'); position.className = 'fixture-slider-context__position';
            const date = doc.createElement('span'); date.className = 'fixture-slider-context__date';
            summary.append(position, date);
            const jump = doc.createElement('button'); jump.type = 'button'; jump.className = 'fixture-slider-current';
            jump.addEventListener('click', () => {
                const state = states.get(input);
                if (!state?.navigation.canJump || input.disabled) return;
                input.value = state.navigation.currentValue;
                input.focus({preventScroll:true});
                input.dispatchEvent(new (doc.defaultView?.Event || Event)('input', {bubbles:true}));
            });
            controls.append(summary, jump); input.before(controls);
            const descriptions = new Set((input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
            descriptions.add(summary.id); input.setAttribute('aria-describedby', [...descriptions].join(' '));
        }
        const navigation = navigationState(entries, value, options);
        states.set(input, {controls, navigation});
        controls.hidden = !entries.length;
        controls.querySelector('.fixture-slider-context__position').textContent = navigation.positionLabel;
        const date = controls.querySelector('.fixture-slider-context__date'); date.textContent = navigation.dateLabel; date.hidden = !navigation.dateLabel;
        const jump = controls.querySelector('.fixture-slider-current'); jump.textContent = navigation.jumpLabel;
        jump.hidden = !navigation.canJump; jump.disabled = input.disabled;
        jump.setAttribute('aria-label', `${navigation.jumpLabel}: ${navigation.currentLabel}`);
    }
    return { markers, shortLabel, dateLabel, navigationState, update };
});
