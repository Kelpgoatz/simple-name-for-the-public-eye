(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.SportIdentity = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const aliases = { adelaide: 'adelaidecrows', geelong: 'geelongcats', goldcoast: 'goldcoastsuns', greaterwesternsydney: 'gwsgiants', sydney: 'sydneyswans', westcoast: 'westcoasteagles', fremantledockers: 'fremantle', tasmania: 'tasmaniadevils' };
    function find(data, type, key) {
        if (type === 'afl') { const name = normalize(key); return data.afl?.[aliases[name] || name] || data.afl?.[name]; }
        return data[type]?.[key];
    }
    let loading;
    const load = () => loading ||= fetch('sport-identities.json', { cache: 'no-cache' }).then(response => {
        if (!response.ok) throw new Error('Identity data unavailable');
        return response.json();
    }).catch(() => ({}));
    function apply(element, type, key) {
        if (!element || !key) return;
        load().then(data => {
            const identity = find(data, type, key);
            if (!identity?.image || !/^https:\/\//.test(identity.image)) return;
            const image = document.createElement('img');
            image.className = 'sport-identity__image';
            image.alt = type === 'drivers' ? identity.nationality || '' : '';
            image.decoding = 'async';
            image.addEventListener('load', () => {
                element.classList.add('sport-identity', `sport-identity--${type}`);
                element.dataset.identityLoaded = 'true';
                element.appendChild(image);
            }, { once: true });
            image.addEventListener('error', () => image.remove(), { once: true });
            image.src = identity.image;
        });
    }
    function inline(parent, type, key) {
        const badge = document.createElement('span');
        badge.className = 'sport-identity-inline';
        badge.setAttribute('aria-hidden', 'true');
        parent.prepend(badge);
        apply(badge, type, key);
    }
    return { normalize, find, apply, inline, afl: (element, name) => apply(element, 'afl', name), driver: (element, id) => apply(element, 'drivers', id), team: (element, id) => apply(element, 'constructors', id) };
});
