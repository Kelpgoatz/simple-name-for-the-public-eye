const TOURS = [{ id: "atp", label: "Men’s singles", grouping: "mens-singles" }, { id: "wta", label: "Women’s singles", grouping: "womens-singles" }];
const SOURCE = "https://site.api.espn.com/apis/site/v2/sports/tennis";

export function grandSlamKey(name) {
    const value = String(name || "").toLowerCase().replace(/[.]/g, "");
    if (/australian open/.test(value)) return "australian-open";
    if (/roland garros|french open/.test(value)) return "roland-garros";
    if (/wimbledon/.test(value)) return "wimbledon";
    if (/\bus open\b/.test(value)) return "us-open";
    return null;
}

export function tournamentDistance(tournament, now = new Date()) {
    const start = Date.parse(tournament.date || tournament.startDate);
    const end = Date.parse(tournament.endDate);
    const current = new Date(now).getTime();
    if (![start, end, current].every(Number.isFinite) || end < start) return Infinity;
    return current < start ? start - current : current > end ? current - end : 0;
}

export function selectNearestSlam(events, now = new Date()) {
    return events.filter(event => grandSlamKey(event.name) && Number.isFinite(tournamentDistance(event, now)))
        .sort((a, b) => tournamentDistance(a, now) - tournamentDistance(b, now)
            || Number(Date.parse(b.date || b.startDate) >= new Date(now).getTime()) - Number(Date.parse(a.date || a.startDate) >= new Date(now).getTime())
            || Date.parse(b.date || b.startDate) - Date.parse(a.date || a.startDate))[0] || null;
}

const numeric = value => value !== null && value !== undefined && String(value).trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
const iso = value => Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;

export function normalizeTennisMatch(competition, tour) {
    const competitors = competition.competitors || [];
    const first = competitors.find(player => player.homeAway === "home") || [...competitors].sort((a, b) => (a.order || 0) - (b.order || 0))[0];
    const second = competitors.find(player => player !== first);
    if (!first?.athlete?.displayName || !second?.athlete?.displayName) return null;
    const player = competitor => ({
        id: String(competitor.id), name: competitor.athlete.displayName,
        abbreviation: competitor.athlete.shortName || competitor.athlete.displayName,
        logo: competitor.athlete.flag?.href || null, color: "#0b4b37",
        ...(numeric(competitor.curatedRank?.current) > 0 ? { seed: numeric(competitor.curatedRank.current) } : {})
    });
    const type = competition.status?.type || {};
    const description = [type.name, type.description, type.detail].filter(Boolean).join(" ");
    const status = /cancel/i.test(description) ? "cancelled" : /postpon|suspend/i.test(description) ? "postponed"
        : type.completed || type.state === "post" ? "final" : type.state === "in" ? "live" : "scheduled";
    const setCount = Math.max(first.linescores?.length || 0, second.linescores?.length || 0);
    const sets = Array.from({ length: setCount }, (_, index) => ({
        home: numeric(first.linescores?.[index]?.value), away: numeric(second.linescores?.[index]?.value),
        ...(numeric(first.linescores?.[index]?.tiebreak) !== null ? { homeTiebreak: numeric(first.linescores[index].tiebreak) } : {}),
        ...(numeric(second.linescores?.[index]?.tiebreak) !== null ? { awayTiebreak: numeric(second.linescores[index].tiebreak) } : {})
    }));
    const score = competitor => numeric(competitor.score) ?? ((competitor.linescores || []).length ? competitor.linescores.filter(set => set.winner === true).length : null);
    return {
        id: `${tour}-${competition.id}`, tour,
        startTime: competition.timeValid === false ? null : iso(competition.startDate || competition.date),
        status, statusDetail: [...new Set([competition.round?.displayName, type.detail || type.description].filter(Boolean))].join(" · "),
        venue: [competition.venue?.court, competition.venue?.fullName].filter(Boolean).join(", "),
        home: player(first), away: player(second), homeScore: score(first), awayScore: score(second),
        winner: first.winner === true ? "home" : second.winner === true ? "away" : null, sets
    };
}

export function groupTennisMatches(matches, timeZone = "UTC") {
    const groups = new Map();
    for (const match of matches) {
        let day = "unscheduled", label = "Time to be confirmed", startDate = null;
        if (match.startTime) {
            const date = new Date(match.startTime);
            day = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
            label = new Intl.DateTimeFormat("en-AU", { timeZone, weekday: "short", day: "numeric", month: "short" }).format(date);
            startDate = match.startTime;
        }
        if (!groups.has(day)) groups.set(day, { id: day, label, startDate, matches: [] });
        const group = groups.get(day);
        group.matches.push(match);
        if (startDate && (!group.startDate || startDate < group.startDate)) group.startDate = startDate;
    }
    return [...groups.values()].sort((a, b) => (a.startDate || "9999").localeCompare(b.startDate || "9999"))
        .map(group => ({ ...group, matches: group.matches.sort((a, b) => (a.startTime || "9999").localeCompare(b.startTime || "9999") || a.id.localeCompare(b.id)) }));
}

const metadata = event => ({
    name: event.name, startDate: iso(event.date), endDate: iso(event.endDate),
    venue: event.venue?.displayName || event.venue?.fullName || null,
    surface: event.surface?.displayName || event.surface?.name || (typeof event.surface === "string" ? event.surface : null),
    url: event.links?.find(link => link.rel?.includes("summary"))?.href || "https://www.espn.com/tennis/"
});

export async function fetchTennis({ fetchJson, now = new Date(), previous } = {}) {
    if (typeof fetchJson !== "function") throw new Error("fetchTennis requires fetchJson");
    const current = new Date(now);
    const year = current.getUTCFullYear();
    if (!Number.isFinite(current.getTime())) throw new Error("Invalid tennis selection date");
    const jobs = [year, year + 1].flatMap(season => TOURS.map(tour => ({ season, tour: tour.id, url: `${SOURCE}/${tour.id}/scoreboard?dates=${season}&limit=1000` })));
    const results = await Promise.allSettled(jobs.map(async job => {
        const data = await fetchJson(job.url);
        if (!Array.isArray(data.events)) throw new Error(`Invalid ${job.tour} calendar`);
        return { ...job, events: data.events };
    }));
    const feeds = results.filter(result => result.status === "fulfilled").map(result => result.value);
    const candidates = new Map();
    for (const feed of feeds) for (const event of feed.events) {
        if (grandSlamKey(event.name) && !candidates.has(event.id)) candidates.set(event.id, event);
    }
    const selected = selectNearestSlam([...candidates.values()], current);
    if (!selected) {
        throw new Error("No dated Grand Slam tournament is currently available from the tennis feeds");
    }
    const matches = new Map();
    for (const tour of TOURS) {
        const own = feeds.find(feed => feed.tour === tour.id && feed.events.some(event => event.id === selected.id));
        const event = own?.events.find(event => event.id === selected.id) || selected;
        const grouping = event.groupings?.find(group => group.grouping?.slug === tour.grouping);
        for (const competition of grouping?.competitions || []) {
            const match = normalizeTennisMatch(competition, tour.id);
            if (match) matches.set(match.id, match);
        }
    }
    const tournament = metadata(selected);
    const season = numeric(selected.season?.year) || year;
    const sameTournament = previous?.tournament?.startDate === tournament.startDate && previous?.tournament?.name === tournament.name;
    if (!matches.size && sameTournament && previous?.groups?.some(group => group.matches?.length)) throw new Error("The previously populated draw could not be refreshed; retain its cached results");
    const notices = [];
    if (tournamentDistance(selected, current) !== 0) notices.push(`${selected.name} ${season} is the nearest Grand Slam with dates currently available from ESPN; no Grand Slam is currently in progress.`);
    if (!feeds.some(feed => feed.season === year + 1 && feed.events.some(event => grandSlamKey(event.name)))) notices.push(`${year + 1} Grand Slam dates have not yet been published by the source.`);
    if (results.some(result => result.status === "rejected")) notices.push("Some tournament feeds could not be refreshed; available source results are shown.");
    if (!matches.size) notices.push("The tournament draw and match schedule have not been published yet.");
    return {
        sport: "tennis", season, seasonLabel: `${selected.name} ${season}`, updatedAt: current.toISOString(),
        source: { name: "ESPN tennis scoreboard", url: tournament.url }, tournament,
        tours: TOURS.map(({ id, label }) => ({ id, label })),
        groups: matches.size ? groupTennisMatches([...matches.values()], "Australia/Sydney")
            : [{ id: `${selected.id}-draw`, label: "Draw to be announced", startDate: tournament.startDate, matches: [] }],
        standings: [], ...(notices.length ? { notice: notices.join(" ") } : {}),
        ...(!matches.size && !sameTournament && previous?.groups?.some(group => group.matches?.length)
            ? { previousTournament: { seasonLabel: previous.seasonLabel, tournament: previous.tournament, groups: previous.groups } } : {})
    };
}
