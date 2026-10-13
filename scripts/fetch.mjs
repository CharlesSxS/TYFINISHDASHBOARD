/* ============================================================
   TOKYO YAMATHON 2026 — FINISH LINE DASHBOARD  ·  data fetcher
   (c) 2026 SxS Partners. All rights reserved.
   Proprietary software developed by SxS Partners.

   Runs inside the GitHub Action. Calls the Webscorer JSON API with the
   PRO token (from repo Secrets), and writes two static files the dashboard
   reads:
     data/counts.json   — Teams In per course (from the START LISTS, which
                          include sponsor + spreadsheet teams)
     data/results.json  — finishers + retired per course (from the posted
                          RESULTS races, once their ids are set in config.json)

   The token NEVER appears in these output files or in the browser.
   ============================================================ */
import { writeFile, readFile } from "node:fs/promises";

const APIID = process.env.WEBSCORER_APIID;
const TOKEN = process.env.WEBSCORER_TOKEN;
const UA = "Mozilla/5.0 (compatible; SxS-Yamathon-Dashboard/1.0)";
const ORDER = ["full", "half", "quarter"];

if (!APIID || !TOKEN) {
  console.error("Missing WEBSCORER_APIID or WEBSCORER_TOKEN (set them in repo Secrets).");
  process.exit(1);
}

const cfgURL  = new URL("../config.json", import.meta.url);
const countsU = new URL("../data/counts.json", import.meta.url);
const resU    = new URL("../data/results.json", import.meta.url);
const cfg = JSON.parse(await readFile(cfgURL, "utf8"));

/* ---- helpers ---- */
const isDNF = t => /^(dnf|dns|dq)$/i.test(String(t || "").trim());
function timeToSec(t) {
  if (!t || isDNF(t)) return Number.MAX_SAFE_INTEGER;
  const p = String(t).trim().split(":").map(Number);
  if (p.some(isNaN)) return Number.MAX_SAFE_INTEGER;
  return p.reduce((a, v) => a * 60 + v, 0);
}
const teamName = r => r.Name || r["Team name"] || r.TeamName || "";

async function ws(path) {
  const url = `https://www.webscorer.com${path}` +
    `&apiid=${encodeURIComponent(APIID)}&apipriv=${encodeURIComponent(TOKEN)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error("Webscorer returned non-JSON (check raceid / PRO Results subscription)."); }
  if (data && data.Error) throw new Error(String(data.Error));
  return data;
}

/* ---- counts: one start list per course, count the roster ---- */
async function buildCounts() {
  const counts = { full: 0, half: 0, quarter: 0 };
  for (const k of ORDER) {
    const id = cfg.startLists && cfg.startLists[k];
    if (!id) continue;
    try {
      const data = await ws(`/json/startlist?raceid=${encodeURIComponent(id)}`);
      const list = data.StartList || data.Racers || [];
      counts[k] = Array.isArray(list) && list.length
        ? list.length
        : Number((data.RaceInfo && data.RaceInfo.Racers) || 0);
    } catch (e) {
      console.error(`counts ${k} (${id}) failed: ${e.message}`);
      throw e; // let caller keep the last-good file
    }
  }
  counts.total = counts.full + counts.half + counts.quarter;
  counts.updated = new Date().toISOString();
  return counts;
}

/* ---- results: one results race per course, finishers + DNF ---- */
async function buildResults() {
  const legs = { full: [], half: [], quarter: [] };
  const retired = { full: 0, half: 0, quarter: 0 };
  let raceStart = null, anyConfigured = false;

  for (const k of ORDER) {
    const id = cfg.results && cfg.results[k];
    if (!id) continue;            // not posted yet
    anyConfigured = true;
    try {
      const data = await ws(`/json/race?raceid=${encodeURIComponent(id)}`);
      const ri = data.RaceInfo || {};
      const sraw = ri.StartTime || ri.StartDate || ri.Date || null;
      if (!raceStart && sraw) { const d = new Date(sraw); if (!isNaN(d.getTime())) raceStart = d.toISOString(); }
      const groups = (data.Results && data.Results.length) ? data.Results : [{ Racers: data.Racers || [] }];
      for (const g of groups) for (const r of (g.Racers || [])) {
        if (!r) continue;
        if (isDNF(r.Time)) { retired[k]++; continue; }
        if (!r.Time) continue;          // still on course
        legs[k].push({ place: r.Place || "", team: teamName(r), time: r.Time });
      }
    } catch (e) {
      console.error(`results ${k} (${id}) failed: ${e.message}`);
      // keep whatever this course already has; don't abort the others
    }
  }
  for (const k of ORDER) {
    const seen = new Set();
    legs[k] = legs[k].filter(x => {
      const key = (x.team + "|" + x.time).toLowerCase();
      if (seen.has(key)) return false; seen.add(key); return true;
    }).sort((a, b) => timeToSec(a.time) - timeToSec(b.time));
  }
  return { updated: new Date().toISOString(), raceStart, legs, retired, _configured: anyConfigured };
}

/* ---- run: each output independent; a failure keeps the last good file ---- */
let fail = false;

try {
  const counts = await buildCounts();
  await writeFile(countsU, JSON.stringify(counts, null, 2));
  console.log("counts:", JSON.stringify({ full: counts.full, half: counts.half, quarter: counts.quarter, total: counts.total }));
} catch (e) {
  console.error("counts: kept last-good file —", e.message);
  fail = true;
}

try {
  const results = await buildResults();
  if (!results._configured) {
    console.log("results: no result raceids set in config.json yet — leaving the current file as-is.");
  } else {
    delete results._configured;
    await writeFile(resU, JSON.stringify(results, null, 2));
    console.log("results:", ORDER.map(k => `${k}:${results.legs[k].length}`).join(" "),
                "retired", JSON.stringify(results.retired));
  }
} catch (e) {
  console.error("results: kept last-good file —", e.message);
  fail = true;
}

// Non-zero only if BOTH failed outright, so a partial run still commits good data.
process.exit(0);
