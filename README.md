cgrillo is an independent sports viewer for fixtures, results, ladders and
individual performances. It uses a royal-green, paper-and-serif visual style.

The shared newspaper design lives in `editorial.css`, with the article reading
layout in `editorial-articles.css`. All seventeen pages use the same cgrillo wordmark,
royal-green navigation, solid paper surfaces and local fonts from `fonts/`.
`editorial.js` displays the masthead date in Sydney time. Theme switching keeps
the shared typography and solid surfaces, including the new lowercase-c favicon.
Sports links remain permanently visible in the green navigation. AFL, NRL and
NBA have family menus for AFL/AFLW, NRL/NRLW and NBA/WNBA: hover to preview the
links, or click to expand them inside the bar. Expanded families suppress their
hover preview until closed. Touch, keyboard and reduced-motion settings are
supported. `node scripts/update-navigation.mjs` regenerates consistent static
navigation on all pages, including each page’s active link.

The homepage has a compact welcome panel with direct team/driver search and star
management. Readers can hide the introduction on their device and switch between
All sport and Following without deleting their stars. `home-welcome.js` also
keeps overdue or stale AFL updates distinct from confirmed live play and results.
The shared Quick guide (`viewer-guide.js` / `.css`) explains navigation, colours,
missing data and searchable terms for each competition. It is available from
desktop navigation, the phone Sports menu and the footer without opening on its
own. Fixture sliders show their date range and offer a current/next/latest jump
while preserving the reader's chosen or linked round. Failed homepage sources
retain any previously loaded data and offer retry controls with clear messages.
The welcome panel also points to the next published start in the current view,
including practice sessions, with Sydney time and a short countdown. Standings
include a tap-to-open Table key; game centres show the match's round/day, venue,
start and form coming into that game. F1, F2 and F3 session tabs show weekend
progress, upcoming sessions and pending classifications. Published timetable
ambiguities are marked as provisional. F2/F3 session links retain the exact source
session identifier, so a shared link returns to the chosen session.
Full ladder tables share `standings.css` and `SportsUI.renderStandings` from
`sports.js`. AFL uses the same columns as AFLW; F1’s WDC/WCC tables show points
and wins with driver flags or constructor logos, while preserving their selector.
All fixture pages share `fixture-slider.css` and `fixture-slider.js`: a visible
filled track, consistent thumb and five spaced round/week/date shortcuts.
Shortcuts use the same input handler as dragging and keyboard navigation.

The homepage groups games by league. Today includes live games and starts within
three hours either side of now. Upcoming covers the next 24 hours, reduced to 16 hours
for NBA and WNBA. Yesterday uses Sydney dates, with NBA/WNBA results also limited to the past
16 hours. F1 appears first in Upcoming with its wider five-day race-week view;
recent F1 results remain visible for three days.
AFLW, NRL, NRLW, NBA, WNBA, NBL, NFL and nearest-Grand-Slam tennis use `home-sports.js` and the same
compact match layout as AFL, linking to the relevant date/round and tennis tour.
Categories appear when a league has games in that date window. Compact F1 cards link to the
race and show its podium plus a time-only fastest-lap badge. A purple marker
identifies a podium driver who set the fastest lap; upcoming results show TBC.

F1 fixtures are in `f1.html`, with WDC/WCC standings, a round slider, circuit
layouts, full race classifications and fastest laps. Times use the visitor's
local timezone. `?round=1&tab=constructors` opens a specific round and ladder.
The classification includes each driver's starting grid position and personal
fastest race lap; unavailable values display a dash. On small screens the table
scrolls horizontally to keep all columns readable.
Each weekend has P1/P2/P3/Q/Race tabs, or P1/SQ/Sprint/Q/Race when the API schedule
contains sprint sessions. `?session=fp1` opens practice, with `fp2`, `fp3`, `sq`,
`sprint`, `qualifying` and `race` available for the corresponding tabs.
Practice and qualifying tables show best laps, gaps to the preceding driver and
completed lap counts. The leader displays "Interval"; qualifying gaps compare
times from the same phase, with a dash at phase boundaries or missing times.
`scripts/update-f1-sessions.mjs` imports API session identities and schedules plus
official F1 session timing/lap-count tables into `f1-sessions.json` twice hourly.
Unavailable source values remain a dash; session data is isolated from race-only
penalty notes. Sprint fastest laps remain unavailable when not supplied by the
session sources.
Missing API grid values are cross-checked by `scripts/update-f1-grids.mjs` against
official starting-grid tables and notes after penalty imports. Confirmed pit-lane
starts display "Pit lane"; other gaps remain a dash rather than being assumed to
be pit-lane starts.

Race calendars, classifications, qualifying, sprint results and championship
standings come from [Jolpica F1](https://github.com/jolpica/jolpica-f1/tree/main/docs).
The former F1 API source began returning HTTP 402; imports no longer depend on it.
Saved driver identities, circuit IDs and full race names are preserved during the
source change so flags, team logos, profiles and penalty notes continue to match.
Practice and sprint qualifying results use official Formula 1 timing tables.
Run
`node scripts/update-f1-fixtures.mjs` to refresh the current season, or pass a year
as the first argument. The fixtures workflow refreshes the calendar and results
twice an hour; the existing championship workflows refresh standings hourly.
Failed result requests retain previously downloaded classifications.
The calendar automatically requests the current UTC year, so it rolls over to
2027 and subsequent seasons without a code change once that year's API calendar
is available. Standings follow the calendar's season, and old standings are hidden
while new ones are pending. A season with no completed races starts with empty
penalty notes and does not require an official results index yet. If the new
calendar is unavailable, the last valid calendar is retained until a later refresh.

Penalty notes are imported from the official Formula 1 race-result pages by
`node scripts/update-f1-penalties.mjs`, which runs after fixture updates twice an
hour. The results feed does not supply penalty explanations. Notes are matched to driver
IDs and stored in `f1-penalties.json` with source links and per-race coverage.
Failed downloads retain cached notes and display an incomplete-data message;
unmatched notes mark the race for review. The official result notes may describe
time penalties without specifying when they were served; the site preserves that
distinction and never adds penalty seconds a second time. Coverage is limited to
penalties published in those official result notes, rather than all FIA decisions.

All update workflows save through `scripts/save-data.mjs`, which fetches and
rebases before pushing and retries an advancing remote branch up to five times.
Conflicting edits and permission errors still fail. The Jolpica client identifies
the application, spaces requests below the published sustained limit and honors
`Retry-After` on rate limits. An unpublished individual player box score (HTTP
404) is recorded as incomplete coverage and retried after six hours, or 15
minutes for a live game. Provider outages and invalid statistics still fail the
import while preserving saved data; a missing box score never becomes zero stats.

Circuit images are SVG paths projected from the coordinates in
[bacinger/f1-circuits](https://github.com/bacinger/f1-circuits), licensed under MIT
(see `f1-circuits-LICENSE.txt`). Run `node scripts/update-f1-circuits.mjs` to
regenerate `f1-circuits.json`. Maps are served locally and need no image API key.

## Other sports

The navigation links to `aflw.html`, `nrl.html`, `nrlw.html`, `nba.html`,
`wnba.html`, `nbl.html`, `nfl.html` and `tennis.html`. These pages share
`sports.js` and `sports.css`, with fixture
sliders, results, team identities, source links and Sydney match times. NBA
standings switch between the Eastern and Western conferences; NFL standings
switch between AFC and NFC. NRL and NBL each have a league ladder. Tennis shows
men’s and women’s singles draws and set scores, alongside tournament information.

Run `node scripts/update-sports.mjs` to update all eight sports, or pass sport
names such as `node scripts/update-sports.mjs nrl nba`. Snapshots are checked
before being saved in `sports-data/`. NRL/NRLW use the official NRL.com draw and
ladder JSON feeds; AFLW discovers the current women’s premiership season through
the official AFL API (excluding practice and representative competitions).
Basketball, NFL and tennis use ESPN’s public JSON feeds. “NBAW” is labelled
WNBA, the league’s official name; its season follows the calendar year.
No API keys are required. These public website feeds are undocumented and their
availability or format can change; source failures retain downloaded data rather
than inventing results. Pages identify delayed updates and unavailable data.

`.github/workflows/update-sports.yml` refreshes all eight sports every 15 minutes
and on relevant pushes to main, using the same GitHub Actions publishing approach
as the existing AFL and F1 updaters. The scheduled workflow takes effect when
these changes are pushed to the repository’s default branch. It saves successful
sports even if another provider fails, then reports any failures in Actions.

NRL and NRLW request the current UTC year and all API-listed rounds, including finals.
NBA, WNBA, NBL and NFL discover the current season from ESPN, so cross-year seasons
and playoffs are not limited to a hardcoded year. Complete published schedules
are downloaded month by month to avoid ESPN’s response cap; NBA and NBL use a
date slider, while NFL uses weeks. Unpublished playoff opponents remain TBC.
Standings are never carried across to a different season.

Tennis chooses an active Grand Slam first, otherwise the nearest dated Slam
in the current and following year’s API calendars. The source’s tournament date
range can include qualifying. A nearer future Slam with no draw shows its
confirmed tournament information and a draw-pending message. If the next year’s
calendar is not available, that limitation is shown instead of guessing dates.

Run the regression checks with `node --test tests/*.test.cjs`.

AFL and F1 share image identities through `sport-identities.js` and the cached
`sport-identities.json`: AFL clubs use ESPN logos, F1 constructors use official
Formula 1 white logos on green, and F1 drivers use national flags. These appear
in ladders, classifications and homepage cards. Broken images keep the existing
number/abbreviation fallback. `node scripts/update-sport-identities.mjs` refreshes
the manifest; its workflow runs every six hours after publication to main.
Driver nationalities come from the championship snapshot, official F1 results
and official junior-series profiles. `driver-nationalities.json` holds sourced
supplements for reserve drivers absent from those feeds, matched by full name.
Unknown future drivers keep their number until a nationality is available.

`home-ladders.js` builds the homepage’s two-column standings grid from
the existing snapshots, selecting up to six distinct sports. Active men’s leagues
come first, then women’s leagues; each group is ordered nearest its season end.
Only one conference/championship per sport appears at a time: its initial view is
random, with a button linking to the opposite view’s ladder page and an arrow
linking to the currently displayed view’s ladder page.
Each list retains its original 260px height. Ladders qualify from the season start until
10 days after its end, including finals. ESPN season dates keep cross-year
competitions visible even before playoff fixtures are published; a completed
postseason takes precedence over the provider’s broader end date. Where no
explicit season dates are supplied (AFL, NRL and F1), the full fixture calendar
provides the bounds, allowing three hours for the final event. Each card scrolls
through its standings and links to the full league/conference page. Sources
refresh every 15 minutes while the homepage is open.

The AFL round fixture features the first scheduled match at full width, followed
by compact matches in two columns (eight remaining games form four rows). Inside
the same fixtures panel, eight top-six player leaderboards show round totals for
disposals, handballs, kicks, goals, marks, tackles, clearances and hitouts.
The leaderboards use four columns on desktop and two on smaller screens;
fixtures stack on phones. Switching rounds updates both fixtures and tallies.

Run `node scripts/update-afl-player-stats.mjs` to discover the current year's AFL
Premiership season and import individual match statistics from the public AFL
CFS feed. Its session token stays in memory. Completed matches are cached for
seven days in `sports-data/afl-player-matches.json`; live matches refresh every
run. Add `--refresh-all` to re-fetch completed matches immediately. The smaller
`afl-player-stats.json` contains only round summaries for the browser, which
checks for updates every 15 minutes. Missing coverage is labelled, previous
values survive provider failures, and a previous season's totals are never
shown for new-season fixtures.

`.github/workflows/update-afl-player-stats.yml` refreshes the player snapshots
every half hour once published to main, saving successful updates before
reporting any incomplete imports.

Team names in fixtures, ladders and homepage cards open `sport-view.html`.
The dashboard shows published season results, recent form, the biggest win and
top-six player totals or averages, followed by the team's own round/date slider.
Game centres show individual performances, with a statistic-order selector and
a horizontally scrollable table on phones. Missing values remain unavailable;
averages use recorded values for each statistic rather than treating gaps as zero.
Season dashboards include all published fixture phases, clearly labelled when
preseason or postseason games differ from regular-season ladders.

`node scripts/update-player-stats.mjs` imports AFL, AFLW, NRL, NRLW, NBA, WNBA,
NBL and NFL player performances into `sports-data/*-players.json`. Its half-hourly
workflow refreshes live games and caches completed box scores for seven days.
The initial import contains 1,396 games; two WNBA box scores are unavailable at
the provider and are explicitly listed as incomplete coverage. Tennis keeps its
published set scores; serve/return statistics are not invented.

F1 driver and constructor names open season dashboards in `f1.html`, retaining
the round and session. Separate season/All time controls show current-year
performances versus sourced career totals and best achievements. Career data
comes from Jolpica via `node scripts/update-f1-careers.mjs`, with a daily workflow,
compact `f1-careers.json` and reusable `sports-data/f1-career-cache.json`.
Constructor history follows exact provider identities; predecessor teams are
not silently merged. Completed-season titles are kept separate from an ongoing
championship. The initial snapshot covers 39 drivers and 11 constructors.

Other team/player dashboards also have a distinct All time view. Run
`node scripts/update-team-careers.mjs` to refresh historical archive records and
sourced honours daily. Each profile states its actual archive coverage. Available
regular-season records begin in 2012 for AFL, 2017 for AFLW, 1998 for NRL, 2018
for NRLW, 1947 for NBA, 2001 for WNBA, 2023 for NBL and 1922 for NFL. Some team
archives have gaps or start later. Tennis uses the available Grand Slam singles
archive, rather than claiming complete ATP/WTA career statistics. Verified title
tables may extend beyond those game-record windows; missing honours are not
inferred from a first-place regular-season finish.

F2 is a small hover/focus sublink beneath the direct F1 navigation link. Its
current-year fixtures, session classifications, standings, driver/team profiles
and national flags come from official Formula 2 calendar/timing/profile data.
`node scripts/update-f2.mjs` refreshes `f2-data.json`; its workflow runs every half
hour. The initial import has 14 rounds, 51 classified sessions, 23 drivers and
11 teams. F2 profiles cover the current season. Grid positions and penalty
explanations appear only when directly supplied by the source.

`viewer-favourites.js` stores starred leagues, teams and racing drivers only in
the browser's local storage (`cgrillo-favourites-v1`). Nothing is sent to a
server. `home-following.js` filters homepage games, retains a next/latest game
outside the default window, and adds F2 only when explicitly followed. Side
ladders choose the followed conference and put followed entries first while
preserving their actual ranks. Tennis uses a tournament card instead of an
invented league ladder. With no stars, the original homepage selection returns;
the homepage reset button clears preferences. Blocked browser storage falls
back to preferences for the current visit, with a clear notice.

`about.html` introduces the sports viewer and its sources. Shared
`viewer-experience.css/js` adds phone-friendly navigation, an accessible sports
drawer, larger touch targets, safe-area spacing, reduced-motion support and
table scrolling. `team-names.js` consistently labels women's teams in displays
without changing provider IDs. Scheduled GitHub updates take effect when these
changes are on the default branch; local edits alone do not publish the site.

The F1 hover menu also includes F3, with the same current-year driver/team
profiles, flags, weekend slider, standings and session classifications. F3 has
its own updater and half-hourly workflow. It follows the same default-homepage
exclusion and device-only favourite opt-in as F2. The initial F3 import contains
nine rounds, 40 classified sessions, 34 drivers and ten teams.

F2 and F3 share `feeder-results.js` for lap parsing and gap/interval calculation.
Races default to intervals; practice and qualifying default to gaps from the
leader. Purple fastest-lap ordering preserves the original race positions and
points, with timing gaps calculated from the fastest laps. Supplementary FIA
HTML classification tables supply individual best laps. The PDF fallback reads
explicit classification columns when a table is unavailable, including Monza's
F2 races, while preserving corrected positions and points from the primary feed.
All 25 completed F2 races and 19 F3 races in the initial snapshot have recorded
best laps; individual DNS/no-time rows stay unavailable. Starting grids are
never inferred from qualifying or reversed-grid rules.
Classifications from the last 72 hours refresh on every import to pick up
official corrections; older completed sessions use the seven-day cache.

Install the pinned importer dependency with `npm ci --prefix scripts` before
running the F2/F3 updaters locally. PDF.js is used only by the importers; it is not
downloaded by the website. Both GitHub workflows install it from the lockfile.

`viewer-discovery.js/css` adds an accessible search dialog for competitions,
teams and F1/F2/F3 drivers, plus a Following manager. Its static-data index loads
on first use; queries are filtered on the device and are not sent to a search
service. The keyboard shortcut is `/` outside form fields. Phone users can open
Search or Manage stars from the sports drawer.

The homepage toolbar in `home-controls.js/css` filters the existing overview by
All, Live, Upcoming or Results and competition, with counts and an empty-state
reset. It preserves the established time windows and favourite settings.
Team dashboards now include linked recent results and fixture-phase filters;
the selected phase applies to records, player leaders and the round slider.
Game centres include pregame records, earlier head-to-head meetings in the same
phase and leading recorded performances. No later result is used in a pregame
comparison. Tennis labels retained draws by their actual match years.
