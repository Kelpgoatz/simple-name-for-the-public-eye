(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else api.init(document);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const groups = [
        ['Australian rules', [['afl', 'AFL'], ['aflw', 'AFLW']]],
        ['Motorsport', [['f1', 'Formula 1'], ['f2', 'Formula 2'], ['f3', 'Formula 3']]],
        ['Rugby league', [['nrl', 'NRL'], ['nrlw', 'NRLW']]],
        ['Basketball', [['nba', 'NBA'], ['wnba', 'WNBA'], ['nbl', 'NBL']]],
        ['American football', [['nfl', 'NFL']]],
        ['Tennis', [['tennis', 'Grand Slam singles']]]
    ];
    const leagues = groups.flatMap(([category, items]) => items.map(([slug, label]) => [slug, label, category]));
    function init(doc) {
        if (!doc.body || doc.querySelector('.viewer-mobile-nav')) return;
        if (!doc.querySelector('script[data-viewer-guide-script]')) {
            const guide = doc.createElement('script');guide.src='viewer-guide.js';guide.dataset.viewerGuideScript='true';doc.head.appendChild(guide);
        }
        const guideButton=doc.createElement('button');guideButton.type='button';guideButton.className='viewer-guide-trigger';guideButton.dataset.viewerGuide='';guideButton.textContent='Quick guide';guideButton.setAttribute('aria-haspopup','dialog');
        doc.querySelector('.topbar-actions')?.prepend(guideButton);
        const current = location.pathname.split('/').pop() || 'index.html';
        const requestedSport = current === 'sport-view.html' ? new URLSearchParams(location.search).get('sport') : null;
        const activeSport = leagues.find(([slug]) => current === `${slug}.html` || requestedSport === slug)?.[0];
        const nav = doc.createElement('nav');
        nav.className = 'viewer-mobile-nav';
        nav.setAttribute('aria-label','Quick navigation');
        const icon = shape => `<svg class="viewer-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shape}</svg>`;
        nav.innerHTML = `<a href="index.html"${current === 'index.html' ? ' aria-current="page"' : ''}>${icon('<path d="M3 10.5 12 3l9 7.5M5 9v12h5v-7h4v7h5V9"/>')}<span>Home</span></a><button type="button" aria-haspopup="dialog" aria-controls="viewer-sports-drawer" aria-expanded="false">${icon('<path d="M7 3h10v5a5 5 0 0 1-10 0V3Zm5 10v6m-4 2h8M7 5H3v2a4 4 0 0 0 4 4m10-6h4v2a4 4 0 0 1-4 4"/>')}<span>Sports</span></button><a href="about.html"${current === 'about.html' ? ' aria-current="page"' : ''}>${icon('<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>')}<span>About</span></a>`;
        const trigger = nav.querySelector('button');
        if (activeSport) {
            trigger.classList.add('viewer-mobile-nav__active');
            const label = leagues.find(([slug]) => slug === activeSport)[1];
            trigger.setAttribute('aria-label', `Sports, browsing ${label}`);
        }
        const drawer = doc.createElement('dialog');
        drawer.id = 'viewer-sports-drawer';
        drawer.className = 'viewer-sports-drawer';
        drawer.setAttribute('aria-labelledby','viewer-sports-title');
        const heading = doc.createElement('div');
        heading.className = 'viewer-sports-drawer__head';
        heading.innerHTML = '<div><p>Browse by sport</p><h2 id="viewer-sports-title">Competitions</h2></div><button type="button" data-viewer-close aria-label="Close sports menu" autofocus>×</button>';
        const links = doc.createElement('div');
        links.className = 'viewer-sports-drawer__links';
        groups.forEach(([category, items]) => {
            const group = doc.createElement('section');
            group.className = 'viewer-sports-drawer__group';
            const title = doc.createElement('h3');
            title.textContent = category;
            group.appendChild(title);
            items.forEach(([slug, label]) => {
                const link = doc.createElement('a');
                link.href = `${slug}.html`;
                link.textContent = label;
                if (current === `${slug}.html`) link.setAttribute('aria-current', 'page');
                if (activeSport === slug) link.classList.add('viewer-sports-drawer__active');
                group.appendChild(link);
            });
            links.appendChild(group);
        });
        const theme = doc.createElement('button');
        theme.type = 'button';
        theme.className = 'viewer-drawer-theme';
        theme.dataset.viewerDrawerTheme = '';
        theme.textContent = 'Dark mode';
        theme.setAttribute('aria-pressed', String(doc.documentElement.dataset.theme === 'dark'));
        const footer = doc.createElement('p'); footer.className = 'viewer-sports-drawer__foot'; footer.textContent = 'Fixtures. Results. The performances behind them.';
        const guideMobile=guideButton.cloneNode(true);guideMobile.className='viewer-drawer-guide';guideMobile.textContent='Quick guide & sports terms';
        drawer.append(heading,links,guideMobile,theme,footer);
        doc.body.append(drawer,nav);
        const close = () => drawer.close();
        const mobile = matchMedia('(max-width: 720px)');
        trigger.addEventListener('click', () => {
            drawer.showModal();
            drawer.scrollTop = 0;
            doc.body.classList.add('viewer-menu-open');
            trigger.setAttribute('aria-expanded', 'true');
        });
        drawer.querySelector('[data-viewer-close]').addEventListener('click',close);
        links.addEventListener('click', event => {
            if (event.target.closest('a') && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) close();
        });
        drawer.addEventListener('click',event => { if (event.target === drawer) { const rect = drawer.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(); } });
        drawer.addEventListener('close', () => {
            doc.body.classList.remove('viewer-menu-open');
            trigger.setAttribute('aria-expanded', 'false');
            const restore = mobile.matches ? trigger : doc.querySelector('.nav--permanent > a');
            restore?.focus({ preventScroll: true });
        });
        mobile.addEventListener('change', event => { if (!event.matches && drawer.open) close(); });
        const skip = doc.createElement('a'); skip.className = 'viewer-skip-link'; skip.href = '#viewer-content'; skip.textContent = 'Skip to content';
        const content = doc.querySelector('main .hero, main article') || doc.querySelector('main');
        if (content) { if (!content.id) content.id = 'viewer-content'; else skip.href = `#${content.id}`; content.setAttribute('tabindex','-1'); doc.body.prepend(skip); }
        if (!doc.body.classList.contains('about-page') && !doc.querySelector('.viewer-site-footer')) {
            const siteFooter = doc.createElement('footer');
            siteFooter.className = 'viewer-site-footer';
            siteFooter.innerHTML = '<div><a class="viewer-site-footer__brand" href="index.html">cgrillo</a><p>Fixtures. Results. Performances.</p></div><nav aria-label="About this viewer"><a href="about.html">About the viewer</a><a href="about.html#competitions">All competitions</a><button type="button" data-viewer-guide>Quick guide</button><a href="about.html#about-data">Data &amp; sources</a></nav><a class="viewer-site-footer__top" href="#top">Back to top ↑</a>';
            (doc.querySelector('main.page') || doc.body).appendChild(siteFooter);
        }
    }
    return { leagues, init };
});
