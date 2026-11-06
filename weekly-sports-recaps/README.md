# Weekly sports recap drafts

Create a short, source-linked recap of each sport’s past seven days for the
cgrillo sports viewer. The pipeline collects facts from saved sports data, then
uses the OpenAI Responses API to prepare a draft of about 500 words when enough
verified material is available. Every draft needs human review before publication.

This is a separate project from the viewer. Its scheduled workflow archives
drafts and facts in this repository; it does not publish an article to the website.

## Start with a facts-only dry run

Use Node.js 22.16 or later. There are no package dependencies to install.

```sh
node src/cli.mjs run --dry-run
```

This gathers the configured sports’ facts without calling OpenAI. If a local
viewer checkout is alongside this project, select it and two sports like this:

```sh
node src/cli.mjs collect --source-dir ../simple-name-for-the-public-eye --sports afl,f1
```

Run commands from this project’s root. Without `--source-dir`, the collector uses
the source repository and branch configured in `recaps.config.json`.

## Generate drafts

Copy `.env.example` to `.env`, set `OPENAI_API_KEY` locally, then run:

```sh
node --env-file=.env src/cli.mjs run --sports afl,f1
```

The key stays in the server-side process. Do not commit it or paste it into chat,
issues or workflow logs. `.env` files are ignored by Git.

`OPENAI_MODEL` selects the model. The default is
[`gpt-6-luna`](https://developers.openai.com/api/docs/models/gpt-6-luna).
Generation uses billable OpenAI API requests; a dry run does not. Empty weeks
produce no model request. Existing drafts are kept until you explicitly use
`--force`, including when you want to incorporate corrected source data.

| Command | Result |
| --- | --- |
| `node src/cli.mjs collect` | Collect facts only. |
| `node --env-file=.env src/cli.mjs generate` | Generate drafts from saved facts. |
| `node --env-file=.env src/cli.mjs run` | Collect facts, then generate drafts. |
| `node src/cli.mjs run --dry-run` | Collect facts without an OpenAI request. |
| `--sports afl,f1` | Limit the selected sports. |
| `--week-ending 2026-11-02` | Use the seven days ending on that date at 6 pm Sydney time. |
| `--force` | Explicitly regenerate existing drafts; this can make new API requests. |

## What counts as a week?

The default window is the **past seven calendar days, ending Monday at 6 pm in
Australia/Sydney**. The most recent completed Monday cutoff is used, so a run
before 6 pm on Monday still targets the preceding week. This includes the US
Sunday games and Formula 1 results that arrive on Monday morning in Australia.
Sydney daylight saving is respected when calculating the window.

`--week-ending YYYY-MM-DD` changes the cutoff date to that date at 6 pm Sydney
time. The window ID is its ending date, such as `2026-11-02`.

## Saved files and review

| Location | Contents |
| --- | --- |
| `facts/<week-id>/<sport>.json` | The selected events, available statistics and source references. |
| `drafts/<week-id>/<sport>.json` | Structured draft and generation metadata. |
| `drafts/<week-id>/<sport>.md` | Readable Markdown for review and editing. |
| `public/recaps.json` | An archive index for a future integration. These are still drafts. |
| `reports/<week-id>.json` | Per-sport completion, missing-data and generation status for the run. |

Before publishing, compare the draft with its fact file and source links. Check
the scores, names, dates and any claims about records or standings. Edit the
wording and length as needed. Saving a draft or adding it to the archive does
not count as editorial approval.

Recaps can describe only the facts supplied by the data. They cannot reliably
cover injuries, transfers, press conferences or other developments absent from
those files. Generated paragraph bodies must contain 450–550 words. Empty weeks
and weeks without usable coverage receive a status record without an AI story;
there is no 500-word filler article for them. Missing statistics are not zeroes.
Source attribution explains provenance; it does not grant permission to reuse
another publisher’s wording, images or logos. Check the feeds’ terms before
publishing reused content.

## Schedule it in GitHub

The workflow is ready for a repository that you create and push this project to.
No hosted repository or successful scheduled run is implied by this checkout.

1. Push this project to its own GitHub repository and enable Actions.
2. In **Settings → Secrets and variables → Actions**, add a repository secret
   named `OPENAI_API_KEY`. Optionally add an Actions variable named
   `OPENAI_MODEL` to override the default model.
3. Open **Actions → Weekly sports recap drafts → Run workflow**. Leave
   **Collect facts only** selected for the first run. This makes no OpenAI calls.
4. Review the collected facts in the run’s artifact. Run again with that option
   cleared when you want AI drafts.

The schedule is **Monday at 08:15 UTC**: 6:15 pm Sydney standard time, or 7:15 pm
during daylight saving. GitHub may delay scheduled runs. Manual dispatch also
accepts a sports list, cutoff date and explicit regeneration option.

Live runs commit available facts and drafts to this repository and upload an
artifact retained for seven days. Successful drafts are archived even when a
different sport fails, so a retry can reuse them. Dry runs upload their collected
facts without committing. A single workflow concurrency group and bounded Git
push retries protect archives from competing updates; real merge or permission
errors remain visible. The weekly workflow needs `contents: write` to archive
outputs; the test workflow is read-only.

The source defaults to `Kelpgoatz/simple-name-for-the-public-eye`, branch `main`.
Edit `recaps.config.json` to change the source or enabled sports. Supported sport
IDs are `afl`, `aflw`, `f1`, `f2`, `f3`, `nrl`, `nrlw`, `nba`, `wnba`, `nbl`,
`nfl` and `tennis`. Their coverage depends on the source snapshots available for
the chosen window.

## Verify and troubleshoot

```sh
node --test
```

Tests and dry runs can be checked without an API key. A real OpenAI generation
has not yet been verified in this checkout.

- **No completed events:** check the selected window and sports, then inspect
  the fact files and run report. There should be no AI request merely to fill an empty week.
- **Missing or old source data:** refresh the viewer’s underlying sports feeds,
  or point `--source-dir` to a more recent checkout and collect again.
- **Missing API key:** use a dry run or configure the environment/repository
  secret; never place the key in a committed config file.
- **Rate limit or source error:** inspect the failed step. Saved successful
  outputs remain available for review; rerun after the provider recovers.
- **Archive push rejected:** confirm that Actions has write permission and
  inspect any genuine content conflict before retrying.

The archive is a review queue. Website publication remains a separate, manual
editorial step.
