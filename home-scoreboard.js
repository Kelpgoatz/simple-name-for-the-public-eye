(() => {
    const applyColors = (row, colors) => {
        row.style.setProperty("--logo-from", colors[0]);
        row.style.setProperty("--logo-to", colors[colors.length - 1]);
        if (colors.length > 2) {
            row.style.setProperty("--logo-mid", colors[1]);
        } else {
            row.style.removeProperty("--logo-mid");
        }
    };

    const aflTeams = {
        Adelaide: { display: "Adelaide Crows", initials: "AC", colors: ["#002b5c", "#e31b23", "#ffcc00"] },
        "Brisbane Lions": { display: "Brisbane Lions", initials: "BL", colors: ["#7a003c", "#0047bb", "#ffcc00"] },
        Carlton: { display: "Carlton", initials: "CA", colors: ["#002b5c", "#f7f8fb"] },
        Collingwood: { display: "Collingwood", initials: "CW", colors: ["#111111", "#f5f5f5"] },
        Essendon: { display: "Essendon", initials: "ES", colors: ["#111111", "#e31b23"] },
        Fremantle: { display: "Fremantle", initials: "FR", colors: ["#5a2ca0", "#f1ebff"] },
        Geelong: { display: "Geelong Cats", initials: "GC", colors: ["#002b5c", "#f4f7fb"] },
        "Gold Coast": { display: "Gold Coast Suns", initials: "GS", colors: ["#e31b23", "#ffd300"] },
        "Greater Western Sydney": { display: "GWS Giants", initials: "GW", colors: ["#ff6f00", "#3a3a3a", "#ffffff"] },
        Hawthorn: { display: "Hawthorn", initials: "HW", colors: ["#6b3f1d", "#ffcc00"] },
        Melbourne: { display: "Melbourne", initials: "ME", colors: ["#002b5c", "#e31b23"] },
        "North Melbourne": { display: "North Melbourne", initials: "NM", colors: ["#0047bb", "#f7f8fb"] },
        "Port Adelaide": { display: "Port Adelaide", initials: "PA", colors: ["#008c8c", "#111111", "#c0c0c0"] },
        Richmond: { display: "Richmond", initials: "RI", colors: ["#111111", "#fdd000"] },
        "St Kilda": { display: "St Kilda", initials: "ST", colors: ["#e31b23", "#f5f5f5", "#111111"] },
        Sydney: { display: "Sydney Swans", initials: "SS", colors: ["#e31b23", "#f7f7fb"] },
        "West Coast": { display: "West Coast Eagles", initials: "WC", colors: ["#0047bb", "#ffcc00"] },
        "Western Bulldogs": { display: "Western Bulldogs", initials: "WB", colors: ["#0047bb", "#e31b23", "#f7f7fb"] }
    };

    const aflTeamByName = new Map(
        Object.entries(aflTeams).map(([key, val]) => [val.display.toLowerCase(), key])
    );

    const aflGames = document.querySelector("[data-afl-games]");
    if (!aflGames) return;
    const notice = document.querySelector('[data-home-game-notice]');
    const weekLabel = document.querySelector('[data-home-week]');
    const weekToggle = document.querySelector('[data-home-full-week]');
    const AFL_TIME_ZONE = "Australia/Sydney";
    const fixtureSports = ['aflw', 'nrl', 'nrlw', 'nba', 'wnba', 'nbl', 'nfl', 'tennis'];
    const feederSports = ['f2', 'f3'];
    const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const rows = value => Array.isArray(value) && value.every(object);
    const sources = {
        afl: ['afl-fixtures.json', 'AFL', data => rows(data) && data.every(round => rows(round.matches))],
        f1: ['f1-fixtures.json', 'F1', data => object(data) && rows(data.races) && data.races.every(race => race.results == null || rows(race.results))],
        sessions: ['f1-sessions.json', 'F1 sessions', data => object(data?.races) && Object.values(data.races).every(weekend => object(weekend?.sessions) && Object.values(weekend.sessions).every(session => object(session) && (session.results == null || rows(session.results))))],
        circuits: ['f1-circuits.json', '', data => object(data?.circuits)],
        ...Object.fromEntries(fixtureSports.map(sport => [sport, [`sports-data/${sport}.json`, HomeSports.labels[sport], data => HomeSports.validSnapshot(data, sport)]])),
        ...Object.fromEntries(feederSports.map(sport => [sport, [`${sport}-data.json`, sport.toUpperCase(), HomeFollowing.validFeeder]]))
    };
    const snapshots = new Map();
    const pending = new Map();
    const failed = new Set();
    const preferences = () => HomeWelcome.getScope() === 'following' ? ViewerFavourites.get() : { leagues: [], teams: [], drivers: [] };
    const wantedSports = prefs => new Set([...prefs.leagues, ...prefs.teams.map(team => team.sport), ...prefs.drivers.map(driver => driver.sport)]);
    const activeSources = prefs => Object.keys(sources).filter(key => !feederSports.includes(key) || wantedSports(prefs).has(key));
    const f1Weekends = () => {
        const fixtures = snapshots.get('f1')?.data;
        const sessions = snapshots.get('sessions')?.data;
        return fixtures && sessions && Number(fixtures.season) === Number(sessions.season) ? sessions.races : {};
    };

    const parseStartTime = (value) => {
        if (!value) return null;
        const date = new Date(String(value).replace(/\+0000$/, "Z"));
        return Number.isNaN(date.getTime()) ? null : date;
    };

    const getSydneyDateKey = HomeSports.dateKey;

    const addDays = (dateKey, days) => {
        const [year, month, day] = dateKey.split("-").map(Number);
        return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
    };

    const formatMatchTime = (date) => date.toLocaleTimeString("en-AU", {
        timeZone: AFL_TIME_ZONE,
        hour: "numeric",
        minute: "2-digit"
    });

    const formatMatchDate = (date) => date.toLocaleDateString("en-AU", {
        timeZone: AFL_TIME_ZONE,
        weekday: "short",
        day: "numeric",
        month: "short"
    });

    const formatWeekOf = (date) => {
        const dateKey = getSydneyDateKey(date);
        const [year, month, day] = dateKey.split("-").map(Number);
        const monday = new Date(Date.UTC(year, month - 1, day - ((new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7), 12));
        return `Week of ${monday.toLocaleDateString("en-AU", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" })}`;
    };

    const tbdAFLTeam = { display: "TBD", initials: "TBD", colors: ["#6b7b81", "#93a3a8"] };

    const resolveAFLTeam = (name) => {
        const normalizedName = String(name || "").trim();
        if (!normalizedName) return tbdAFLTeam;
        return aflTeams[normalizedName] || aflTeams[aflTeamByName.get(normalizedName.toLowerCase())]
            || { ...tbdAFLTeam, display: normalizedName, initials: normalizedName.slice(0, 3).toUpperCase() };
    };

    const statusLabels = {
        SCHEDULED: "Scheduled",
        CONFIRMED_TEAMS: "Scheduled",
        UNCONFIRMED_TEAMS: "Scheduled",
        CONCLUDED: "Finished",
        LIVE: "Live",
        IN_PROGRESS: "Live",
        PENDING: "Update pending",
        POSTPONED: "Postponed",
        DELAYED: "Delayed",
        SUSPENDED: "Suspended",
        ABANDONED: "Abandoned",
        CANCELLED: "Cancelled",
        CANCELED: "Cancelled",
        TBC: "TBC",
        TO_BE_CONFIRMED: "TBC",
        PLACEHOLDER: "TBC"
    };

    let countdownTimers = [];

    const clearCountdownTimers = () => {
        countdownTimers.forEach(timer => clearInterval(timer));
        countdownTimers = [];
    };

    const f1Labels = { fp1: 'Practice 1', fp2: 'Practice 2', fp3: 'Practice 3', sq: 'Sprint qualifying', sprint: 'Sprint', qualifying: 'Qualifying', race: 'Race' };
    const f1Sessions = (race, weekends) => [...Object.entries(weekends[race.raceId]?.sessions || {}), ['race', race]]
        .filter(([key]) => Object.hasOwn(f1Labels, key))
        .map(([key, session]) => ({ ...session, key, label: f1Labels[key], results: session.results || [], time: parseStartTime(session.startTime) }));

    function f1GamesFor(race, weekends, now) {
        const sessions = f1Sessions(race, weekends).filter(session => session.time).sort((a, b) => a.time - b.time);
        const completed = sessions.filter(session => session.time <= now && (session.results.length || session.status === 'CONCLUDED')).at(-1);
        const next = sessions.find(session => session.time > now && !session.results.length && !['CONCLUDED', 'POSTPONED', 'CANCELLED'].includes(session.status));
        const awaiting = !next && sessions.filter(session => session.time > now - 12 * 3600000 && session.time <= now
            && !session.results.length && !['CONCLUDED', 'POSTPONED', 'CANCELLED'].includes(session.status)).at(-1);
        return [completed, next || awaiting].filter(Boolean).map(session => {
            const leader = session.key.startsWith('fp') && session.results.find(result => Number(result.position) === 1);
            const summary = { ...session, fastestLap: session.fastestLap || (leader?.bestLap ? { time: leader.bestLap, driverId: leader.driverId } : null) };
            return { race, summary, startTime: session.time, dateKey: getSydneyDateKey(session.time), state: { isFinished: session === completed && Boolean(session.results.length), isPending: session === awaiting || session === completed && !session.results.length } };
        });
    }

    const renderF1Summary = ({ race, startTime, summary, state }, weekends, now) => {
        const detailsUrl = `f1.html?round=${encodeURIComponent(race.round)}&session=${summary.key}`;
        const game = document.createElement("article");
        game.className = "afl-game f1-game";
        const header = document.createElement("div");
        header.className = "f1-game__head";
        const fastest = document.createElement("span");
        fastest.className = "f1-game__fastest";
        if (!summary.fastestLap?.time) fastest.classList.add("f1-game__fastest--empty");
        fastest.textContent = summary.fastestLap?.time || "–";
        fastest.setAttribute("aria-label", summary.fastestLap?.time ? `Fastest lap: ${summary.fastestLap.time}` : "Fastest lap not available yet");
        fastest.title = summary.fastestLap?.time ? `${summary.label} fastest lap` : "Fastest lap not available yet";
        const name = document.createElement("a");
        name.className = "f1-game__name";
        name.href = detailsUrl;
        name.textContent = race.name;
        header.appendChild(name);
        if (summary.fastestLap?.time) header.appendChild(fastest);
        game.appendChild(header);
        if (!summary.results.length) {
            if (!state.isFinished) game.classList.add("f1-game--upcoming");
            const visual = document.createElement("div");
            visual.className = "f1-race-visual";
            const roundTag = document.createElement("span");
            roundTag.className = "f1-race-visual__round";
            roundTag.textContent = `FORMULA 1 · ROUND ${race.round}`;
            visual.appendChild(roundTag);
            const circuitMap = snapshots.get('circuits')?.data.circuits[race.circuitId];
            if (circuitMap?.path) {
                const ns = "http://www.w3.org/2000/svg";
                const svg = document.createElementNS(ns, "svg");
                svg.setAttribute("viewBox", "0 0 600 280");
                svg.setAttribute("role", "img");
                svg.setAttribute("aria-label", `${race.circuit} circuit layout`);
                for (const className of ["f1-race-visual__edge", "f1-race-visual__track"]) {
                    const path = document.createElementNS(ns, "path");
                    path.setAttribute("d", circuitMap.path);
                    path.setAttribute("class", className);
                    svg.appendChild(path);
                }
                if (Array.isArray(circuitMap.start)) {
                    const start = document.createElementNS(ns, "circle");
                    start.setAttribute("cx", circuitMap.start[0]);
                    start.setAttribute("cy", circuitMap.start[1]);
                    start.setAttribute("r", "5");
                    start.setAttribute("class", "f1-race-visual__start");
                    svg.appendChild(start);
                }
                visual.appendChild(svg);
                const credit = document.createElement("a");
                credit.className = "f1-race-visual__credit";
                credit.href = "https://github.com/bacinger/f1-circuits";
                credit.textContent = "Circuit map ↗";
                visual.appendChild(credit);
            } else {
                const location = document.createElement("strong");
                location.className = "f1-race-visual__location";
                location.textContent = race.location || race.circuit || "Race weekend";
                visual.appendChild(location);
            }
            const raceTime = parseStartTime(race.startTime);
            if (raceTime) {
                const date = document.createElement("span");
                date.className = "f1-race-visual__date";
                date.textContent = `Race · ${formatMatchDate(raceTime)} · ${formatMatchTime(raceTime)} Sydney`;
                visual.appendChild(date);
            }
            game.insertBefore(visual, header);
            const status = document.createElement("span");
            status.className = `afl-game__status afl-game__status--${state.isFinished || state.isPending ? 'tbc' : 'scheduled'}`;
            status.textContent = state.isFinished || state.isPending ? 'Classification pending' : 'Upcoming';
            header.appendChild(status);
            const circuit = document.createElement("p");
            circuit.className = "f1-game__circuit";
            circuit.textContent = [race.circuit, race.location].filter(Boolean).join(" · ");
            game.appendChild(circuit);
            const facts = document.createElement("p");
            facts.className = "f1-game__facts";
            facts.textContent = [`Round ${race.round}`, weekends[race.raceId]?.isSprint ? "Sprint weekend" : null,
                race.laps ? `${race.laps} laps` : null, typeof race.lengthKm === 'number' && race.lengthKm > 0 ? `${race.lengthKm.toFixed(3)} km` : null,
                race.corners ? `${race.corners} corners` : null].filter(Boolean).join(" · ");
            game.appendChild(facts);
            const sessions = f1Sessions(race, weekends)
                .filter(item => item.time && !item.results.length && !['CONCLUDED', 'CANCELLED', 'POSTPONED'].includes(item.status))
                .sort((a, b) => a.time.getTime() - b.time.getTime());
            const next = sessions.find(item => item.time.getTime() > now);
            const nextLine = document.createElement("div");
            nextLine.className = "f1-game__next";
            const nextLabel = document.createElement("span");
            nextLabel.textContent = next ? "Next session" : "Session updates";
            const nextInfo = document.createElement("a");
            nextInfo.href = `f1.html?round=${encodeURIComponent(race.round)}&session=${next?.key || summary.key}`;
            nextInfo.textContent = next ? `${next.label} · ${formatMatchDate(next.time)} · ${formatMatchTime(next.time)}` : "Schedule or results awaiting confirmation";
            nextLine.append(nextLabel, nextInfo);
            game.appendChild(nextLine);
            if (sessions.length) {
                const schedule = document.createElement("details");
                schedule.className = "f1-game__schedule";
                const toggle = document.createElement("summary");
                toggle.textContent = "Weekend schedule · Sydney time";
                schedule.appendChild(toggle);
                const list = document.createElement("div");
                list.className = "f1-game__sessions";
                sessions.forEach(({ key, time, label: sessionLabel }) => {
                    const link = document.createElement("a");
                    link.href = `f1.html?round=${encodeURIComponent(race.round)}&session=${key}`;
                    const label = document.createElement("strong");
                    label.textContent = sessionLabel;
                    const date = document.createElement("span");
                    date.className = "home-match-date";
                    date.textContent = `${formatMatchDate(time)} · ${formatMatchTime(time)}`;
                    link.append(label, date);
                    list.appendChild(link);
                });
                schedule.appendChild(list);
                game.appendChild(schedule);
            }
            const more = document.createElement("a");
            more.className = "f1-game__weekend-link";
            more.href = detailsUrl;
            more.textContent = "Circuit & weekend details →";
            game.appendChild(more);
            return game;
        }
        [1, 2, 3].forEach(position => {
            const standing = summary.results.find(result => Number(result.position) === position);
            const podium = document.createElement("div");
            podium.className = `f1-game__podium f1-game__podium--${position}`;
            const place = document.createElement("span");
            place.className = "f1-game__place";
            place.textContent = `P${position}`;
            const driver = document.createElement(standing ? "a" : "span");
            driver.className = "f1-game__driver";
            if (standing) driver.href = `f1.html?driver=${encodeURIComponent(standing.driverId)}&round=${encodeURIComponent(race.round)}&session=${summary.key}`;
            driver.textContent = standing ? [standing.driver?.name, standing.driver?.surname].filter(Boolean).join(" ") : "TBC";
            if (standing && standing.driverId === summary.fastestLap?.driverId) {
                driver.classList.add("f1-game__driver--fastest");
                driver.setAttribute("aria-label", `${driver.textContent}, fastest lap`);
                driver.title = "Fastest lap";
            }
            if (standing && position === 1) {
                podium.classList.add("f1-game__winner");
                const label = document.createElement("small");
                label.className = "f1-game__winner-label";
                label.textContent = ['race', 'sprint'].includes(summary.key) ? 'Winner' : summary.key === 'qualifying' ? 'Pole position' : 'Fastest in ' + summary.label;
                driver.appendChild(label);
            }
            if (standing) SportIdentity.inline(driver, "drivers", standing.driverId);
            podium.append(place, driver);
            game.appendChild(podium);
        });
        const more = document.createElement("a");
        more.className = "f1-game__more";
        more.href = detailsUrl;
        const remaining = Math.max(0, summary.results.length - 3);
        more.textContent = remaining ? `+${remaining} →` : "View →";
        more.setAttribute("aria-label", remaining ? `View ${remaining} more drivers and ${summary.label.toLowerCase()} details` : "View race details");
        more.title = "See full results and race information";
        game.appendChild(more);
        const meta = document.createElement("div");
        meta.className = "afl-game__meta f1-game__meta";
        const details = document.createElement("span");
        const summaryTime = parseStartTime(summary.startTime) || startTime;
        details.textContent = `F1 · Round ${race.round} · ${summary.label} · `;
        const stamp = document.createElement("time");
        stamp.className = "home-match-date";
        stamp.textContent = summaryTime ? `${formatMatchDate(summaryTime)} · ${formatMatchTime(summaryTime)}` : "Time TBC";
        if (summaryTime) stamp.dateTime = summaryTime.toISOString();
        details.appendChild(stamp);
        const status = document.createElement("span");
        status.className = 'afl-game__status afl-game__status--finished';
        status.textContent = summary.key === 'race' ? 'Finished' : `${summary.label} complete`;
        meta.append(details, status);
        game.appendChild(meta);
        return game;
    };

    function renderScoreboard() {
        clearCountdownTimers();
        const now = Date.now();
        const today = getSydneyDateKey(now);
        const week = HomeSports.weekRange(now);
        const fullWeek = weekToggle.checked;
        const labelDate = key => new Date(key + 'T12:00:00Z').toLocaleDateString('en-AU', { timeZone: 'UTC', day: 'numeric', month: 'short', year: key === week.end || week.start.slice(0,4) !== week.end.slice(0,4) ? 'numeric' : undefined });
        const start = week.start.slice(0, 7) === week.end.slice(0, 7) ? Number(week.start.slice(-2)) : labelDate(week.start);
        weekLabel.textContent = start + '–' + labelDate(week.end) + ' · Sydney';
        const aflSnapshot = snapshots.get('afl');
        const rounds = aflSnapshot?.data || [];
        const matches = HomeSports.uniqueMatches(rounds.flatMap(round => round.matches).map(match => {
            const startTime = parseStartTime(match.startTime);
            const state = HomeWelcome.aflState(match, startTime, now, { stale: failed.has('afl') || now - aflSnapshot.readAt > 45 * 60000 });
            return { match, startTime, state, dateKey: startTime ? getSydneyDateKey(startTime) : null };
        }));

        const prefs = preferences();
        const followed = HomeFollowing.hasAny(prefs);
        const wanted = wantedSports(prefs);
        const weekends = f1Weekends();
        const otherGames = fixtureSports.flatMap(sport => HomeSports.summaries(snapshots.get(sport)?.data, now, { stale: failed.has(sport) }));
        const feederGames = feederSports.filter(sport => wanted.has(sport)).flatMap(sport => HomeFollowing.f2Summaries(snapshots.get(sport)?.data, now, sport));
        const f1Games = (snapshots.get('f1')?.data.races || []).flatMap(race => f1GamesFor(race, weekends, now));
        const games = [...matches, ...otherGames, ...feederGames, ...f1Games].filter(game => HomeFollowing.follows(game, prefs));
        const inWindow = game => {
            if (game.state.isLive) return true;
            if (fullWeek) return game.dateKey && game.dateKey >= week.start && game.dateKey <= week.end;
            if (game.race) return game.state.isFinished
                ? game.dateKey >= addDays(today, -3)
                : game.dateKey <= addDays(today, 5);
            return HomeSports.dayCategory(game, now) != null
                || (game.state.isFinished && game.dateKey === today);
        };
        const displayed = games.filter(inWindow);
        const typeOf = game => HomeSports.eventType(game, now);
        const sections = [
            { type: 'live', title: 'Live now' },
            { type: 'upcoming', title: 'Upcoming', empty: 'No scheduled starts in this window.' },
            { type: 'results', title: 'Recent results', empty: 'No results in this window.', descending: true },
            { type: 'other', title: 'Schedule updates' }
        ].map(section => ({ ...section, games: displayed.filter(game => typeOf(game) === section.type) }));
        const outside = HomeFollowing.outsideWindow(games, prefs, displayed, now);
        if (outside.length) sections.push({ title: 'Following · Next & latest', games: outside });
        sections.forEach(section => section.games.sort((a, b) => (section.descending ? -1 : 1) * ((a.startTime?.getTime() || 0) - (b.startTime?.getTime() || 0))));
        HomeWelcome.setEvents(sections.flatMap(section => section.games), weekends);

        const relevant = activeSources(prefs).filter(key => !followed || wanted.has(key) || (wanted.has('f1') && ['sessions', 'circuits'].includes(key)));
        const loading = relevant.some(key => pending.has(key));
        const unavailable = relevant.filter(key => failed.has(key) && sources[key][1]);
        const hadEvents = sections.some(section => section.games.length);
        const focusedLink = aflGames.contains(document.activeElement) && document.activeElement.getAttribute('href');
        paintNotice(unavailable);
        aflGames.replaceChildren();
        aflGames.setAttribute('aria-busy', String(loading && !hadEvents));
        if (!hadEvents) {
            if (loading) {
                const skeleton = document.createElement('div');
                skeleton.className = 'home-data-loading';
                skeleton.setAttribute('role', 'status');
                skeleton.innerHTML = 'Loading games and races…<span aria-hidden="true" class="home-game-skeleton"></span><span aria-hidden="true" class="home-game-skeleton"></span>';
                aflGames.appendChild(skeleton);
            } else if (!unavailable.length || relevant.some(key => snapshots.has(key) && sources[key][1])) {
                const empty = document.createElement('p');
                empty.className = 'afl-games__empty';
                empty.textContent = followed ? 'No games for your starred selections in this view.' : 'No games or results in this window. Browse a competition for its full schedule.';
                aflGames.appendChild(empty);
            }
            return;
        }
        sections.forEach(section => {
            if (!section.games.length && (!section.empty || loading)) return;
            const block = document.createElement("section");
            block.className = "afl-games__section";
            const heading = document.createElement("h3");
            heading.className = "afl-games__heading";
            heading.textContent = section.title;
            block.appendChild(heading);
            const list = document.createElement("div");
            list.className = "afl-games__list";

            if (!section.games.length) {
                const empty = document.createElement("p");
                empty.className = "afl-games__empty";
                empty.textContent = section.empty;
                list.appendChild(empty);
            } else {
                const sportOf = HomeFollowing.sportOf;
                const leagues = [...new Set(section.games.map(sportOf))];
                const layouts = new Map(leagues.map(sport => [sport, HomeSports.leagueLayout(section.games.filter(game => sportOf(game) === sport), sport, now, { chronological: true })]));
                let currentLeague;
                let leagueList = list;
                leagues.flatMap(sport => layouts.get(sport).games).forEach(gameData => {
                    const sport = sportOf(gameData);
                    if (sport !== currentLeague) {
                        currentLeague = sport;
                        const title = document.createElement("h4");
                        title.className = "home-league-heading";
                        const link = document.createElement("a");
                        link.href = `${sport}.html`;
                        link.textContent = sport==='f2'?'F2':sport==='f3'?'F3':HomeSports.labels[sport];
                        title.appendChild(link);
                        list.appendChild(title);
                        leagueList = list;
                        if (sport !== "f1") {
                            leagueList = document.createElement("div");
                            leagueList.className = "home-league-games";
                            leagueList.dataset.league = sport;
                            list.appendChild(leagueList);
                        }
                    }
                    if (gameData.f2Race) {
                        const template=document.createElement('template');template.innerHTML=HomeFollowing.renderF2(gameData);
                        template.content.firstElementChild.dataset.homeEventType = typeOf(gameData);
                        if(layouts.get(sport).expanded===gameData)template.content.firstElementChild.classList.add('home-game--expanded');
                        leagueList.appendChild(template.content);return;
                    }
                    if (gameData.sport) {
                        const template = document.createElement("template");
                        template.innerHTML = HomeSports.renderCard(gameData);
                        template.content.firstElementChild.dataset.homeEventType = typeOf(gameData);
                        if (layouts.get(sport).expanded === gameData) template.content.firstElementChild.classList.add("home-game--expanded");
                        leagueList.appendChild(template.content);
                        return;
                    }
                    if (gameData.race) {
                        const card = renderF1Summary(gameData, weekends, now);
                        card.dataset.homeEventType = typeOf(gameData);
                        list.appendChild(card);
                        return;
                    }
                    const { match, startTime, state } = gameData;
                    const home = resolveAFLTeam(match.homeTeam);
                    const away = resolveAFLTeam(match.awayTeam);
                    const game = document.createElement("article");
                    game.className = "afl-game";
                    game.dataset.homeEventType = typeOf(gameData);
                    if (layouts.get(sport).expanded === gameData) game.classList.add("home-game--expanded");
                    applyColors(game, home.colors);

                    const homeTeam = document.createElement("div");
                    homeTeam.className = "afl-game__team";
                    const homeLogo = document.createElement("span");
                    homeLogo.className = "afl-game__logo";
                    homeLogo.textContent = home.initials;
                    SportIdentity.afl(homeLogo, home.display);
                    homeLogo.setAttribute("aria-hidden", "true");
                    applyColors(homeLogo, home.colors);
                    const homeName = document.createElement(match.homeTeam ? 'a' : 'span');
                    if (match.homeTeam) homeName.href = SportView.teamUrl('afl', {name:match.homeTeam});
                    homeName.className = "afl-game__name";
                    homeName.textContent = home.display;
                    homeTeam.append(homeLogo, homeName);

                    const score = document.createElement("div");
                    score.className = "afl-game__score";
                    if (state.hasScores) {
                        const homeScore = Number(match.homeScore);
                        const awayScore = Number(match.awayScore);
                        const homeValue = document.createElement("span");
                        homeValue.className = homeScore >= awayScore ? "afl-game__score-value--win" : "afl-game__score-value--loss";
                        homeValue.textContent = String(homeScore);
                        const versus = document.createElement("span");
                        versus.className = "afl-game__vs";
                        versus.textContent = "vs";
                        const awayValue = document.createElement("span");
                        awayValue.className = awayScore >= homeScore ? "afl-game__score-value--win" : "afl-game__score-value--loss";
                        awayValue.textContent = String(awayScore);
                        score.append(homeValue, versus, awayValue);
                    } else {
                        const versus = document.createElement("span");
                        versus.className = "afl-game__vs";
                        versus.textContent = state.isLive ? "Live" : "vs";
                        score.appendChild(versus);
                    }

                    const awayTeam = document.createElement("div");
                    awayTeam.className = "afl-game__team afl-game__team--away";
                    const awayName = document.createElement(match.awayTeam ? 'a' : 'span');
                    if (match.awayTeam) awayName.href = SportView.teamUrl('afl', {name:match.awayTeam});
                    awayName.className = "afl-game__name";
                    awayName.textContent = away.display;
                    const awayLogo = document.createElement("span");
                    awayLogo.className = "afl-game__logo";
                    awayLogo.textContent = away.initials;
                    SportIdentity.afl(awayLogo, away.display);
                    awayLogo.setAttribute("aria-hidden", "true");
                    applyColors(awayLogo, away.colors);
                    awayTeam.append(awayName, awayLogo);

                    const meta = document.createElement("div");
                    meta.className = "afl-game__meta";
                    const addMeta = (text) => {
                        const item = document.createElement("span");
                        item.className = "afl-game__meta-item";
                        item.textContent = text;
                        meta.appendChild(item);
                        return item;
                    };
                    if (startTime) {
                        const time = document.createElement('time');
                        time.className = 'afl-game__meta-item home-match-date';
                        time.dateTime = startTime.toISOString();
                        time.textContent = ['TBC', 'PLACEHOLDER', 'TO_BE_CONFIRMED'].includes(state.status) ? formatWeekOf(startTime) : `${formatMatchDate(startTime)} · ${formatMatchTime(startTime)}`;
                        meta.appendChild(time);
                    } else {
                        addMeta("Time to be confirmed");
                    }
                    if (Number.isInteger(match.round)) addMeta(match.round === 0 ? 'Opening Round' : `Round ${match.round}`);
                    if (match.venue && match.venue !== "To Be Confirmed") addMeta(match.venue);

                    const statusBadge = document.createElement("span");
                    statusBadge.className = "afl-game__status" + (state.isLive ? " afl-game__status--live" : state.isFinished ? " afl-game__status--finished" : state.isPending || state.isTbc ? " afl-game__status--tbc" : " afl-game__status--scheduled");
                    if (state.isLive || state.isPending) {
                        const dot = document.createElement("span");
                        dot.className = "afl-game__live-dot";
                        dot.setAttribute("aria-hidden", "true");
                        statusBadge.appendChild(dot);
                    }
                    if (state.isCountdown && startTime) {
                        const formatCountdown = () => {
                            const ms = Math.max(0, startTime.getTime() - Date.now());
                            const minutes = Math.floor(ms / 60000);
                            const seconds = Math.floor((ms % 60000) / 1000);
                            return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
                        };
                        statusBadge.appendChild(document.createTextNode('Starts in ' + formatCountdown()));
                        const timer = setInterval(() => {
                            if (startTime.getTime() - Date.now() <= 0) {
                                clearInterval(timer);
                                if (statusBadge.isConnected) scheduleRender();
                            } else {
                                statusBadge.lastChild.textContent = 'Starts in ' + formatCountdown();
                            }
                        }, 1000);
                        countdownTimers.push(timer);
                    } else {
                        statusBadge.appendChild(document.createTextNode(state.isLive ? "Live" : state.isFinished ? "Finished" : state.isPending ? "Update pending" : (statusLabels[state.status] || "Scheduled")));
                    }
                    meta.appendChild(statusBadge);

                    const gameCentre = document.createElement('a');
                    gameCentre.className = 'home-game-centre';
                    gameCentre.href = SportView.matchUrl('afl', match);
                    gameCentre.textContent = 'Game centre →';
                    meta.appendChild(gameCentre);

                    game.append(homeTeam, score, awayTeam, meta);
                    leagueList.appendChild(game);
                });
            }
            block.appendChild(list);
            aflGames.appendChild(block);
        });
        if (focusedLink) [...aflGames.querySelectorAll('a')].find(link => link.getAttribute('href') === focusedLink)?.focus({ preventScroll: true });
    }

    const noticeCopy = notice.querySelector('p');
    const retryButton = notice.querySelector('button');
    const dataStamp = new Intl.DateTimeFormat('en-AU', { timeZone: AFL_TIME_ZONE, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

    function paintNotice(unavailable) {
        const retryFocused = document.activeElement === retryButton;
        notice.hidden = !unavailable.length;
        if (notice.hidden) {
            if (retryFocused) document.querySelector('#afl-games-title').focus({ preventScroll: true });
            return;
        }
        const names = unavailable.map(key => sources[key][1]);
        const saved = unavailable.filter(key => snapshots.has(key));
        const lastRead = Math.min(...saved.map(key => snapshots.get(key).readAt));
        const text = names.join(', ') + ' could not be refreshed.' + (saved.length
            ? ' Showing saved data where available. Last successful read ' + dataStamp.format(lastRead) + ' Sydney.'
            : ' Try again or open the competition for its full schedule.');
        if (noticeCopy.textContent !== text) noticeCopy.textContent = text;
        const retrying = unavailable.some(key => pending.has(key));
        retryButton.setAttribute('aria-disabled', String(retrying));
        retryButton.textContent = retrying ? 'Checking summaries…' : 'Retry summaries';
    }

    let repaint = null;
    function scheduleRender() {
        if (repaint === null) repaint = requestAnimationFrame(() => {
            repaint = null;
            renderScoreboard();
        });
    }

    function loadSource(key) {
        if (pending.has(key)) return;
        const [path, , valid] = sources[key];
        const request = SportsSnapshots.read(path).then(data => {
            if (!valid(data)) throw new Error('Invalid fixture snapshot');
            snapshots.set(key, { data, readAt: Date.now() });
            failed.delete(key);
        }).catch(() => {
            failed.add(key);
        }).finally(() => {
            pending.delete(key);
            scheduleRender();
        });
        pending.set(key, request);
    }

    function refresh(mode) {
        for (const key of activeSources(preferences())) {
            if (mode === 'all' || (mode === 'retry' ? failed.has(key) : !snapshots.has(key) && !failed.has(key))) loadSource(key);
        }
        scheduleRender();
    }

    weekToggle.addEventListener('change', scheduleRender);
    retryButton.addEventListener('click', () => {
        if (retryButton.getAttribute('aria-disabled') !== 'true') refresh('retry');
    });
    window.addEventListener('viewer-favourites-change', () => refresh('missing'));
    window.addEventListener('viewer-home-scope-change', () => refresh('missing'));
    const refreshInterval = 15 * 60000;
    let lastRefresh = Date.now();
    function refreshVisible() {
        if (document.hidden || Date.now() - lastRefresh < refreshInterval - 1000) return;
        lastRefresh = Date.now();
        refresh('all');
        window.dispatchEvent(new Event('viewer-home-refresh'));
    }
    setInterval(refreshVisible, refreshInterval);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            scheduleRender();
            refreshVisible();
        }
    });
    refresh('all');
})();
