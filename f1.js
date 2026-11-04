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
    const { definitions: sessionDefinitions, keysForWeekend, defaultGapMode, resultGapFor, fastestLapOrder, fastestLapGapFor } = F1SessionUtils;
    let currentTab = params.get("tab") === "constructors" ? "constructors" : "drivers";
    let selectedSession = Object.hasOwn(sessionDefinitions, params.get("session")) ? params.get("session") : "race";
    let sessionWeekends = {};
    let drivers = [], constructors = [], races = [], circuitData = {}, penaltyData = {}, penaltyCoverage = {};
    let driverSeason, constructorSeason, season, updatedAt, selectedIndex = 0;
    let driverById = new Map();
    let profileSelection = params.get("driver") ? {kind: "driver", id: params.get("driver")} : params.get("team") ? {kind: "team", id: params.get("team")} : null;
    let profileMode = "total";
    let profileScope = params.get("scope") === "all" ? "all" : "season";
    let careerData = {};
    const profilePanel = document.createElement("section");
    profilePanel.className = "f1-profile";
    profilePanel.hidden = true;
    profilePanel.setAttribute("aria-label", "Season performance dashboard");
    slider.before(profilePanel);
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
    const badge = (parent, value, teamId, driverId) => {
        const element = text("span", "ladder-row__logo", String(value), parent);
        element.setAttribute("aria-hidden", "true");
        applyColors(element, teamId);
        if (driverId) SportIdentity.driver(element, driverId);
        else SportIdentity.team(element, teamId);
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
        query.delete("driver");
        query.delete("team");
        if (profileSelection) query.set(profileSelection.kind, profileSelection.id);
        if (profileSelection && profileScope === "all") query.set("scope", "all");
        else query.delete("scope");
        history.replaceState(null, "", `${location.pathname}?${query}${location.hash}`);
    };
    const profileHref = (kind, id) => F1Profile.href(kind, id, {round: races[selectedIndex]?.round, session: selectedSession, tab: currentTab, scope: profileScope});
    const profileLink = (parent, kind, id, label, className = "f1-profile-link") => {
        const element = text("a", className, label, parent);
        element.href = profileHref(kind, id);
        element.dataset.f1ProfileLink = "";
        element.title = `Open ${label} season dashboard`;
        return element;
    };
    function renderProfile() {
        profilePanel.hidden = !profileSelection;
        if (!profileSelection) { profilePanel.replaceChildren(); return; }
        const profile = F1Profile.build({...profileSelection, season, races, weekends: sessionWeekends, drivers, constructors, teamName: id => getTeam(id).display});
        const career=careerData[profileSelection.kind === "driver" ? "drivers" : "teams"]?.[profileSelection.id];
        profilePanel.innerHTML = F1Profile.renderMarkup(profile, profileMode, {round: races[selectedIndex]?.round, session: selectedSession, tab: currentTab, scope: profileScope, career, teamName: id=>getTeam(id).display});
        profilePanel.querySelectorAll("[data-profile-identity]").forEach(element => {
            if (element.dataset.profileKind === "driver") SportIdentity.driver(element, element.dataset.profileIdentity);
            else SportIdentity.team(element, element.dataset.profileIdentity);
        });
    }
    document.addEventListener("click", event => {
        const scope = event.target.closest("[data-profile-scope]");
        if (scope) { profileScope=scope.dataset.profileScope;setQuery();renderProfile();profilePanel.querySelector(`[data-profile-scope="${profileScope}"]`)?.focus();return; }
        const mode = event.target.closest("[data-profile-mode]");
        if (mode) { profileMode = mode.dataset.profileMode; renderProfile(); profilePanel.querySelector(`[data-profile-mode="${profileMode}"]`)?.focus(); return; }
        const anchor = event.target.closest("[data-f1-profile-link], [data-f1-profile-close]");
        if (!anchor || event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        const query = new URL(anchor.href, location.href).searchParams;
        event.preventDefault();
        profileSelection = query.get("driver") ? {kind:"driver",id:query.get("driver")} : query.get("team") ? {kind:"team",id:query.get("team")} : null;
        profileMode = "total";
        const url = new URL(location.href);
        url.searchParams.delete("driver");
        url.searchParams.delete("team");
        if (profileSelection) url.searchParams.set(profileSelection.kind, profileSelection.id);
        else url.searchParams.delete("scope");
        history.pushState(null, "", url);
        renderRace();
        renderLadder();
        if (profileSelection) {
            profilePanel.querySelector("h2")?.focus({preventScroll:true});
            profilePanel.scrollIntoView({behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start"});
        }
    });
    window.addEventListener("popstate", () => {
        if (!races.length) return;
        const query = new URLSearchParams(location.search);
        profileSelection = query.get("driver") ? {kind:"driver",id:query.get("driver")} : query.get("team") ? {kind:"team",id:query.get("team")} : null;
        const index = races.findIndex(race => Number(race.round) === Number(query.get("round")));
        if (index >= 0) selectedIndex = index;
        if (Object.hasOwn(sessionDefinitions, query.get("session"))) selectedSession = query.get("session");
        currentTab = query.get("tab") === "constructors" ? "constructors" : "drivers";
        profileScope=query.get("scope")==="all"?"all":"season";
        renderRace();
        renderLadder();
    });

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
        const ordered = [...standings].sort((a, b) => number(a.position) - number(b.position));
        const rows = ordered.map(standing => {
            const team = getTeam(standing.teamId);
            const info = driverInfo(standing);
            return { rank: standing.position, team: { name: isDrivers ? info.name : team.display, abbreviation: String(isDrivers ? info.number : team.abbr), color: team.colors[0] }, points: standing.points, wins: standing.wins };
        });
        ladder.innerHTML = SportsUI.renderStandings({ label: ladderTitle.textContent, rows }, isDrivers ? "f1-drivers" : "f1-constructors");
        ladder.querySelectorAll("tbody tr").forEach((row, index) => {
            const standing = ordered[index], badge = row.querySelector(".sports-identity");
            if (isDrivers) SportIdentity.driver(badge, driverInfo(standing).id);
            else SportIdentity.team(badge, standing.teamId);
            const name = row.querySelector(".sports-table__team > span:last-child");
            if (name) {
                const anchor = profileLink(null, isDrivers ? "driver" : "team", isDrivers ? driverInfo(standing).id : standing.teamId, name.textContent);
                name.replaceWith(anchor);
            }
        });
        ladder.scrollTop = 0;
        ladderNote.textContent = "Select a name for the season dashboard. Season standings · refreshed hourly from F1 API.";
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
        badge(row, info.number, info.teamId, info.id);
        const identity = text("div", "race-driver", "", row);
        profileLink(identity, "driver", info.id, info.name, "race-driver__name race-driver__profile-link");
        SportIdentity.inline(profileLink(identity, "team", info.teamId, getTeam(info.teamId).display, "race-driver__team race-driver__profile-link"), "constructors", info.teamId);
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
        text("p", "race-empty", "Select a driver or constructor name for their season dashboard and individual session performance.", section);
        const resultRows = new Map();
        let fastestOrder = false;
        if (isRace) {
            const sorting = text("div", "result-gap-toggle result-order-toggle", "", section);
            sorting.setAttribute("role", "group");
            sorting.setAttribute("aria-label", "Results order");
            const finishButton = text("button", "", "Finishing order", sorting);
            const lapButton = text("button", "result-order-toggle__fastest", "Fastest lap order", sorting);
            const orderNote = text("p", "race-empty result-order-note", "", section);
            orderNote.setAttribute("role", "status");
            const sort = fastest => {
                fastestOrder = fastest;
                title.textContent = fastest ? "Fastest lap order" : sessionKey === "race" ? "Finishing order" : `${definition.title} results`;
                title.classList.toggle("race-section-title--fastest", fastest);
                finishButton.setAttribute("aria-pressed", String(!fastest));
                lapButton.setAttribute("aria-pressed", String(fastest));
                const displayed = fastest ? fastestLapOrder(ordered) : ordered;
                displayed.forEach(result => tbody.appendChild(resultRows.get(result)));
                orderNote.textContent = fastest
                    ? "Sorted by fastest lap; missing lap times appear last. Positions and points still refer to the finishing classification."
                    : "";
                updateGaps();
            };
            finishButton.type = lapButton.type = "button";
            finishButton.setAttribute("aria-pressed", "true");
            lapButton.setAttribute("aria-pressed", "false");
            finishButton.addEventListener("click", () => sort(false));
            lapButton.addEventListener("click", () => sort(true));
        }
        let gapMode = defaultGapMode(sessionKey);
        const gapCells = [];
        let gapHeader, gapNote;
        const controls = text("div", "result-gap-toggle", "", section);
        controls.setAttribute("role", "group");
        controls.setAttribute("aria-label", "Results gap display");
        const modeButtons = [ ["leader", "Gap from leader"], ["interval", "Interval"] ].map(([mode, label]) => {
            const button = text("button", "", label, controls);
            button.type = "button";
            button.setAttribute("aria-pressed", String(mode === gapMode));
            button.addEventListener("click", () => { gapMode = mode; updateGaps(); });
            return { button, mode };
        });
        const updateGaps = () => {
            modeButtons.forEach(({ button, mode }) => button.setAttribute("aria-pressed", String(mode === gapMode)));
            gapHeader.textContent = gapMode === "leader" ? "Gap from leader" : "Interval";
            gapHeader.title = fastestOrder
                ? gapMode === "leader" ? "Best-lap gap to the fastest car" : "Best-lap gap to the car above in fastest lap order"
                : gapMode === "leader" ? "Gap to the session leader" : "Gap to the driver immediately ahead in the finishing classification";
            const fastest = fastestOrder ? fastestLapOrder(ordered) : [];
            const lapIndices = new Map(fastest.map((result, index) => [result, index]));
            gapCells.forEach((cell, index) => { cell.textContent = fastestOrder
                ? fastestLapGapFor(fastest, lapIndices.get(ordered[index]), gapMode)
                : resultGapFor(ordered, index, isRace, gapMode); });
            gapNote.textContent = fastestOrder
                ? gapMode === "leader" ? "Lap-time gaps are measured from the fastest car; a dash means no recorded fastest lap." : "Lap-time intervals compare each car with the one above; a dash means no recorded fastest lap."
                : isRace
                ? "The winner’s total time and retirement/lapped statuses are retained. Intervals are calculated where comparable race times are available."
                : `${gapMode === "leader" ? "Gap is to the session leader" : "Interval is to the driver ahead"}. Only laps from the same session phase are compared; a dash means no comparable timed lap.`;
        };
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
            if (value === "Gap" || value === "Time / status") gapHeader = cell;
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
            if (profileSelection && F1Profile.includes(profileSelection, result)) row.classList.add("race-results__selected");
            text("td", "race-results__position", result.position || "–", row);
            const driverCell = text("td", "race-results__driver", "", row);
            const identity = text("div", "race-results__identity", "", driverCell);
            badge(identity, info.number, info.teamId, info.id);
            const names = text("div", "race-driver", "", identity);
            profileLink(names, "driver", info.id, info.name, "race-driver__name race-driver__profile-link");
            SportIdentity.inline(profileLink(names, "team", info.teamId, getTeam(info.teamId).display, "race-driver__team race-driver__profile-link"), "constructors", info.teamId);
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
                gapCells.push(text("td", "race-results__time", "", row));
                const lap = text("td", "race-results__lap", "", row);
                const isFastest = result.fastLap && info.id === session.fastestLap?.driverId;
                text("span", isFastest ? "fastest-lap-badge" : "", result.fastLap || "–", lap);
                if (isFastest) text("span", "sr-only", " (race fastest lap)", lap);
                text("td", "race-results__points", number(result.points), row);
            } else {
                gapCells.push(text("td", "race-results__time", "", row));
                const lap = text("td", "race-results__lap", "", row);
                text("span", index === 0 && result.bestLap ? "fastest-lap-badge" : "", result.bestLap || "–", lap);
                if (/^(?:SQ|Q)[123]$/.test(result.timingSegment || "")) text("span", "session-phase", result.timingSegment, lap);
                const laps = text("td", "race-results__laps", result.lapsCompleted ?? "–", row);
                if (result.lapsCompleted == null) laps.title = "Lap count not supplied by the session source";
            }
            tbody.appendChild(row);
            resultRows.set(result, row);
        });
        table.appendChild(tbody);
        gapNote = text("p", "race-empty session-interval-note", "", section);
        updateGaps();
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
        if (profileSelection) {
            const performance = text("div", "", "", panel);
            performance.innerHTML = F1Profile.renderSessionMarkup(profileSelection, race, selectedSession, session, id=>getTeam(id).display);
        }
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
        FixtureSlider.update(slider, races.map((item, value) => ({value, label:`Round ${item.round}`, shortLabel:`R${item.round}`})));
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
        renderProfile();
        ladder.querySelectorAll("[data-f1-profile-link]").forEach(anchor => {
            const query = new URL(anchor.href, location.href).searchParams;
            const kind = query.has("driver") ? "driver" : "team";
            anchor.href = profileHref(kind, query.get(kind));
        });
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
            loadJSON("f1-penalties.json"), loadJSON("f1-sessions.json"), loadJSON("f1-careers.json")
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
        careerData=value(6)||{};
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
