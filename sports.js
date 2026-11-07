(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.SportsUI = api;
    if (typeof document !== "undefined") api.init(document);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";
    const teamNames = typeof module==='object' && module.exports ? require('./team-names.js') : typeof TeamNames!=='undefined' ? TeamNames : {label:(_,team)=>team?.name||'To be confirmed'};
    const escape = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
    const number = value => (typeof value === "number" || (typeof value === "string" && value.trim())) && Number.isFinite(Number(value)) ? Number(value) : null;
    const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
    const snapshotGroups = data => {
        if (!Array.isArray(data.groups) || !data.groups.every(group => object(group) && Array.isArray(group.matches) && group.matches.every(object))) {
            throw new Error("Invalid fixtures");
        }
        return data.groups;
    };
    const snapshotStandings = data => {
        const standings = data.standings ?? [];
        if (!Array.isArray(standings) || !standings.every(group => object(group) && Array.isArray(group.rows) && group.rows.every(object))) {
            throw new Error("Invalid standings");
        }
        return standings;
    };
    const value = input => number(input) === null ? "—" : escape(input);
    const safeUrl = input => {
        try { const url = new URL(input); return url.protocol === "https:" ? url.href : ""; } catch { return ""; }
    };
    const teamLink = (sport, team = {}) => `sport-view.html?sport=${encodeURIComponent(sport)}&team=${encodeURIComponent(team.id || team.name || '')}`;
    const date = (input, options = {}) => {
        if (!input || Number.isNaN(new Date(input).getTime())) return "Time TBC";
        return new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", ...options }).format(new Date(input));
    };
    const identity = (team = {}) => {
        const teamColor = typeof team.color === "string" ? team.color : "";
        const color = /^#?[\da-f]{6}$/i.test(teamColor) ? `#${teamColor.replace(/^#/, "")}` : "#073d2e";
        const initials = team.abbreviation || String(team.name || "TBC").split(/\s+/).map(word => word[0]).join("").slice(0, 3);
        const logo = safeUrl(team.logo);
        return `<span class="sports-identity" style="--team-color:${color}" aria-hidden="true">${escape(initials)}${logo ? `<img src="${escape(logo)}" alt="" loading="lazy">` : ""}</span>`;
    };
    const percent = input => {
        const numeric = number(input);
        if (numeric === null) return "—";
        return `${(numeric <= 1 ? numeric * 100 : numeric).toFixed(1)}%`;
    };
    const filteredMatches = (group, tour) => (Array.isArray(group?.matches) ? group.matches : []).filter(match => !tour || (match.tour || group.tour) === tour);
    const recentLive = (match, now, updatedAt) => {
        if (match.status !== "live") return false;
        const updated = Date.parse(updatedAt);
        if (Number.isFinite(updated) && now - updated > 90 * 60 * 1000) return false;
        const start = Date.parse(match.startTime);
        return !Number.isFinite(start) || (now - start <= 48 * 60 * 60 * 1000 && start <= now);
    };
    function initialGroupIndex(groups, now = Date.now(), tour = "", updatedAt) {
        if (!Array.isArray(groups) || !groups.length) return 0;
        const live = groups.findIndex(group => filteredMatches(group, tour).some(match => recentLive(match, now, updatedAt)));
        if (live >= 0) return live;
        const future = groups.findIndex(group => filteredMatches(group, tour).some(match => {
            const time = new Date(match.startTime).getTime();
            return ["scheduled", "postponed"].includes(match.status) && Number.isFinite(time) && time >= now;
        }));
        if (future >= 0) return future;
        // A released draw with no confirmed times should still be reachable by default.
        const undated = groups.findIndex(group => filteredMatches(group, tour).some(match => match.status === "scheduled" && !match.startTime));
        if (undated >= 0) return undated;
        for (let index = groups.length - 1; index >= 0; index--) {
            if (filteredMatches(groups[index], tour).length) return index;
        }
        return groups.length - 1;
    }
    function renderMatch(match = {}, sport, now = Date.now(), updatedAt) {
        const status = match.status || "scheduled";
        const staleLive = status === "live" && !recentLive(match, now, updatedAt);
        const statusLabel = staleLive ? "Update pending · last reported score" : match.statusDetail || ({ final: "Full time", live: "Live", postponed: "Postponed", cancelled: "Cancelled", scheduled: "Scheduled" }[status]) || status;
        const hasScores = status === "final" || status === "live";
        const sets = Array.isArray(match.sets) ? match.sets.filter(object) : [];
        const competitor = side => {
            const team = object(match[side]) ? match[side] : {};
            const winner = status === "final" && match.winner === side;
            const seed = number(team.seed) !== null ? ` <span class="sports-seed">[${escape(team.seed)}]</span>` : "";
            let score = hasScores ? value(match[`${side}Score`]) : "—";
            if (sport === "tennis" && hasScores && sets.length) score = `<span class="sports-sets"><span class="sports-visually-hidden">Set scores: </span>${sets.map(set => `<span class="sports-set">${value(set[side])}</span>`).join("")}</span>`;
            const name = `${escape(teamNames.label(sport,team))}${seed}${winner ? '<span class="sports-visually-hidden">, winner</span>' : ""}`;
            const participant = team.id || (team.name && !/^(?:tbc|tbd|to be confirmed)$/i.test(team.name))
                ? `<a class="sports-competitor__name" href="${teamLink(sport,team)}">${name}</a>`
                : `<span class="sports-competitor__name">${name}</span>`;
            return `<div class="sports-competitor${winner ? " sports-competitor--winner" : ""}">${identity(team)}${participant}<span class="sports-score">${score}</span></div>`;
        };
        const start = Date.parse(match.startTime);
        const time = Number.isFinite(start) ? `<time datetime="${new Date(start).toISOString()}">${escape(date(start, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }))}</time>` : "Time TBC";
        const link = safeUrl(match.url);
        const internal = match.id ? `<a class="sports-match-link viewer-game-link" href="sport-view.html?sport=${encodeURIComponent(sport)}&match=${encodeURIComponent(match.id)}">Game centre & player performances →</a>` : '';
        return `<article class="sports-fixture"><div class="sports-fixture__head"><span>${time}${match.roundLabel ? ` · ${escape(match.roundLabel)}` : ""}</span><span class="sports-status" data-status="${staleLive ? "pending" : status === "final" ? "finished" : escape(status)}">${escape(statusLabel)}</span></div>${competitor("home")}${competitor("away")}${match.venue ? `<p class="sports-fixture__venue">${escape(match.venue)}</p>` : ""}${internal}${link ? `<a class="sports-match-link viewer-source-link" href="${escape(link)}" target="_blank" rel="noopener noreferrer">Source ↗</a>` : ""}</article>`;
    }
    function standingColumns(sport) {
        if (sport === "afl" || sport === "aflw") return [["played", "P"], ["wins", "W"], ["losses", "L"], ["draws", "D"], ["percentage", "%"], ["points", "Pts"]];
        if (sport === "f1-drivers" || sport === "f1-constructors") return [["points", "Pts"], ["wins", "Wins"]];
        if (sport === "nrl" || sport === "nrlw") return [["played", "P"], ["wins", "W"], ["losses", "L"], ["draws", "D"], ["difference", "+/−"], ["points", "Pts"]];
        if (sport === "nba" || sport === "wnba") return [["wins", "W"], ["losses", "L"], ["winPct", "%"], ["gamesBehind", "GB"]];
        if (sport === "nfl") return [["wins", "W"], ["losses", "L"], ["draws", "T"], ["winPct", "%"]];
        return [["played", "P"], ["wins", "W"], ["losses", "L"], ["winPct", "%"]];
    }
    function standingDefinitions(sport) {
        const racing = sport === 'f1-drivers' || sport === 'f1-constructors';
        const definitions = {
            played: ['Games played', 'The number of games counted in this season’s record.'],
            wins: racing ? ['Grand Prix wins', sport === 'f1-drivers' ? 'Grand Prix races won by this driver.' : 'Grand Prix races won by a driver for this constructor.'] : ['Wins', 'Games won.'],
            losses: ['Losses', 'Games lost.'],
            draws: sport === 'nfl' ? ['Ties', 'Games that finished tied. A tie counts as half a win in the NFL’s winning percentage.'] : ['Draws', 'Games that finished level.'],
            percentage: ['Scoring percentage', 'Points scored ÷ points conceded × 100. A value of 130% means 130 points scored for every 100 conceded.'],
            winPct: sport === 'nfl' ? ['Winning percentage', '(Wins + half of ties) ÷ games played × 100.'] : ['Winning percentage', 'Games won ÷ games played × 100. A value of 60% means six wins in every ten games.'],
            gamesBehind: ['Games behind', 'The gap to the leader of this table. Half-games are possible when teams have played different numbers of games.'],
            difference: ['Points difference', 'Points scored minus points conceded. A positive number means the team has scored more than it conceded.'],
            points: racing ? ['Championship points', 'Published championship points, including sprint points when awarded.'] : ['Competition points', 'Points awarded under the competition’s rules, including bye points where awarded.']
        };
        return standingColumns(sport).map(([key, label]) => ({ key, label, title: definitions[key][0], meaning: definitions[key][1] }));
    }
    function renderTableKey(sport) {
        const guideSport = sport === 'f1-drivers' || sport === 'f1-constructors' ? 'f1' : sport;
        return `<details class="sports-table-key"><summary><span class="sports-table-key__icon" aria-hidden="true">+</span><strong>Table key</strong><span class="sports-table-key__hint">What the columns mean</span></summary><div class="sports-table-key__body"><dl><div><dt><b>#</b><span>Position</span></dt><dd>Position in the published standings, including the competition’s tie-breaking rules.</dd></div>${standingDefinitions(sport).map(column => `<div><dt><b>${escape(column.label)}</b><span>${escape(column.title)}</span></dt><dd>${escape(column.meaning)}</dd></div>`).join('')}</dl><p><span><b>—</b> The source has not supplied a verified value.</span><button type="button" data-viewer-guide data-guide-sport="${escape(guideSport)}" aria-haspopup="dialog">Quick guide ↗</button></p></div></details>`;
    }
    function renderStandings(group = {}, sport) {
        if (!Array.isArray(group.rows) || !group.rows.length) return '<p class="sports-empty">The ladder has not been published for this season yet.</p>';
        const columns = standingColumns(sport);
        const definitions = standingDefinitions(sport);
        const label = escape(group.label || "Standings");
        return `<div class="sports-table-wrap" tabindex="0" role="region" aria-label="${label} table"><table class="sports-table"><caption class="sports-visually-hidden">${label}</caption><thead><tr><th scope="col" title="Published position">#</th><th scope="col">${sport === "f1-drivers" ? "Driver" : "Team"}</th>${definitions.map(({ label, title }) => `<th scope="col" title="${escape(title)}" abbr="${escape(title)}">${label}</th>`).join("")}</tr></thead><tbody>${group.rows.map(row => `<tr><td>${value(row.rank)}</td><th scope="row"><span class="sports-table__team">${identity(row.team || {})}${sport.startsWith('f1-') || !row.team ? `<span>${escape(row.team?.name || "To be confirmed")}</span>` : `<a href="${teamLink(sport,row.team)}">${escape(teamNames.label(sport,row.team))}</a>`}</span></th>${columns.map(([key]) => {
            let stat = row[key];
            if (key === "difference") stat = number(row.for) !== null && number(row.against) !== null ? Number(row.for) - Number(row.against) : null;
            const formatted = key === "winPct" ? percent(stat) : key === "percentage" ? (number(stat) === null ? "—" : `${Number(stat).toFixed(1)}%`) : value(stat);
            return `<td${key === "points" || key === "winPct" ? ' class="sports-table__primary"' : ""}>${formatted}</td>`;
        }).join("")}</tr>`).join("")}</tbody></table></div>${renderTableKey(sport)}`;
    }
    function renderTournament(tournament = {}, now = Date.now()) {
        if (!tournament.name) return '<p class="sports-empty">The nearest Grand Slam will appear when its calendar is available.</p>';
        const start = Date.parse(tournament.startDate), end = Date.parse(tournament.endDate);
        const validDates = Number.isFinite(start) && Number.isFinite(end) && end >= start;
        const stage = Number.isFinite(start) && now < start ? "Upcoming" : !validDates ? "Dates pending" : now <= end ? "In progress" : "Completed";
        const dates = validDates ? `${date(tournament.startDate, { day: "numeric", month: "short" })} – ${date(tournament.endDate, { day: "numeric", month: "short", year: "numeric" })}` : "Dates to be confirmed";
        const url = safeUrl(tournament.url);
        return `<h4 class="tournament-title">${escape(tournament.name)}</h4><dl class="tournament-facts"><div><dt>Status</dt><dd>${stage}</dd></div><div><dt>Dates</dt><dd>${escape(dates)}</dd></div>${tournament.venue ? `<div><dt>Venue</dt><dd>${escape(tournament.venue)}</dd></div>` : ""}${tournament.surface ? `<div><dt>Surface</dt><dd>${escape(tournament.surface)}</dd></div>` : ""}</dl><p class="sports-footnote">Men’s and women’s singles. Match draws and start times appear as they are released by the provider.</p>${url ? `<a class="sports-match-link" href="${escape(url)}" target="_blank" rel="noopener noreferrer">Tournament details ↗</a>` : ""}`;
    }
    function dataNotices(data, sport, now = Date.now()) {
        const messages = [data.notice].filter(Boolean);
        const season = number(data.season), current = new Date(now), year = current.getUTCFullYear();
        // NBA/NBL use an ending year; NFL's starting year stays valid through its February final.
        const seasonYear = sport === "nfl" && current.getUTCMonth() < 2 ? year - 1 : year;
        if (sport !== "tennis" && season !== null && season > 2000 && season < seasonYear) messages.push(`Showing the latest published ${data.seasonLabel || `${data.season} season`}. The new season's data is not available yet.`);
        if (["aflw", "nrlw", "wnba"].includes(sport) && season !== null && season > year) messages.push(`The published ${data.seasonLabel || `${data.season} season`} is an upcoming season.`);
        const age = now - Date.parse(data.fixturesUpdatedAt || data.updatedAt);
        if (age > 48 * 60 * 60 * 1000) messages.push("Showing the latest saved update. Scores and schedules may have changed.");
        return messages;
    }
    function loadingPanel(panel, message, shape = "table") {
        panel.setAttribute("aria-busy", "true");
        panel.innerHTML = `<p class="sports-empty">${escape(message)}</p><div class="sports-skeleton sports-skeleton--${shape}" aria-hidden="true"><span></span><span></span><span></span></div>`;
    }
    function retryPanel(panel, message, retry) {
        panel.innerHTML = `<p class="sports-empty">${escape(message)}</p><button class="sports-retry" type="button">Try again</button>`;
        panel.querySelector(".sports-retry").addEventListener("click", retry);
        panel.removeAttribute("aria-busy");
    }
    function restorePanelFocus(panel) {
        const retry = panel.querySelector(".sports-retry");
        if (retry) retry.focus({ preventScroll: true });
        else {
            panel.setAttribute("tabindex", "-1");
            panel.focus({ preventScroll: true });
        }
    }
    function init(doc) {
        const sport = doc.body?.dataset.sport;
        if (!sport) return;
        const select = selector => doc.querySelector(selector);
        const list = select("[data-fixtures-list]"), ladder = select("[data-standings]");
        if (!list || !ladder) return;
        doc.addEventListener("error", event => { if (event.target.matches?.(".sports-identity img")) event.target.remove(); }, true);
        let fixtureData, ladderData, groups = [], standings = [], index = 0, standingIndex = 0, tour = "";
        const notice = select("[data-sports-notice]");
        const slider = select("[data-round-slider]"), prev = select("[data-round-prev]"), next = select("[data-round-next]");
        const rememberView=()=>{
            const url=new URL(location.href),group=groups[index],standing=standings[standingIndex];
            if(group?.id!=null)url.searchParams.set('group',String(group.id));
            if(standing?.id!=null)url.searchParams.set('standing',String(standing.id));
            if(tour)url.searchParams.set('tour',tour);
            history.replaceState(null,'',url);
        };
        const updateFixtures = () => {
            const group = groups[index];
            slider.max = String(Math.max(0, groups.length - 1));
            slider.value = String(index);
            slider.disabled = groups.length < 2;
            prev.disabled = index <= 0;
            next.disabled = index >= groups.length - 1;
            select("[data-round-value]").textContent = group?.label || "Awaiting draw";
            slider.setAttribute("aria-valuetext", group?.label || "Awaiting draw");
            rememberView();
            FixtureSlider.update(slider, groups.map((item, value) => ({value, label:item.label, date:item.startDate,endDate:item.endDate||(item.matches||[]).map(match=>match.startTime).filter(time=>Number.isFinite(Date.parse(time))).sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1)})),{unit:sport==="nfl"?"weeks":["nba","wnba","nbl","tennis"].includes(sport)?"days":"rounds"});
            const matches = filteredMatches(group, tour);
            const releasedTour = groups.some(item => filteredMatches(item, tour).length);
            const tennisEmpty = releasedTour ? `No ${tour === "wta" ? "women’s" : "men’s"} singles matches on this date. Use the day slider to view the rest of the tournament.` : "Matches will appear once the tournament draw is released. You can switch between the men’s and women’s singles above.";
            const now = Date.now(), updatedAt = fixtureData.fixturesUpdatedAt || fixtureData.updatedAt;
            list.innerHTML = matches.length ? matches.map(match => renderMatch(match, sport, now, updatedAt)).join("") : `<p class="sports-empty">${sport === "tennis" ? tennisEmpty : "No fixtures have been published for this selection yet."}</p>`;
            if (sport !== 'tennis' && typeof SportView !== 'undefined') {
                let tallies = select('[data-sport-tallies]');
                if (!tallies) { tallies=doc.createElement('section');tallies.className='viewer-round-tallies';tallies.dataset.sportTallies='';list.parentElement.appendChild(tallies); }
                SportView.roundTallies(tallies,sport,fixtureData.season,{...group,matches});
            }
            const byes = Array.isArray(group?.byes) && group.byes.length ? `Bye: ${group.byes.join(", ")}.` : "";
            select("[data-fixtures-note]").textContent = [group?.note || fixtureData.fixturesNote, byes].filter(Boolean).join(" ");
        };
        const updateLadder = () => {
            rememberView();
            ladder.innerHTML = sport === "tennis" ? renderTournament(ladderData.tournament ?? {}) : renderStandings(standings[standingIndex], sport);
            const lastUpdated = ladderData.standingsUpdatedAt || ladderData.updatedAt;
            const freshness = standings[standingIndex]?.rows.length && Number.isFinite(Date.parse(lastUpdated))
                ? `Standings updated ${date(lastUpdated, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })} Sydney time.` : "";
            select("[data-ladder-note]").textContent = [ladderData.standingsNote, freshness].filter(Boolean).join(" ");
        };
        const tabs = (element, groups, active, change) => {
            element.hidden = groups.length < 2;
            element.replaceChildren();
            groups.forEach((group, position) => {
                const button = doc.createElement("button");
                button.type = "button";
                button.textContent = group.label;
                button.setAttribute("aria-pressed", String(position === active));
                button.addEventListener("click", () => { change(position); Array.from(element.children).forEach((child, i) => child.setAttribute("aria-pressed", String(i === position))); });
                element.appendChild(button);
            });
        };
        prev.addEventListener("click", () => { index = Math.max(0, index - 1); updateFixtures(); });
        next.addEventListener("click", () => { index = Math.min(groups.length - 1, index + 1); updateFixtures(); });
        slider.addEventListener("input", () => { index = Math.max(0, Math.min(groups.length - 1, Number(slider.value))); updateFixtures(); });
        const showFixtures = (data, params) => {
            groups = snapshotGroups(data);
            fixtureData = data;
            const tours = Array.isArray(data.tours) ? data.tours.filter(object) : [];
            const requestedTour = params.get("tour");
            tour = tours.some(item => item.id === requestedTour) ? requestedTour : tours[0]?.id || "";
            const updatedAt = data.fixturesUpdatedAt || data.updatedAt;
            const defaultGroup = () => initialGroupIndex(groups, Date.now(), tour, updatedAt);
            const requestedIndex = groups.findIndex(group => String(group.id) === params.get("group"));
            index = requestedIndex >= 0 ? requestedIndex : defaultGroup();
            select("[data-updated]").textContent = Number.isFinite(Date.parse(updatedAt)) ? `Fixtures updated ${date(updatedAt, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })} Sydney time` : "";
            tabs(select("[data-fixture-tabs]"), tours, tours.findIndex(item => item.id === tour), position => {
                tour = tours[position].id;
                index = defaultGroup();
                updateFixtures();
            });
            updateFixtures();
        };
        const showStandings = (data, params) => {
            if (sport === "tennis" && data.tournament != null && !object(data.tournament)) throw new Error("Invalid tournament");
            standings = sport === "tennis" ? [] : snapshotStandings(data);
            ladderData = data;
            standingIndex = Math.max(0, standings.findIndex(group => String(group.id) === params.get("standing")));
            tabs(select("[data-standing-tabs]"), standings, standingIndex, position => { standingIndex = position; updateLadder(); });
            updateLadder();
        };
        const showMetadata = data => {
            select("[data-season-label]").textContent = data.seasonLabel || (data.season ? `${data.season} season` : "Current season");
            const messages = dataNotices(data, sport);
            notice.textContent = messages.join(" "); notice.hidden = !messages.length;
            const sources = (Array.isArray(data.sources) ? data.sources : [data.source]).filter(object);
            select("[data-source]").innerHTML = sources.length ? `Source: ${sources.map(source => safeUrl(source.url) ? `<a href="${escape(safeUrl(source.url))}" target="_blank" rel="noopener noreferrer">${escape(source.name || "Data provider")}</a>` : escape(source.name || "Data provider")).join(" · ")}` : "Fixtures and results are refreshed automatically.";
        };
        const unavailable = new Set([
            { panel: list, show: showFixtures, shape: "fixtures", name: sport === "tennis" ? "matches" : "fixtures" },
            { panel: ladder, show: showStandings, shape: "table", name: sport === "tennis" ? "tournament information" : "standings" }
        ]);
        let loading = false;
        async function loadCompetition() {
            if (loading) return;
            loading = true;
            const sections = [...unavailable];
            const focused = sections.find(({ panel }) => panel.contains(doc.activeElement));
            for (const { panel, shape, name } of sections) loadingPanel(panel, `Loading ${name}…`, shape);
            let snapshot;
            try {
                const data = await SportsSnapshots.read(`sports-data/${sport}.json`);
                if (!object(data) || data.sport !== sport) throw new Error("Unexpected sports data");
                showMetadata(data);
                snapshot = data;
            } catch {}
            const params = new URLSearchParams(location.search);
            for (const section of sections) {
                const { panel, show, name } = section;
                try {
                    if (!snapshot) throw new Error("Snapshot unavailable");
                    show(snapshot, params);
                    panel.removeAttribute("aria-busy");
                    unavailable.delete(section);
                } catch {
                    retryPanel(panel, `Unable to load ${name} right now.`, loadCompetition);
                }
            }
            loading = false;
            if (focused && doc.activeElement === doc.body) restorePanelFocus(focused.panel);
        }
        loadCompetition();
    }
    return { escape, safeUrl, identity, teamLink, filteredMatches, recentLive, initialGroupIndex, renderMatch, standingColumns, standingDefinitions, renderTableKey, renderStandings, renderTournament, dataNotices, snapshotGroups, loadingPanel, retryPanel, restorePanelFocus, init };
});
