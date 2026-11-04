const SPORTS = {
    nba: { path: "basketball/nba", name: "NBA" },
    nbl: { path: "basketball/nbl", name: "NBL" },
    wnba: { path: "basketball/wnba", name: "WNBA" },
    nfl: { path: "football/nfl", name: "NFL" }
};
const LIMIT = 1000;
const nullableNumber = value => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const iso = value => Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const color = value => /^#?[0-9a-f]{6}$/i.test(value || "") ? `#${value.replace(/^#/, "")}` : null;

export function normalizeEspnTeam(team, known = {}) {
    if (!team?.id) throw new Error("ESPN team has no identity");
    const logo = team.logo || team.logos?.find(logo => !logo.rel?.includes("dark"))?.href || team.logos?.[0]?.href || known.logo || null;
    return {
        id: String(team.id), name: team.displayName || team.shortDisplayName || team.name || known.name || "Team TBC",
        abbreviation: team.abbreviation || known.abbreviation || "", logo,
        color: color(team.color) || known.color || "#073d2e"
    };
}

export function normalizeEspnEvent(event, season) {
    if (Number(event.season?.year) !== Number(season)) return null;
    const competition = event.competitions?.[0];
    const home = competition?.competitors?.find(team => team.homeAway === "home");
    const away = competition?.competitors?.find(team => team.homeAway === "away");
    if (!event.id || !competition || !home?.team?.id || !away?.team?.id) return null;
    const state = competition.status || event.status || {};
    const type = state.type || {};
    const cancelled = /cancel/i.test(type.name || type.description || "");
    const postponed = /postpon|delay|suspend/i.test(type.name || type.description || "");
    const status = cancelled ? "cancelled" : postponed ? "postponed" : type.completed || type.state === "post" ? "final" : type.state === "in" ? "live" : "scheduled";
    const scored = status === "live" || status === "final";
    return {
        id: String(event.id), startTime: competition.timeValid === false ? null : iso(competition.date || event.date),
        status, statusDetail: status === "scheduled" ? competition.timeValid === false ? "Time TBC" : "Scheduled" : type.shortDetail || type.detail || type.description || "",
        ...(Number(event.season?.type) === 1 ? { roundLabel: "Preseason" } : Number(event.season?.type) === 3 ? { roundLabel: "Postseason" } : {}),
        venue: competition.venue?.fullName || "", home: normalizeEspnTeam(home.team), away: normalizeEspnTeam(away.team),
        homeScore: scored ? nullableNumber(home.score?.value ?? home.score) : null,
        awayScore: scored ? nullableNumber(away.score?.value ?? away.score) : null,
        winner: status === "final" ? home.winner ? "home" : away.winner ? "away" : null : null
    };
}

function teamMap(groups) {
    const map = new Map();
    for (const group of groups || []) for (const match of group.matches || []) {
        if (match.home?.id) map.set(match.home.id, match.home);
        if (match.away?.id) map.set(match.away.id, match.away);
    }
    return map;
}
function statsByName(stats = []) {
    return new Map(stats.map(stat => [stat.name, nullableNumber(stat.value)]));
}
export function normalizeEspnStandings(data, season, knownTeams = new Map()) {
    if (data.season?.year != null && Number(data.season.year) !== Number(season)) {
        throw new Error(`ESPN standings season mismatch (${data.season.year} vs ${season})`);
    }
    const groups = [];
    function visit(node, parentLabel = "") {
        if (node.standings?.entries?.length) {
            const actualSeason = node.standings.season ?? data.season?.year;
            if (Number(actualSeason) !== Number(season)) throw new Error(`ESPN standings season mismatch (${actualSeason} vs ${season})`);
            const rows = node.standings.entries.map(entry => {
                const stats = statsByName(entry.stats);
                const wins = stats.get("wins") ?? null, losses = stats.get("losses") ?? null, draws = stats.get("ties") ?? 0;
                return {
                    rank: stats.get("playoffSeed") ?? null,
                    team: normalizeEspnTeam(entry.team, knownTeams.get(String(entry.team?.id))),
                    wins, losses, draws, played: wins === null || losses === null ? null : wins + losses + draws,
                    points: null, percentage: null, winPct: stats.get("winPercent") ?? null,
                    gamesBehind: stats.get("gamesBehind") ?? null,
                    for: stats.get("pointsFor") ?? null, against: stats.get("pointsAgainst") ?? null
                };
            }).sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || (b.winPct ?? -1) - (a.winPct ?? -1));
            groups.push({ id: String(node.id || node.abbreviation || groups.length + 1), label: node.name || parentLabel || "Standings", rows });
            return;
        }
        for (const child of node.children || []) visit(child, node.name || parentLabel);
    }
    visit(data);
    if (!groups.length) throw new Error("ESPN standings are empty");
    return groups;
}

function monthQueries(startDate, endDate) {
    const start = new Date(startDate), end = new Date(endDate);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) throw new Error("Invalid ESPN season calendar");
    const months = [];
    for (const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)); date <= end; date.setUTCMonth(date.getUTCMonth() + 1)) {
        months.push(`${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`);
        if (months.length > 18) throw new Error("Unexpectedly long ESPN season");
    }
    return months;
}

async function fetchMonth(base, month, fetchJson) {
    const data = await fetchJson(`${base}?dates=${month}&limit=${LIMIT}`);
    if (!Array.isArray(data.events)) throw new Error(`ESPN month ${month} has no events array`);
    if (data.events.length < LIMIT) return data.events;
    // ESPN date-range, offset and page queries are not reliable. Split capped months by day.
    const year = Number(month.slice(0, 4)), index = Number(month.slice(4)) - 1;
    const days = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
    const events = [];
    for (let day = 1; day <= days; day++) {
        const query = `${month}${String(day).padStart(2, "0")}`;
        const daily = await fetchJson(`${base}?dates=${query}&limit=${LIMIT}`);
        if (!Array.isArray(daily.events) || daily.events.length >= LIMIT) throw new Error(`ESPN day ${query} is incomplete`);
        events.push(...daily.events);
    }
    return events;
}

function nflGroups(calendar, event) {
    const seasonType = String(event.season?.type || "2");
    const week = Number(event.week?.number);
    const phase = (calendar || []).find(phase => String(phase.value) === seasonType);
    const entry = phase?.entries?.find(entry => Number(entry.value) === week);
    const label = entry?.label || (Number.isFinite(week) ? `Week ${week}` : "Fixtures");
    return {
        id: `${seasonType}-${Number.isFinite(week) ? week : "unknown"}`,
        label: seasonType === "1" ? (entry?.label || `Preseason ${label}`) : label,
        startDate: iso(entry?.startDate || event.date)
    };
}

export function groupEspnEvents(slug, events, season, calendar = []) {
    const groups = new Map();
    const seen = new Set();
    for (const event of events) {
        const match = normalizeEspnEvent(event, season);
        if (!match || seen.has(match.id)) continue;
        seen.add(match.id);
        let group;
        if (slug === "nfl") group = nflGroups(calendar, event);
        else {
            const date = new Date(event.date);
            if (!Number.isFinite(date.getTime())) continue;
            const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
            group = { id: day, label: new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(date), startDate: `${day}T00:00:00Z` };
        }
        if (!groups.has(group.id)) groups.set(group.id, { ...group, matches: [] });
        groups.get(group.id).matches.push(match);
    }
    for (const group of groups.values()) group.matches.sort((a, b) => Date.parse(a.startTime || group.startDate) - Date.parse(b.startTime || group.startDate));
    return [...groups.values()].sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate));
}

export async function fetchEspnSport(slug, { fetchJson, now = new Date(), previous } = {}) {
    const sport = SPORTS[slug];
    if (!sport || typeof fetchJson !== "function") throw new Error("Unknown sport or missing fetchJson");
    const scoreboard = `https://site.api.espn.com/apis/site/v2/sports/${sport.path}/scoreboard`;
    const standingsURL = `https://site.api.espn.com/apis/v2/sports/${sport.path}/standings`;
    let current;
    try {
        current = await fetchJson(scoreboard);
    } catch (error) {
        if (previous?.sport === slug && previous.groups?.length) return { ...previous, notice: `ESPN is temporarily unavailable. Showing the last successful ${previous.seasonLabel || previous.season} update.` };
        throw error;
    }
    const league = current.leagues?.find(league => league.slug === slug) || current.leagues?.[0];
    const season = Number(league?.season?.year || current.season?.year);
    if (!Number.isInteger(season) || season < 1900) throw new Error("ESPN did not identify the current season");
    const seasonLabel = league.season.displayName || String(season);
    const sameSeason = previous?.sport === slug && Number(previous.season) === season;
    const retrievedAt = new Date(now).toISOString();
    const notices = [];
    const months = monthQueries(league.season.startDate || league.calendarStartDate, league.season.endDate || league.calendarEndDate);
    const events = [], failures = [];
    // Independent month requests are capped at three concurrent requests.
    let next = 0;
    await Promise.all(Array.from({ length: 3 }, async () => {
        while (next < months.length) {
            const month = months[next++];
            try { events.push(...await fetchMonth(scoreboard, month, fetchJson)); }
            catch (error) { failures.push(`${month}: ${error.message}`); }
        }
    }));
    events.push(...(current.events || []));
    let groups = groupEspnEvents(slug, events, season, league.calendar);
    let fixturesUpdatedAt = retrievedAt;
    if (failures.length) {
        if (!sameSeason || !previous.groups?.length) throw new Error(`Incomplete ESPN schedule: ${failures.join("; ")}`);
        const refreshedIDs = new Set(groups.flatMap(group => group.matches.map(match => match.id)));
        const merged = new Map(previous.groups.map(group => [group.id, { ...group, matches: group.matches.filter(match => !refreshedIDs.has(match.id)) }]));
        for (const group of groups) {
            const cached = merged.get(group.id);
            merged.set(group.id, { ...group, matches: [...(cached?.matches || []), ...group.matches].sort((a, b) => Date.parse(a.startTime || group.startDate) - Date.parse(b.startTime || group.startDate)) });
        }
        groups = [...merged.values()].filter(group => group.matches.length).sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate));
        notices.push("Some schedule requests failed; previously downloaded fixtures have been retained.");
        fixturesUpdatedAt = previous.fixturesUpdatedAt || previous.updatedAt || null;
    }
    if (!groups.length) {
        if (sameSeason && previous.groups?.length) {
            groups = previous.groups;
            notices.push("No fixtures were returned; showing the last successful schedule update.");
            fixturesUpdatedAt = previous.fixturesUpdatedAt || previous.updatedAt || null;
        } else throw new Error("ESPN returned an empty season schedule");
    }
    let standings, standingsUpdatedAt = retrievedAt;
    try {
        standings = normalizeEspnStandings(await fetchJson(`${standingsURL}?season=${season}`), season, teamMap(groups));
    } catch (error) {
        standings = sameSeason ? previous.standings || [] : [];
        standingsUpdatedAt = standings.length ? previous.standingsUpdatedAt || previous.updatedAt || null : null;
        notices.push(standings.length ? "Standings are temporarily unavailable; showing the last successful update for this season." : "Current-season standings have not been published yet.");
    }
    // Scoreboards and standings use different logo variants; share one identity per team.
    const canonicalTeams = new Map(standings.flatMap(group => (group.rows || []).filter(row => row.team?.id).map(row => [row.team.id, row.team])));
    for (const group of groups) for (const match of group.matches) {
        if (canonicalTeams.has(match.home.id)) match.home = canonicalTeams.get(match.home.id);
        if (canonicalTeams.has(match.away.id)) match.away = canonicalTeams.get(match.away.id);
    }
    return {
        sport: slug, season, seasonLabel, updatedAt: retrievedAt, fixturesUpdatedAt, standingsUpdatedAt,
        seasonStart: league.season.startDate || league.calendarStartDate,
        seasonEnd: league.season.endDate || league.calendarEndDate,
        source: { name: "ESPN", url: `https://www.espn.com/${slug}/scoreboard`, fixtures: scoreboard, standings: `${standingsURL}?season=${season}` },
        groups, standings, ...(notices.length ? { notice: notices.join(" ") } : {})
    };
}
