Yap yap yap, cool website lads

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

Race data comes from [F1 API](https://f1api.dev/docs). Run
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
hour. The F1 API does not supply penalty explanations. Notes are matched to driver
IDs and stored in `f1-penalties.json` with source links and per-race coverage.
Failed downloads retain cached notes and display an incomplete-data message;
unmatched notes mark the race for review. The official result notes may describe
time penalties without specifying when they were served; the site preserves that
distinction and never adds penalty seconds a second time. Coverage is limited to
penalties published in those official result notes, rather than all FIA decisions.

Circuit images are SVG paths projected from the coordinates in
[bacinger/f1-circuits](https://github.com/bacinger/f1-circuits), licensed under MIT
(see `f1-circuits-LICENSE.txt`). Run `node scripts/update-f1-circuits.mjs` to
regenerate `f1-circuits.json`. Maps are served locally and need no image API key.
