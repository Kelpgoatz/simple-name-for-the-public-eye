(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.SportsUI = api;
    if (typeof document !== "undefined") api.init(document);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";
    const teamNames = typeof module==='object' && module.exports ? require('./team-names.js') : typeof TeamNames!=='undefined' ? TeamNames : {label:(_,team)=>team?.name||'To be confirmed'};
    const escape = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
    const number = value => value !== null && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
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
        const color = /^#?[\da-f]{6}$/i.test(team.color || "") ? `#${team.color.replace(/^#/, "")}` : "#073d2e";
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
    const recentLive = (match, now) => {
        if (match.status !== "live") return false;
        const start = new Date(match.startTime).getTime();
        return !Number.isFinite(start) || (now - start <= 48 * 60 * 60 * 1000 && start - now <= 24 * 60 * 60 * 1000);
    };
    function initialGroupIndex(groups, now = Date.now(), tour = "") {
        if (!Array.isArray(groups) || !groups.length) return 0;
        const live = groups.findIndex(group => filteredMatches(group, tour).some(match => recentLive(match, now)));
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
    function renderMatch(match = {}, sport, now = Date.now()) {
        const status = match.status || "scheduled";
        const staleLive = status === "live" && !recentLive(match, now);
        const statusLabel = staleLive ? `Update pending${match.statusDetail ? ` · last reported ${match.statusDetail}` : ""}` : match.statusDetail || ({ final: "Full time", live: "Live", postponed: "Postponed", cancelled: "Cancelled", scheduled: "Scheduled" }[status]) || status;
        const hasScores = status === "final" || status === "live";
        const sets = Array.isArray(match.sets) ? match.sets : [];
        const competitor = side => {
            const team = match[side] || {};
            const winner = match.winner === side;
            const seed = number(team.seed) !== null ? ` <span class="sports-seed">[${escape(team.seed)}]</span>` : "";
            let score = hasScores ? value(match[`${side}Score`]) : "—";
            if (sport === "tennis" && sets.length) score = `<span class="sports-sets" aria-label="Set scores">${sets.map(set => `<span class="sports-set">${value(set[side])}</span>`).join("")}</span>`;
            return `<div class="sports-competitor${winner ? " sports-competitor--winner" : ""}">${identity(team)}<a class="sports-competitor__name" href="${teamLink(sport,team)}">${escape(teamNames.label(sport,team))}${seed}${winner ? '<span class="sports-visually-hidden">, winner</span>' : ""}</a><span class="sports-score">${score}</span></div>`;
        };
        const time = date(match.startTime, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
        const link = safeUrl(match.url);
        const internal = match.id ? `<a class="sports-match-link viewer-game-link" href="sport-view.html?sport=${encodeURIComponent(sport)}&match=${encodeURIComponent(match.id)}">Game centre & player performances →</a>` : '';
        return `<article class="sports-fixture"><div class="sports-fixture__head"><span>${escape(time)}${match.roundLabel ? ` · ${escape(match.roundLabel)}` : ""}</span><span class="sports-status" data-status="${staleLive ? "pending" : status === "final" ? "finished" : escape(status)}">${escape(statusLabel)}</span></div>${competitor("home")}${competitor("away")}${match.venue ? `<p class="sports-fixture__venue">${escape(match.venue)}</p>` : ""}${internal}${link ? `<a class="sports-match-link viewer-source-link" href="${escape(link)}" target="_blank" rel="noopener noreferrer">Source ↗</a>` : ""}</article>`;
    }
    function standingColumns(sport) {
        if (sport === "afl" || sport === "aflw") return [["played", "P"], ["wins", "W"], ["losses", "L"], ["draws", "D"], ["percentage", "%"], ["points", "Pts"]];
        if (sport === "f1-drivers" || sport === "f1-constructors") return [["points", "Pts"], ["wins", "Wins"]];
        if (sport === "nrl" || sport === "nrlw") return [["played", "P"], ["wins", "W"], ["losses", "L"], ["draws", "D"], ["difference", "+/−"], ["points", "Pts"]];
        if (sport === "nba" || sport === "wnba") return [["wins", "W"], ["losses", "L"], ["winPct", "%"], ["gamesBehind", "GB"]];
        if (sport === "nfl") return [["wins", "W"], ["losses", "L"], ["draws", "T"], ["winPct", "%"]];
        return [["played", "P"], ["wins", "W"], ["losses", "L"], ["winPct", "%"]];
    }
    function renderStandings(group = {}, sport) {
        if (!Array.isArray(group.rows) || !group.rows.length) return '<p class="sports-empty">The ladder has not been published for this season yet.</p>';
        const columns = standingColumns(sport);
        return `<div class="sports-table-wrap"><table class="sports-table"><caption class="sports-visually-hidden">${escape(group.label || "Standings")}</caption><thead><tr><th scope="col">#</th><th scope="col">${sport === "f1-drivers" ? "Driver" : "Team"}</th>${columns.map(([, label]) => `<th scope="col">${label}</th>`).join("")}</tr></thead><tbody>${group.rows.map(row => `<tr><td>${value(row.rank)}</td><td><span class="sports-table__team">${identity(row.team)}${sport.startsWith('f1-') ? `<span>${escape(row.team?.name || "To be confirmed")}</span>` : `<a href="${teamLink(sport,row.team)}">${escape(teamNames.label(sport,row.team))}</a>`}</span></td>${columns.map(([key]) => {
            let stat = row[key];
            if (key === "difference") stat = number(row.for) !== null && number(row.against) !== null ? Number(row.for) - Number(row.against) : null;
            const formatted = key === "winPct" ? percent(stat) : key === "percentage" ? (number(stat) === null ? "—" : `${Number(stat).toFixed(1)}%`) : value(stat);
            return `<td${key === "points" || key === "winPct" ? ' class="sports-table__primary"' : ""}>${formatted}</td>`;
        }).join("")}</tr>`).join("")}</tbody></table></div>`;
    }
    function renderTournament(tournament = {}, now = Date.now()) {
        if (!tournament.name) return '<p class="sports-empty">The nearest Grand Slam will appear when its calendar is available.</p>';
        const start = new Date(tournament.startDate).getTime(), end = new Date(tournament.endDate).getTime();
        const stage = Number.isFinite(start) && now < start ? "Upcoming" : Number.isFinite(end) && now <= end ? "In progress" : "Completed";
        const dates = tournament.startDate && tournament.endDate ? `${date(tournament.startDate, { day: "numeric", month: "short" })} – ${date(tournament.endDate, { day: "numeric", month: "short", year: "numeric" })}` : "Dates to be confirmed";
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
        const age = now - new Date(data.updatedAt).getTime();
        if (age > 48 * 60 * 60 * 1000) messages.push("Showing the latest saved update. Scores and schedules may have changed.");
        return messages;
    }
    function init(doc) {
        const sport = doc.body?.dataset.sport;
        if (!sport) return;
        const select = selector => doc.querySelector(selector);
        const list = select("[data-fixtures-list]"), ladder = select("[data-standings]");
        if (!list || !ladder) return;
        const themeButton = select("[data-theme-toggle]");
        const updateTheme = () => {
            const dark = doc.documentElement.dataset.theme === "dark";
            themeButton?.setAttribute("aria-pressed", String(dark));
            if (themeButton) themeButton.textContent = dark ? "Light mode" : "Dark mode";
            const icon = select("#favicon");
            if (icon) icon.href = dark ? "favicon-dark.svg" : "favicon.svg";
        };
        themeButton?.addEventListener("click", () => {
            const theme = doc.documentElement.dataset.theme === "dark" ? "light" : "dark";
            doc.documentElement.dataset.theme = theme;
            try { localStorage.setItem("cgrillo-theme", theme); } catch {}
            updateTheme();
        });
        updateTheme();
        doc.addEventListener("error", event => { if (event.target.matches?.(".sports-identity img")) event.target.remove(); }, true);
        let data, index = 0, standingIndex = 0, tour = "";
        const notice = select("[data-sports-notice]");
        const slider = select("[data-round-slider]"), prev = select("[data-round-prev]"), next = select("[data-round-next]");
        const updateFixtures = () => {
            const groups = data.groups || [], group = groups[index];
            slider.max = String(Math.max(0, groups.length - 1));
            slider.value = String(index);
            slider.disabled = groups.length < 2;
            prev.disabled = index <= 0;
            next.disabled = index >= groups.length - 1;
            select("[data-round-value]").textContent = group?.label || "Awaiting draw";
            slider.setAttribute("aria-valuetext", group?.label || "Awaiting draw");
            FixtureSlider.update(slider, groups.map((item, value) => ({value, label:item.label, date:item.startDate})));
            const matches = filteredMatches(group, tour);
            const releasedTour = groups.some(item => filteredMatches(item, tour).length);
            const tennisEmpty = releasedTour ? `No ${tour === "wta" ? "women’s" : "men’s"} singles matches on this date. Use the day slider to view the rest of the tournament.` : "Matches will appear once the tournament draw is released. You can switch between the men’s and women’s singles above.";
            list.innerHTML = matches.length ? matches.map(match => renderMatch(match, sport)).join("") : `<p class="sports-empty">${sport === "tennis" ? tennisEmpty : "No fixtures have been published for this selection yet."}</p>`;
            if (sport !== 'tennis' && typeof SportView !== 'undefined') {
                let tallies = select('[data-sport-tallies]');
                if (!tallies) { tallies=doc.createElement('section');tallies.className='viewer-round-tallies';tallies.dataset.sportTallies='';list.parentElement.appendChild(tallies); }
                SportView.roundTallies(tallies,sport,data.season,{...group,matches});
            }
            const byes = Array.isArray(group?.byes) && group.byes.length ? `Bye: ${group.byes.join(", ")}.` : "";
            select("[data-fixtures-note]").textContent = [group?.note || data.fixturesNote, byes].filter(Boolean).join(" ");
        };
        const updateLadder = () => {
            ladder.innerHTML = sport === "tennis" ? renderTournament(data.tournament) : renderStandings(data.standings?.[standingIndex], sport);
            const key = data.standingsNote || (sport === "aflw" ? "P played · W wins · L losses · D draws · % points for divided by points against · Pts competition points" : sport === "nrl" || sport === "nrlw" ? "P played · W wins · L losses · D draws · +/− points difference · Pts competition points" : sport === "nba" || sport === "wnba" ? "W wins · L losses · % win percentage · GB games behind" : sport === "nfl" ? "W wins · L losses · T ties · % win percentage" : sport === "nbl" ? "P played · W wins · L losses · % win percentage" : "");
            const standingsDate = new Date(data.standingsUpdatedAt).getTime();
            const older = Number.isFinite(standingsDate) && standingsDate < new Date(data.updatedAt).getTime();
            const freshness = older ? `Ladder last updated ${date(data.standingsUpdatedAt, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })} Sydney time.` : "";
            select("[data-ladder-note]").textContent = [key, freshness].filter(Boolean).join(" · ");
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
        next.addEventListener("click", () => { index = Math.min(data.groups.length - 1, index + 1); updateFixtures(); });
        slider.addEventListener("input", () => { index = Math.max(0, Math.min(data.groups.length - 1, Number(slider.value))); updateFixtures(); });
        fetch(`sports-data/${sport}.json`, { cache: "no-cache" }).then(response => {
            if (!response.ok) throw new Error("Data request failed");
            return response.json();
        }).then(result => {
            if (result.sport !== sport || !Array.isArray(result.groups)) throw new Error("Unexpected sports data");
            data = result;
            const requestedStanding = new URLSearchParams(location.search).get("standing");
            const requestedStandingIndex = (data.standings || []).findIndex(group => String(group.id) === requestedStanding);
            if (requestedStandingIndex >= 0) standingIndex = requestedStandingIndex;
            tour = data.tours?.[0]?.id || "";
            const requestedTour = new URLSearchParams(location.search).get("tour");
            if (data.tours?.some(item => item.id === requestedTour)) tour = requestedTour;
            index = initialGroupIndex(data.groups, Date.now(), tour);
            const requested = new URLSearchParams(location.search).get("group");
            const requestedIndex = data.groups.findIndex(group => String(group.id) === requested);
            if (requestedIndex >= 0) index = requestedIndex;
            select("[data-season-label]").textContent = data.seasonLabel || (data.season ? `${data.season} season` : "Current season");
            const messages = dataNotices(data, sport);
            notice.textContent = messages.join(" "); notice.hidden = !messages.length;
            const sources = data.sources || (data.source ? [data.source] : []);
            select("[data-source]").innerHTML = sources.length ? `Source: ${sources.map(source => safeUrl(source.url) ? `<a href="${escape(safeUrl(source.url))}" target="_blank" rel="noopener noreferrer">${escape(source.name || "Data provider")}</a>` : escape(source.name || "Data provider")).join(" · ")}` : "Fixtures and results are refreshed automatically.";
            select("[data-updated]").textContent = data.updatedAt ? `Updated ${date(data.updatedAt, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })} Sydney time` : "";
            tabs(select("[data-standing-tabs]"), data.standings || [], standingIndex, position => { standingIndex = position; updateLadder(); });
            tabs(select("[data-fixture-tabs]"), data.tours || [], Math.max(0, (data.tours || []).findIndex(item => item.id === tour)), position => { tour = data.tours[position].id; index = initialGroupIndex(data.groups, Date.now(), tour); updateFixtures(); });
            updateFixtures(); updateLadder();
        }).catch(() => {
            list.innerHTML = '<p class="sports-empty">Fixtures could not be loaded. Please refresh or try again shortly.</p>';
            ladder.innerHTML = '<p class="sports-empty">Standings are temporarily unavailable.</p>';
        });
    }
    return { escape, safeUrl, identity, teamLink, filteredMatches, initialGroupIndex, renderMatch, standingColumns, renderStandings, renderTournament, dataNotices, init };
});
