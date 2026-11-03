(() => {
    const root = document.documentElement;
    const toggle = document.querySelector("[data-theme-toggle]");
    const setTheme = (theme, persist = true) => {
        root.dataset.theme = theme;
        toggle.textContent = theme === "dark" ? "Light mode" : "Dark mode";
        toggle.setAttribute("aria-pressed", String(theme === "dark"));
        document.getElementById("favicon").href = theme === "dark" ? "favicon-dark.svg" : "favicon.svg";
        if (persist) { try { localStorage.setItem("cgrillo-theme", theme); } catch {} }
    };
    let stored;
    try { stored = localStorage.getItem("cgrillo-theme"); } catch {}
    setTheme(stored || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"), false);
    toggle.addEventListener("click", () => setTheme(root.dataset.theme === "dark" ? "light" : "dark"));

    // Shared identity and badge rendering for the ladder, classification and fastest lap.
    const teams = {
        mercedes: { display: "Mercedes", abbr: "MER", colors: ["#00d2be", "#000000"] },
        ferrari: { display: "Ferrari", abbr: "FER", colors: ["#dc0000", "#fff200"] },
        red_bull: { display: "Red Bull Racing", abbr: "RBR", colors: ["#1e41a0", "#e31b23"] },
        mclaren: { display: "McLaren", abbr: "MCL", colors: ["#ff8700", "#000000"] },
        alpine: { display: "Alpine", abbr: "ALP", colors: ["#0090ff", "#000000"] },
        rb: { display: "Racing Bulls", abbr: "RB", colors: ["#e31b23", "#1e41a0"] },
        haas: { display: "Haas", abbr: "HAA", colors: ["#ffffff", "#e31b23"] },
        audi: { display: "Audi", abbr: "AUD", colors: ["#dc0000", "#000000"] },
        williams: { display: "Williams", abbr: "WIL", colors: ["#005aff", "#ffffff"] },
        aston_martin: { display: "Aston Martin", abbr: "AST", colors: ["#006f62", "#000000"] },
        cadillac: { display: "Cadillac", abbr: "CAD", colors: ["#111111", "#666666"] }
    };
    const fixtures = document.querySelector("[data-fixtures-list]");
    const fixturesNote = document.querySelector("[data-fixtures-note]");
    const ladder = document.querySelector("[data-ladder-list]");
    const ladderNote = document.querySelector("[data-ladder-note]");
    const ladderTitle = document.querySelector("[data-ladder-title]");
    const tabs = [...document.querySelectorAll("[data-tab]")];
    const slider = document.querySelector("[data-round-slider]");
    const previous = document.querySelector("[data-round-prev]");
    const next = document.querySelector("[data-round-next]");
    const params = new URLSearchParams(location.search);
    const { definitions: sessionDefinitions, keysForWeekend, intervalFor } = F1SessionUtils;
    let currentTab = params.get("tab") === "constructors" ? "constructors" : "drivers";
    let selectedSession = Object.hasOwn(sessionDefinitions, params.get("session")) ? params.get("session") : "race";
    let sessionWeekends = {};
    let drivers = [], constructors = [], races = [], circuitData = {}, penaltyData = {}, penaltyCoverage = {};
    let driverSeason, constructorSeason, season, updatedAt, selectedIndex = 0;
    let driverById = new Map();
    const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
    const text = (tag, className, value, parent) => {
        const element = document.createElement(tag);
        element.className = className;
        element.textContent = value;
        parent?.appendChild(element);
        return element;
    };
    const getTeam = id => teams[id] || { display: id || "Team TBC", abbr: "F1", colors: ["#0f5a6d", "#79d7ec"] };
    const applyColors = (element, teamId) => {
        const team = getTeam(teamId);
        element.style.setProperty("--logo-from", team.colors[0]);
        element.style.setProperty("--logo-to", team.colors[1]);
    };
    const driverInfo = entry => {
        const id = entry.driverId || entry.driver?.driverId;
        const standing = driverById.get(id);
        const driver = standing?.driver || entry.driver || {};
        return {
            id,
            name: [driver.name, driver.surname].filter(Boolean).join(" ") || id?.replaceAll("_", " ") || "Driver TBC",
            number: driver.number ?? "–",
            teamId: entry.teamId || standing?.teamId
        };
    };
    const badge = (parent, value, teamId) => {
        const element = text("span", "ladder-row__logo", String(value), parent);
        element.setAttribute("aria-hidden", "true");
        applyColors(element, teamId);
    };
    const link = (parent, label, href) => {
        const element = text("a", "", label, parent);
        element.href = href;
        return element;
    };
    const setQuery = () => {
        const query = new URLSearchParams(location.search);
        if (races[selectedIndex]) query.set("round", races[selectedIndex].round);
        query.set("tab", currentTab);
        query.set("session", selectedSession);
        history.replaceState(null, "", `${location.pathname}?${query}${location.hash}`);
    };

    function renderLadder() {
        const isDrivers = currentTab === "drivers";
        ladderTitle.textContent = isDrivers ? "World Drivers’ Championship" : "World Constructors’ Championship";
        document.querySelector("[data-ladder-season]").textContent = season || (isDrivers ? driverSeason : constructorSeason) || "";
        tabs.forEach(tab => {
            const active = tab.dataset.tab === currentTab;
            tab.classList.toggle("tab--active", active);
            tab.setAttribute("aria-selected", String(active));
            tab.tabIndex = active ? 0 : -1;
        });
        ladder.setAttribute("aria-labelledby", `tab-${currentTab}`);
        ladder.replaceChildren();
        const standings = isDrivers ? drivers : constructors;
        if (!standings.length) {
            text("p", "fixtures-empty", `${season || "Season"} championship standings have not been published yet.`, ladder);
            ladderNote.textContent = "Please try again later.";
            return;
        }
        [...standings].sort((a, b) => number(a.position) - number(b.position)).forEach(standing => {
            const team = getTeam(standing.teamId);
            const info = driverInfo(standing);
            const row = text("div", "ladder-row", "", ladder);
            applyColors(row, standing.teamId);
            text("span", "ladder-row__pos", standing.position, row);
            badge(row, isDrivers ? info.number : team.abbr, standing.teamId);
            text("span", "ladder-row__team", isDrivers ? info.name : team.display, row);
            const stats = text("span", "ladder-row__stats", "", row);
            text("strong", "", `${number(standing.points)} pts`, stats);
            text("span", "", `${number(standing.wins)} ${number(standing.wins) === 1 ? "win" : "wins"}`, stats);
        });
        ladder.scrollTop = 0;
        ladderNote.textContent = "Season standings · refreshed hourly from F1 API.";
    }

    function switchTab(tab, focus = false) {
        currentTab = tab;
        renderLadder();
        setQuery();
        if (focus) tabs.find(button => button.dataset.tab === tab).focus();
    }
    tabs.forEach((tab, index) => {
        tab.addEventListener("click", () => switchTab(tab.dataset.tab));
        tab.addEventListener("keydown", event => {
            const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
            if (!keys.includes(event.key)) return;
            event.preventDefault();
            const target = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + 1) % tabs.length;
            switchTab(tabs[target].dataset.tab, true);
        });
    });

    function renderMap(race, parent) {
        const figure = text("figure", "circuit-map", "", parent);
        const circuit = circuitData[race.circuitId];
        if (circuit?.path) {
            const ns = "http://www.w3.org/2000/svg";
            const svg = document.createElementNS(ns, "svg");
            svg.setAttribute("viewBox", "0 0 600 280");
            svg.setAttribute("role", "img");
            svg.setAttribute("aria-label", `${race.circuit} circuit map`);
            const title = document.createElementNS(ns, "title");
            title.textContent = `${race.circuit} circuit layout`;
            svg.appendChild(title);
            for (const className of ["circuit-map__edge", "circuit-map__track"]) {
                const path = document.createElementNS(ns, "path");
                path.setAttribute("d", circuit.path);
                path.setAttribute("class", className);
                svg.appendChild(path);
            }
            const start = document.createElementNS(ns, "circle");
            start.setAttribute("cx", circuit.start[0]);
            start.setAttribute("cy", circuit.start[1]);
            start.setAttribute("r", "5");
            start.setAttribute("class", "circuit-map__start");
            svg.appendChild(start);
            figure.appendChild(svg);
            const caption = text("figcaption", "circuit-map__caption", "Circuit layout · ", figure);
            link(caption, "Map data", "https://github.com/bacinger/f1-circuits");
        } else {
            text("p", "fixtures-empty", "Circuit layout is currently unavailable.", figure);
        }
    }

    function renderFastestLap(race, parent) {
        const section = text("section", "fastest-lap", "", parent);
        const title = text("h3", "race-section-title", "Fastest lap", section);
        section.setAttribute("aria-labelledby", "fastest-lap-title");
        title.id = "fastest-lap-title";
        if (!race.fastestLap?.time) {
            text("p", "race-empty", race.status === "CONCLUDED" ? "Fastest lap has not been published yet." : "Available after the race.", section);
            return;
        }
        const result = race.results?.find(item => item.driverId === race.fastestLap.driverId);
        const info = driverInfo({ ...result, ...race.fastestLap });
        const row = text("div", "fastest-lap__driver", "", section);
        badge(row, info.number, info.teamId);
        const identity = text("div", "race-driver", "", row);
        text("strong", "race-driver__name", info.name, identity);
        text("span", "race-driver__team", getTeam(info.teamId).display, identity);
        text("strong", "fastest-lap__time fastest-lap-badge", race.fastestLap.time, row);
    }

    function renderResults(race, parent, sessionKey = "race", session = race) {
        const definition = sessionDefinitions[sessionKey];
        const isRace = definition.isRace;
        const section = text("section", "race-results", "", parent);
        const heading = text("div", "race-results__head", "", section);
        const title = text("h3", "race-section-title", sessionKey === "race" ? "Finishing order" : `${definition.title} results`, heading);
        title.id = "finishing-order-title";
        section.setAttribute("aria-labelledby", title.id);
        if (!session.results?.length) {
            if (session.status === "UNAVAILABLE") {
                text("p", "race-empty", `${definition.title} data is currently unavailable. Please try again later.`, section);
                return;
            }
            const pending = session.status === "CONCLUDED" || Date.parse(session.startTime || session.date) < Date.now();
            text("p", "race-empty", pending ? `${definition.title} results have not been published yet.` : `${definition.title} results will appear here after the session.`, section);
            return;
        }
        text("span", "race-results__count", `${session.results.length} drivers`, heading);
        text("p", "table-scroll-hint", "Scroll sideways for all columns.", section);
        const scroll = text("div", "race-results__scroll", "", section);
        scroll.tabIndex = 0;
        scroll.setAttribute("role", "region");
        scroll.setAttribute("aria-label", `Scrollable ${definition.title.toLowerCase()} classification`);
        const table = text("table", "race-results__table", "", scroll);
        if (!isRace) table.classList.add("session-results__table");
        text("caption", "sr-only", `${race.name} — ${definition.title.toLowerCase()} classification`, table);
        const thead = document.createElement("thead");
        const head = document.createElement("tr");
        const columns = isRace ? ["Pos", "Driver", "Grid", "Time / status", "Fastest lap", "Pts"] : ["Pos", "Driver", "Gap", "Best lap", "Laps completed"];
        columns.forEach(value => {
            const cell = text("th", "", value, head);
            cell.scope = "col";
            if (value === "Grid") cell.title = "Starting grid position";
            if (value === "Gap") cell.title = "Gap to the driver ahead, comparing times from the same session phase";
        });
        thead.appendChild(head);
        table.appendChild(thead);
        const tbody = document.createElement("tbody");
        // Keep the API's classified order for DNS/DSQ entries with no numeric place.
        const ordered = [...session.results].sort((a, b) => (Number(a.position) || Infinity) - (Number(b.position) || Infinity));
        ordered.forEach((result, index) => {
            const info = driverInfo(result);
            const row = document.createElement("tr");
            applyColors(row, info.teamId);
            const podium = isRace && { 1: "gold", 2: "silver", 3: "bronze" }[Number(result.position)];
            if (podium) row.classList.add(`race-results__podium--${podium}`);
            if (isRace && info.id === session.fastestLap?.driverId) row.classList.add("race-results__fastest");
            text("td", "race-results__position", result.position || "–", row);
            const driverCell = text("td", "race-results__driver", "", row);
            const identity = text("div", "race-results__identity", "", driverCell);
            badge(identity, info.number, info.teamId);
            const names = text("div", "race-driver", "", identity);
            text("strong", "race-driver__name", info.name, names);
            text("span", "race-driver__team", getTeam(info.teamId).display, names);
            const penalties = sessionKey === "race" ? penaltyData[race.raceId]?.[info.id] || [] : [];
            penalties.forEach(penalty => {
                const note = text("span", "race-penalty", `Penalty: ${penalty.note} `, names);
                if (/^https:\/\//.test(penalty.source || "")) {
                    const source = link(note, "Source", penalty.source);
                    source.setAttribute("aria-label", `Penalty source for ${info.name}`);
                }
            });
            if (isRace) {
                const rawGrid = String(result.grid ?? "").trim();
                const grid = /^(?:pit[ -]lane|pl)$/i.test(rawGrid) ? "Pit lane" : /^(?:not available|n\/a|unknown|[-–]|0)?$/i.test(rawGrid) ? "–" : rawGrid;
                const gridCell = text("td", "race-results__grid", grid, row);
                if (result.gridSource) gridCell.title = "Confirmed against the official F1 starting grid";
                const retired = result.retired && result.retired !== "0" && result.retired !== "false";
                const status = retired ? (typeof result.retired === "string" && !["1", "true"].includes(result.retired) ? result.retired : "DNF") : result.time || "–";
                text("td", "race-results__time", status, row);
                const lap = text("td", "race-results__lap", "", row);
                const isFastest = result.fastLap && info.id === session.fastestLap?.driverId;
                text("span", isFastest ? "fastest-lap-badge" : "", result.fastLap || "–", lap);
                if (isFastest) text("span", "sr-only", " (race fastest lap)", lap);
                text("td", "race-results__points", number(result.points), row);
            } else {
                const gap = text("td", "race-results__time", intervalFor(ordered, index), row);
                if (index > 0 && (result.timingSegment || "") !== (ordered[index - 1].timingSegment || "")) gap.title = "Times are from different qualifying phases and cannot be compared directly";
                const lap = text("td", "race-results__lap", "", row);
                text("span", index === 0 && result.bestLap ? "fastest-lap-badge" : "", result.bestLap || "–", lap);
                if (/^(?:SQ|Q)[123]$/.test(result.timingSegment || "")) text("span", "session-phase", result.timingSegment, lap);
                const laps = text("td", "race-results__laps", result.lapsCompleted ?? "–", row);
                if (result.lapsCompleted == null) laps.title = "Lap count not supplied by the session source";
            }
            tbody.appendChild(row);
        });
        table.appendChild(tbody);
        if (!isRace) {
            const note = sessionKey === "qualifying" || sessionKey === "sq"
                ? "Gap is to the driver ahead. Qualifying gaps compare laps from the same phase; a dash means there is no comparable timed lap."
                : "Gap is to the driver ahead; a dash means there is no comparable timed lap.";
            text("p", "race-empty session-interval-note", note, section);
        }
        if (sessionKey === "race" && Object.keys(penaltyData[race.raceId] || {}).length) {
            text("p", "race-empty", "Positions and times show the published classification, including applied penalties.", section);
        }
        const coverage = penaltyCoverage[race.raceId];
        if (sessionKey === "race" && (!coverage || coverage.status !== "checked")) {
            text("p", "race-empty", "Penalty notes may be incomplete while the official results source is unavailable or awaiting review.", section);
        }
    }

    function weekendSession(race, key) {
        if (key === "race") return { ...race, source: race.resultsSource };
        return sessionWeekends[race.raceId]?.sessions?.[key] || { results: [], status: "UNAVAILABLE" };
    }

    function renderSessionSelector(race, parent) {
        const weekend = sessionWeekends[race.raceId];
        const keys = weekend ? keysForWeekend(Boolean(weekend.isSprint)) : ["race"];
        if (!keys.includes(selectedSession)) selectedSession = "race";
        const group = text("div", "tab-group session-tabs", "", parent);
        group.setAttribute("role", "tablist");
        group.setAttribute("aria-label", "Weekend session");
        keys.forEach((key, index) => {
            const definition = sessionDefinitions[key];
            const button = text("button", `tab${selectedSession === key ? " tab--active" : ""}`, definition.label, group);
            button.type = "button";
            button.id = `session-tab-${key}`;
            button.dataset.session = key;
            button.setAttribute("role", "tab");
            button.setAttribute("aria-label", definition.title);
            button.setAttribute("aria-selected", String(selectedSession === key));
            button.setAttribute("aria-controls", "race-session-panel");
            button.tabIndex = selectedSession === key ? 0 : -1;
            const change = target => {
                selectedSession = target;
                renderRace();
                document.getElementById(`session-tab-${target}`).focus({ preventScroll: true });
            };
            button.addEventListener("click", () => change(key));
            button.addEventListener("keydown", event => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const target = event.key === "Home" ? 0 : event.key === "End" ? keys.length - 1
                    : (index + (event.key === "ArrowLeft" ? -1 : 1) + keys.length) % keys.length;
                change(keys[target]);
            });
        });
        if (!weekend) text("p", "race-empty", "Other session data is currently unavailable. Please try again later.", parent);
        const panel = text("div", "session-panel", "", parent);
        panel.id = "race-session-panel";
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", `session-tab-${selectedSession}`);
        panel.tabIndex = 0;
        const session = weekendSession(race, selectedSession);
        if (selectedSession !== "race") {
            const time = new Date(session.startTime || "");
            if (Number.isFinite(time.getTime())) {
                text("p", "session-time", new Intl.DateTimeFormat(undefined, {
                    weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short"
                }).format(time), panel);
            }
        }
        renderResults(race, panel, selectedSession, session);
        if (selectedSession === "race" || (sessionDefinitions[selectedSession].isRace && session.fastestLap?.time)) {
            renderFastestLap(session, panel);
        }
    }

    function renderRace() {
        const race = races[selectedIndex];
        if (!race) return;
        document.querySelector("[data-round-value]").textContent = race.round;
        slider.disabled = races.length < 2;
        slider.max = String(races.length - 1);
        slider.value = String(selectedIndex);
        slider.style.setProperty("--fill", `${selectedIndex / Math.max(races.length - 1, 1) * 100}%`);
        slider.setAttribute("aria-valuetext", `Round ${race.round}: ${race.name}`);
        previous.disabled = selectedIndex === 0;
        next.disabled = selectedIndex === races.length - 1;
        fixtures.replaceChildren();
        const article = text("article", "race-info", "", fixtures);
        renderMap(race, article);
        const intro = text("div", "race-intro", "", article);
        const meta = text("div", "race-intro__meta", "", intro);
        text("span", "race-round", `Round ${race.round} · ${season}`, meta);
        const finished = race.status === "CONCLUDED";
        const pending = !finished && Date.parse(race.startTime || race.date) < Date.now();
        text("span", `fixture__status fixture__status--${finished ? "finished" : "scheduled"}`, finished ? "Concluded" : pending ? "Results pending" : "Scheduled", meta);
        text("h2", "race-name", race.name, intro);
        text("p", "race-circuit", race.circuit, intro);
        const detail = text("div", "race-detail", "", intro);
        text("span", "", race.location, detail);
        const date = new Date(race.startTime || `${race.date}T12:00:00Z`);
        const dateLabel = Number.isFinite(date.getTime())
            ? race.startTime
                ? new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(date)
                : `${new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date)} · Time TBC`
            : "Date and time TBC";
        text("span", "", dateLabel, detail);
        const facts = [];
        if (race.laps) facts.push(`${race.laps} laps`);
        if (race.lengthKm) facts.push(`${race.lengthKm.toFixed(3)} km`);
        if (race.corners) facts.push(`${race.corners} corners`);
        if (facts.length) text("p", "race-facts", facts.join(" · "), intro);
        renderSessionSelector(race, article);
        fixturesNote.hidden = false;
        fixturesNote.replaceChildren();
        const session = weekendSession(race, selectedSession);
        link(fixturesNote, selectedSession === "race" ? "Race data: F1 API" : `${sessionDefinitions[selectedSession].title} data`, session.source || "https://f1api.dev");
        if (updatedAt) {
            const date = new Date(updatedAt);
            if (Number.isFinite(date.getTime())) fixturesNote.append(` · Updated ${date.toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`);
        }
        setQuery();
    }
    const selectRace = index => {
        selectedIndex = Math.max(0, Math.min(races.length - 1, index));
        renderRace();
    };
    previous.addEventListener("click", () => selectRace(selectedIndex - 1));
    next.addEventListener("click", () => selectRace(selectedIndex + 1));
    slider.addEventListener("input", () => selectRace(Number(slider.value)));

    async function loadJSON(path) {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Failed to load ${path}`);
        return response.json();
    }
    async function load() {
        const data = await Promise.allSettled([
            loadJSON("f1-fixtures.json"), loadJSON("drivers-championship.json"),
            loadJSON("constructors-championship.json"), loadJSON("f1-circuits.json"),
            loadJSON("f1-penalties.json"), loadJSON("f1-sessions.json")
        ]);
        const value = index => data[index].status === "fulfilled" ? data[index].value : null;
        const calendar = value(0);
        if (Array.isArray(calendar?.races)) {
            races = calendar.races.filter(race => Number.isFinite(Number(race.round))).sort((a, b) => a.round - b.round);
            season = calendar.season;
            updatedAt = calendar.updatedAt;
        }
        driverSeason = value(1)?.season;
        constructorSeason = value(2)?.season;
        drivers = Array.isArray(value(1)?.drivers_championship) ? value(1).drivers_championship : [];
        constructors = Array.isArray(value(2)?.constructors_championship) ? value(2).constructors_championship : [];
        if (season && Number(driverSeason) !== Number(season)) drivers = [];
        if (season && Number(constructorSeason) !== Number(season)) constructors = [];
        // A delayed new-season update must not substitute another season's identities.
        driverById = new Map((driverSeason === season ? drivers : []).map(standing => [standing.driverId, standing]));
        circuitData = value(3)?.circuits || {};
        penaltyData = value(4)?.season === season ? value(4).races || {} : {};
        penaltyCoverage = value(4)?.season === season ? value(4).coverage || {} : {};
        sessionWeekends = Number(value(5)?.season) === Number(season) ? value(5).races || {} : {};
        renderLadder();
        if (!races.length) {
            fixtures.replaceChildren();
            text("p", "fixtures-empty", "F1 fixtures are currently unavailable. Please try again later.", fixtures);
            return;
        }
        const requested = races.findIndex(race => race.round === Number(params.get("round")));
        const lastCompleted = races.findLastIndex(race => race.results?.length);
        const upcoming = races.findIndex(race => Date.parse(race.startTime || race.date) > Date.now());
        selectedIndex = requested >= 0 ? requested : lastCompleted >= 0 ? lastCompleted : Math.max(upcoming, 0);
        renderRace();
    }
    load();
})();
