# Tokyo Yamathon 2026 — Finish Line Dashboard

**© 2026 SxS Partners. All rights reserved.**
Proprietary software developed by SxS Partners. This code and its design are the property of SxS Partners, which retains all rights.

A live, big-screen results board for the Tokyo Yamathon, driven by the Webscorer JSON API. Shows Teams In, On Course, Complete and Retired across the three courses (Full / Half / Half-a-Half), with per-course radar gauges, Top 10 leaderboards, a rotating Congratulations podium, a live finish feed, an Event Clock anchored to the 08:00 first wave, and an EN / 日本語 toggle.

---

## How it works

```
GitHub Action (every 10 min)  ──►  scripts/fetch.mjs
  calls Webscorer with the PRO token (from repo Secrets)
  writes  data/counts.json   (Teams In, from the START LISTS)
          data/results.json  (finishers, from the RESULTS races)
        │
        ▼ commit to main
GitHub Pages  ──►  serves index.html + data/*.json  (public)
        │
        ▼ embedded in an iframe
Wix page  ──►  public viewers
```

The token lives only in GitHub Secrets. It never appears in the served files or the browser.

---

## One-time setup

1. **Add the Secrets** — Settings → Secrets and variables → Actions → New repository secret:
   - `WEBSCORER_APIID` — your JSON API ID (the digits at the end of your organizer page URL; not a race id, not the token)
   - `WEBSCORER_TOKEN` — your JSON API token. **Reset it first** on your Webscorer organizer page, then paste the fresh value here. Keep it only here.
2. **Enable Pages** — Settings → Pages → Source: *Deploy from a branch* → Branch: `main` → `/ (root)` → Save.
   Your site will be at **https://charlessxs.github.io/TYFINISHDASHBOARD/**
3. **Run it once** — Actions → “Yamathon data” → Run workflow. Confirm `data/counts.json` updates and the dashboard shows Teams In.

The dashboard reads its data with **relative paths**, so it works at the Pages URL and inside the Wix iframe with no CORS and nothing to edit.

---

## On race morning

When timing is posted, Webscorer creates three per-course **results** races. Put their ids into **`config.json`** and commit:

```json
"results": { "full": "RESULT_ID_FULL", "half": "RESULT_ID_HALF", "quarter": "RESULT_ID_HAH" }
```

Within ~10 minutes the Action picks them up and finishers start flowing. Nothing else to touch. (Optional: bump the workflow cron to `*/5` for faster updates — see the comment in the workflow file.)

---

## Embedding on Wix

Add an **Embed → Embed a Site** (iframe) element on one Wix page, pointing to the Pages URL above. The dashboard runs on the GitHub origin inside the iframe, so it fetches its data same-origin (no CORS). Give the iframe a tall height (~1100px) for desktop. For phones, also add a **“View Live Dashboard”** button linking directly to the Pages URL — it opens full-screen and is natively responsive.

---

## Files

| File | Purpose |
|---|---|
| `index.html` | the dashboard (self-contained: fonts + logos embedded) |
| `config.json` | race ids — the only file you edit on race morning |
| `data/counts.json` | Teams In per course (seeded; Action overwrites) |
| `data/results.json` | finishers per course (empty until race day) |
| `scripts/fetch.mjs` | the fetcher the Action runs |
| `.github/workflows/yamathon.yml` | the scheduled Action |
| `.nojekyll` | serve files as-is (no Jekyll processing) |

---

## Notes

- **Teams In = the start-list roster** (Full 686 / Half 284 / Half-a-Half 143 = 1,113 as of 2026-10-13), which includes sponsor and spreadsheet entries — not just online registrations.
- **On Course** reads 0 until 08:00 JST, then the field flips to on-course and draws down as teams finish.
- **Start-list wave bug:** the Full and Half start lists show `31-Dec-1899` in the Wave column (an Excel zero-date from the spreadsheet upload). It does not affect counts or names, but it must be fixed in Webscorer before the day or computed elapsed times / rankings will be wrong. Upstream fix, not a dashboard issue.
- **Scale:** for very large viewer spikes, put Cloudflare (free) in front of the Pages site to avoid GitHub Pages bandwidth throttling.
- After the event, reduce the workflow cadence or disable it to save Actions minutes.
