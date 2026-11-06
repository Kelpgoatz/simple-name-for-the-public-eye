(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else {
        root.ViewerGuide = api;
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => api.init(document));
        else api.init(document);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    const competitions = {
        afl: ['AFL', 'football'], aflw: ['AFLW', 'football'], nrl: ['NRL', 'rugby'], nrlw: ['NRLW', 'rugby'],
        nba: ['NBA', 'basketball'], wnba: ['WNBA', 'basketball'], nbl: ['NBL', 'basketball'], nfl: ['NFL', 'american'],
        f1: ['Formula 1', 'racing'], f2: ['Formula 2', 'racing'], f3: ['Formula 3', 'racing'], tennis: ['Tennis', 'tennis']
    };
    const explanations = {
        general: 'Start with a competition, then choose a fixture or result. Select a team or driver name to see the performances behind it.',
        football: 'Slide between rounds to find a game. Open a completed game for individual performances, or select a team for its season dashboard.',
        rugby: 'Slide between rounds to find a game. Open a completed game for individual performances, or select a team for its season dashboard.',
        basketball: 'Browse games by date or round. Open a result for player performances, or select a team to explore its season. NBA and WNBA have separate competition pages.',
        american: 'Browse by week and open a game for player performances. The ladder switches between the AFC and NFC conferences.',
        racing: 'Choose a race weekend with the slider, then a practice, qualifying, sprint or race session. Select a driver or team name to explore its performances.',
        tennis: 'Choose a tournament round to browse the singles draws. Each match shows its set scores when the source supplies them.'
    };
    const terms = [
        ['Fixture', 'A scheduled game, match or race weekend.', 'common', 'schedule upcoming'],
        ['Ladder / standings', 'The competition table. Position follows the points and ranking rules of that competition.', 'common', 'rank ranking table'],
        ['Live', 'The saved source reports that play is in progress. Updates can arrive after the action.', 'common', 'in progress score'],
        ['Pending / update pending', 'The start time has passed, but the source has not supplied a confirmed result or current status.', 'common', 'waiting overdue'],
        ['— / not available', 'This value was not supplied or could not be verified. A dash is not a score of zero.', 'common', 'missing unavailable dash'],
        ['W / L / D', 'Wins, losses and draws. Some competitions do not allow a draw.', 'common', 'won lost drawn'],
        ['Total / average', 'Total adds the available performances together. Average divides the available total by the number of counted performances.', 'common', 'stats statistics per game'],
        ['WDC', 'World Drivers’ Championship: the Formula 1 drivers’ points table.', 'racing', 'driver championship'],
        ['WCC', 'World Constructors’ Championship: the Formula 1 teams’ points table.', 'racing', 'constructor team championship'],
        ['P1 / P2 / P3', 'On the session selector, these are practice 1, 2 and 3. In a result, P1, P2 and P3 mean first, second and third position.', 'racing', 'fp1 fp2 fp3 practice position podium'],
        ['Q / SQ', 'Qualifying and sprint qualifying. These sessions set the starting order for the race and sprint.', 'racing', 'qualy qualification shootout'],
        ['Grid', 'A driver’s starting position. “Pit lane” is shown only when that start is confirmed by the source.', 'racing', 'start starting pitlane'],
        ['Gap from leader', 'The difference from the session leader. In fastest lap order, it is the difference from the quickest lap.', 'racing', 'gap fastest car'],
        ['Interval', 'The difference from the driver immediately ahead in the displayed order. In fastest lap order, it compares the two lap times.', 'racing', 'gap ahead'],
        ['Fastest lap order', 'Sorts drivers by their best lap time. The position and points columns still show their actual race result.', 'racing', 'purple fastest lap sort'],
        ['DNF / DNS / DSQ', 'Did not finish, did not start and disqualified. The source may instead show a specific retirement reason.', 'racing', 'retired disqualification'],
        ['PTS', 'Points awarded towards the championship. Fastest lap highlighting does not itself mean bonus points were awarded.', 'racing', 'points championship score'],
        ['Disposals', 'A player’s kicks plus handballs.', 'football', 'disposal handball kick player tally'],
        ['Percentage', 'Points scored divided by points conceded, multiplied by 100. It can separate teams with equal competition points.', 'football', 'pct percent for against'],
        ['Clearance', 'Winning the ball away from a stoppage.', 'football', 'clearances stoppage'],
        ['Hitout', 'A ruck contest tap credited to a player.', 'football', 'hitouts ruck'],
        ['PD / +–', 'Points difference: points scored minus points conceded.', 'rugby', 'for against points difference differential'],
        ['Run metres', 'The distance a player carries the ball, as recorded by the source.', 'rugby', 'running metres meters'],
        ['PTS / REB / AST', 'Points, rebounds and assists in a basketball performance.', 'basketball', 'points rebounds assists player stats'],
        ['PCT / win %', 'The share of games won. A value of .600 means a 60% winning record.', 'basketball', 'percentage wins record'],
        ['Conference', 'A group of teams within the league. Select a conference to see its own standings.', 'basketball', 'east west eastern western'],
        ['PF / PA', 'Points for and points against: what a team scored and conceded.', 'american', 'for against score conceded'],
        ['PCT', 'The winning percentage. In the NFL, a tie counts as half a win when calculating it.', 'american', 'percentage win record tie'],
        ['AFC / NFC', 'The American Football Conference and National Football Conference, the NFL’s two conference tables.', 'american', 'conference'],
        ['Passing / rushing / receiving', 'Throwing the ball, running with it and catching a pass. Player tallies separate these types of performance.', 'american', 'yards touchdown'],
        ['Set score', 'Games won in each set, shown in the order the sets were played.', 'tennis', 'games sets result'],
        ['Tie-break', 'A points game used to decide a tied set under the tournament’s rules. A small number beside a set score can show the tie-break points.', 'tennis', 'tiebreak small number'],
        ['Draw / seed', 'The draw is the tournament’s match bracket. A seed is a player’s assigned tournament ranking, not the final result.', 'tennis', 'bracket seeded seed ranking']
    ].map(([term, meaning, group, keywords]) => ({ term, meaning, group, keywords }));
    const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const validSport = value => Object.hasOwn(competitions, value) ? value : '';
    function contextFor(pathname = '', search = '') {
        const page = String(pathname).split('/').pop().replace(/\.html$/i, '');
        const sport = validSport(page) || validSport(new URLSearchParams(search).get('sport'));
        const group = sport ? competitions[sport][1] : 'general';
        return { sport, group, label: sport ? competitions[sport][0] : 'All sport', explanation: explanations[group] };
    }
    function glossaryFor(sport = '', query = '') {
        const chosen = validSport(sport), group = chosen ? competitions[chosen][1] : '';
        const words = normalize(query).split(/\s+/).filter(Boolean);
        return terms.filter(entry => (!group || entry.group === 'common' || entry.group === group) && words.every(word => normalize(`${entry.term} ${entry.meaning} ${entry.keywords}`).includes(word)));
    }
    function glossaryMarkup(entries) {
        return entries.map(entry => `<div class="viewer-guide__term"><dt>${escape(entry.term)}</dt><dd>${escape(entry.meaning)}</dd></div>`).join('');
    }
    function previewTerms(entries, sport = '', expanded = false, query = '') {
        const chosen = validSport(sport), group = chosen ? competitions[chosen][1] : 'common';
        const ordered = [...entries.filter(entry => entry.group === group), ...entries.filter(entry => entry.group !== group)];
        return expanded || normalize(query) ? ordered : ordered.slice(0, 6);
    }
    let openDialog;
    function init(doc) {
        if (!doc.body || doc.getElementById('viewer-guide')) return;
        const dialog = doc.createElement('dialog');
        dialog.id = 'viewer-guide'; dialog.className = 'viewer-guide';
        dialog.setAttribute('aria-labelledby', 'viewer-guide-title');
        dialog.setAttribute('aria-describedby', 'viewer-guide-intro');
        dialog.innerHTML = `<div class="viewer-guide__head"><div><p class="viewer-guide__eyebrow">A little help</p><h2 id="viewer-guide-title">Make yourself at home.</h2></div><button class="viewer-guide__close" type="button" aria-label="Close guide" autofocus>×</button></div><p id="viewer-guide-intro" class="viewer-guide__intro">Your place for fixtures, results and the performances behind them. Here’s how to find your way around.</p><ol class="viewer-guide__steps"><li><span>01</span><div><strong>Find your game</strong><p>Choose a sport or use Search sport to find a team or driver. The round slider takes you through its fixtures.</p></div></li><li><span>02</span><div><strong>Look a little closer</strong><p>Open a game for its performances. Select a team or driver name to visit its dashboard.</p></div></li><li><span>03</span><div><strong>Make it yours</strong><p>Select a star to follow a competition, team or driver. Manage stars brings your favourites together.</p></div></li></ol><div class="viewer-guide__context"><strong data-guide-context-title></strong><p data-guide-context-copy></p></div><section class="viewer-guide__glossary" aria-labelledby="viewer-guide-terms-title"><h3 id="viewer-guide-terms-title">What do the labels mean?</h3><div class="viewer-guide__filters"><label>Guide to<select data-guide-competition><option value="">All sport</option>${Object.entries(competitions).map(([sport, [name]]) => `<option value="${sport}">${name}</option>`).join('')}</select></label><label>Find a term<input type="search" data-guide-query placeholder="Try interval, disposals or PCT…" autocomplete="off"></label></div><p class="viewer-guide__count" aria-live="polite" role="status" data-guide-count></p><dl class="viewer-guide__terms" data-guide-terms></dl></section><section class="viewer-guide__legend" aria-labelledby="viewer-guide-legend-title"><h3 id="viewer-guide-legend-title">A few visual cues</h3><dl><div><dt><span class="viewer-guide__swatch viewer-guide__swatch--purple" aria-hidden="true"></span>Purple lap time</dt><dd>Highlights the session’s fastest lap. Fastest lap order is also purple.</dd></div><div><dt><span class="viewer-guide__podium" aria-hidden="true"><i></i><i></i><i></i></span>Gold, silver &amp; bronze</dt><dd>Mark the first three places in a racing result.</dd></div><div><dt><span class="viewer-guide__star" aria-hidden="true">★</span>Your stars</dt><dd>Shape the games and ladders on your homepage. With no stars, the default selection returns.</dd></div><div><dt><span class="viewer-guide__swatch viewer-guide__swatch--pending" aria-hidden="true"></span>Missing values</dt><dd>A dash means the source has not supplied a verified value. Coverage can vary by competition and game.</dd></div></dl></section><p class="viewer-guide__foot">Stars stay on this device. No account needed. <a href="about.html#about-data">Read about data &amp; sources ↗</a></p>`;
        doc.body.appendChild(dialog);
        const competition = dialog.querySelector('[data-guide-competition]'), query = dialog.querySelector('[data-guide-query]');
        const closeButton = dialog.querySelector('.viewer-guide__close');
        const termList = dialog.querySelector('[data-guide-terms]');
        termList.id = 'viewer-guide-term-list';
        const expandTerms = doc.createElement('button');
        expandTerms.type = 'button'; expandTerms.className = 'viewer-guide__more';
        expandTerms.setAttribute('aria-controls', termList.id);
        termList.after(expandTerms);
        let lastFocus, expanded = false;
        function render() {
            const sport = validSport(competition.value), context = contextFor(sport ? `${sport}.html` : '');
            dialog.querySelector('[data-guide-context-title]').textContent = sport ? `Finding your way around ${context.label}` : 'Start wherever your sport takes you';
            dialog.querySelector('[data-guide-context-copy]').textContent = context.explanation;
            const entries = glossaryFor(sport, query.value);
            const visible = previewTerms(entries, sport, expanded, query.value);
            termList.innerHTML = glossaryMarkup(visible);
            dialog.querySelector('[data-guide-count]').textContent = entries.length ? `${visible.length < entries.length ? `${visible.length} of ` : ''}${entries.length} ${entries.length === 1 ? 'term' : 'terms'}${sport ? ` for ${context.label}` : ''}.` : 'No matching terms. Try a shorter word, or choose All sport.';
            expandTerms.hidden = entries.length <= 6 || Boolean(normalize(query.value));
            expandTerms.textContent = expanded ? 'Show fewer terms' : `Browse all ${entries.length} terms`;
            expandTerms.setAttribute('aria-expanded', String(expanded));
        }
        openDialog = ({ sport, origin } = {}) => {
            lastFocus = origin || doc.activeElement;
            const inferred = contextFor(root.location?.pathname, root.location?.search).sport;
            competition.value = sport === '' ? '' : validSport(sport) || inferred;
            query.value = ''; expanded = false;
            const otherDialogs = [...doc.querySelectorAll('#viewer-sports-drawer[open], #viewer-discovery[open]')];
            otherDialogs.forEach(other => other.close());
            const show = () => {
                render();
                if (!dialog.open) dialog.showModal();
                doc.body.classList.add('viewer-guide-open');
                closeButton.focus({ preventScroll: true });
            };
            if (otherDialogs.length) (root.requestAnimationFrame || (callback => root.setTimeout(callback, 0)))(show);
            else show();
            return true;
        };
        doc.addEventListener('click', event => {
            const trigger = event.target.closest?.('[data-viewer-guide]');
            if (!trigger) return;
            event.preventDefault();
            openDialog({ sport: trigger.dataset.guideSport, origin: trigger });
        });
        closeButton.addEventListener('click', () => dialog.close());
        dialog.addEventListener('click', event => {
            if (event.target !== dialog) return;
            const box = dialog.getBoundingClientRect();
            if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
        });
        dialog.addEventListener('close', () => {
            doc.body.classList.remove('viewer-guide-open');
            if (lastFocus?.isConnected && !lastFocus.closest('dialog:not([open])')) lastFocus.focus();
            else (doc.querySelector('.viewer-mobile-nav button') || doc.querySelector('[data-viewer-guide]'))?.focus();
        });
        competition.addEventListener('change', () => { expanded = false; render(); });
        query.addEventListener('input', () => { expanded = false; render(); });
        expandTerms.addEventListener('click', () => { expanded = !expanded; render(); });
    }
    return { competitions, contextFor, glossaryFor, glossaryMarkup, previewTerms, init, open(options) { if (!openDialog && root.document) init(root.document); return openDialog ? openDialog(options) : false; } };
});
