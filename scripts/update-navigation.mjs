import { readFile, writeFile } from 'node:fs/promises';

const pages = ['index', 'article', 'melbourne', 'afl', 'aflw', 'f1', 'f2', 'nrl', 'nrlw', 'nba', 'wnba', 'nbl', 'nfl', 'tennis', 'about', 'sport-view'];
const families = { afl: [['afl', 'AFL'], ['aflw', 'AFLW']], nrl: [['nrl', 'NRL'], ['nrlw', 'NRLW']], nba: [['nba', 'NBA'], ['wnba', 'WNBA']] };
for (const page of pages) {
    const anchor = (slug, label) => `<a href="${slug}.html"${page === slug ? ' aria-current="page"' : ''}>${label}</a>`;
    const family = id => {
        const links = families[id].map(([slug, label]) => anchor(slug, label)).join('');
        const current = families[id].some(([slug]) => slug === page);
        return `<div class="sport-family" data-league-group="${id}"${current ? ' data-current="true"' : ''}>
                            <button class="sport-nav__toggle" type="button" data-league-toggle aria-expanded="false" aria-controls="${id}-menu ${id}-subnav">${id.toUpperCase()} <span class="sport-nav__chevron" aria-hidden="true"></span></button>
                            <div class="sport-nav__dropdown" id="${id}-menu" data-league-menu hidden>${links}</div>
                            <div class="sport-family__subnav" id="${id}-subnav" data-league-subnav role="group" aria-label="${id.toUpperCase()} competitions" hidden>${links}</div>
                        </div>`;
    };
    const nav = `<nav class="nav nav--permanent" aria-label="Primary">
                        ${anchor('index', 'Home')}
                        ${family('afl')}
                        <div class="f1-nav-family">${anchor('f1', 'F1')}<div class="f1-nav-family__menu">${anchor('f2', 'F2')}</div></div>
                        ${family('nrl')}
                        ${family('nba')}
                        ${anchor('nbl', 'NBL')}
                        ${anchor('nfl', 'NFL')}
                        ${anchor('tennis', 'Tennis')}
                        ${anchor('about', 'About')}
                    </nav>`;
    const file = new URL(`../${page}.html`, import.meta.url);
    const html = await readFile(file, 'utf8');
    const pattern = /<nav class="nav(?: nav--permanent)?" aria-label="Primary">[\s\S]*?<\/nav>/;
    if (!pattern.test(html)) throw new Error(`Primary navigation missing: ${page}`);
    const updated = html.replace(pattern, nav).replace(/(<p class="masthead-caption">)[\s\S]*?(<\/p>)/, '$1Sports viewer$2');
    await writeFile(file, updated);
}
console.log(`Updated permanent sports navigation on ${pages.length} pages`);
