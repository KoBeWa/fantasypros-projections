import { OpenAI } from "openai";
import fs from "fs/promises";
import {
  getLeague,
  getMatchups,
  getNflState,
  getRosters,
  getUsers,
  getPlayersMap
} from "./sleeper.js";
import {
  systemPromptGermanTrashTalk,
  userPromptGermanTrashTalk
} from "./prompt.js";

/** ====== ENV + UTIL ====== */
function ensureEnv() {
  const { OPENAI_API_KEY, SLEEPER_LEAGUE_ID, WEEK, LANGUAGE, TONE, OUTPUT_DIR, OPENAI_MODEL } = process.env;
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is missing");
  if (!SLEEPER_LEAGUE_ID) throw new Error("SLEEPER_LEAGUE_ID is missing");
  return { OPENAI_API_KEY, SLEEPER_LEAGUE_ID, WEEK, LANGUAGE, TONE, OUTPUT_DIR, OPENAI_MODEL };
}

function rosterOwnerMap(users, rosters) {
  const userById = new Map();
  users.forEach(u => userById.set(u.user_id, u)); // u.display_name, u.username

  const infoByRoster = new Map();
  rosters.forEach(r => {
    const u = userById.get(r.owner_id);
    infoByRoster.set(r.roster_id, {
      displayName: u?.display_name ?? "Unknown",
      username: u?.username ?? ""
    });
  });
  return infoByRoster;
}


function groupMatchups(raw) {
  const byId = new Map();
  raw.forEach(m => {
    const id = m.matchup_id;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(m);
  });
  return [...byId.values()];
}

/** ====== OWNER-MAPPING ====== */
// Teamname (metadata.team_name) → Pretty Owner Name
const OWNER_NAME_MAP = {
  "Dreggsverein": "Benni",
  "Talahon United": "Simi",
  "Snatchville Lubricators": "Kessi",
  "Extrem durstige Welse": "Ritz",
  "oG United": "Erik",
  "I_hate_Kowa": "Tommy",
  "Suckme Mourdock Network": "Marv",
  "Juschka": "Juschi"
};

// Alles lowercase! (wir normalisieren Vergleichswerte ebenfalls)
const OWNER_ALIAS_LOWER = {
  // Deine "schönen" Teamnamen
  "dreggsverein": "Benni",
  "talahon united": "Simi",
  "snatchville lubricators": "Kessi",
  "extrem durstige welse": "Ritz",
  "og united": "Erik",
  "oG united": "Erik",   // falls mal gemischt geschrieben
  "i_hate_kowa": "Tommy",
  "suckme mourdock network": "Marv",
  "juschka": "Juschi",

  // Deine realen aktuellen Sleeper-Namen/Usernames (aus deinem Beispiel)
  "shamh": "Benni",
  "kesso": "Kessi",
  "lossausages": "Ritz",
  "simon2307": "Simi",
  "jottage": "Erik",
  "thebiglebronski": "Tommy",
  "lancemourdock": "Marv"
};

function prettyOwnerName({ teamName, displayName, username }) {
  const cand = [
    String(teamName || "").toLowerCase().trim(),
    String(displayName || "").toLowerCase().trim(),
    String(username || "").toLowerCase().trim()
  ].filter(Boolean);

  for (const key of cand) {
    if (OWNER_ALIAS_LOWER[key]) return OWNER_ALIAS_LOWER[key];
  }

  // Fallback: DISPLAYNAME in CAPS (besser lesbar als Sleeper-Username)
  if (displayName) return String(displayName).toUpperCase();
  if (username) return String(username).toUpperCase();
  return "UNKNOWN";
}

/** ====== Spieler-/Lineup-Helfer ====== */
function startersNames(s, map = {}) {
  return (s || []).map(pid => map[String(pid)] || String(pid));
}

function topPlayers(m, playersById = {}) {
  if (!m?.players_points || typeof m.players_points !== "object") return [];
  const entries = Object.entries(m.players_points);
  entries.sort((a, b) => Number(b[1]) - Number(a[1]));
  return entries.slice(0, 3).map(([pid, pts]) => {
    const name = playersById[String(pid)] || String(pid);
    return `${name} (${Number(pts).toFixed(1)})`;
  });
}

/** ====== MAIN ====== */
async function main() {
  const env = ensureEnv();
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const model = env.OPENAI_MODEL || "gpt-4o-mini";
  const outDir = env.OUTPUT_DIR || "reports";

  // Sleeper-Basisdaten
  const state = await getNflState();
  const targetWeek = Number(env.WEEK ?? state.week);
  const league = await getLeague(env.SLEEPER_LEAGUE_ID);
  const users = await getUsers(env.SLEEPER_LEAGUE_ID);
  const rosters = await getRosters(env.SLEEPER_LEAGUE_ID);
  const ownerMap = rosterOwnerMap(users, rosters);
  const matchupsRaw = await getMatchups(env.SLEEPER_LEAGUE_ID, targetWeek);

  // Spieler-Map defensiv laden
  let playersById = {};
  try {
    playersById = await getPlayersMap();
  } catch (e) {
    console.error("⚠️ Konnte players map nicht laden – nutze IDs als Fallback:", e?.message || e);
    playersById = {};
  }

  const grouped = groupMatchups(matchupsRaw);
  console.log("Matchups für Woche", targetWeek, "→", grouped.length, "Pairings");

  const matchupPayload = grouped.map(group => {
    const [aRaw, bRaw] = group;
    // Home/away Heuristik nach roster_id, aber robust bei fehlendem b
    const home = (!bRaw || (aRaw?.roster_id ?? 0) <= (bRaw?.roster_id ?? 999999)) ? aRaw : bRaw;
    const away = home === aRaw ? bRaw : aRaw;

    const homeTeamName = home?.metadata?.team_name || `Team ${home?.roster_id ?? "?"}`;
    const awayTeamName = away?.metadata?.team_name || (away ? `Team ${away.roster_id}` : "BYE / n/a");

    const homeDisplay = ownerMap.get(home?.roster_id)?.displayName ?? "Unknown";
    const awayDisplay = away ? (ownerMap.get(away.roster_id)?.displayName ?? "Unknown") : "Unknown";

    // WICHTIG: hier dein schönes Mapping benutzen
    const homeOwnerInfo = ownerMap.get(home?.roster_id) || {};
    const awayOwnerInfo = away ? (ownerMap.get(away.roster_id) || {}) : {};
    
    const homeOwner = prettyOwnerName({
      teamName: home?.metadata?.team_name,
      displayName: homeOwnerInfo.displayName,
      username: homeOwnerInfo.username
    });
    const awayOwner = prettyOwnerName({
      teamName: away?.metadata?.team_name,
      displayName: awayOwnerInfo.displayName,
      username: awayOwnerInfo.username
    });
  });

  // Prompts (deutsch, witzig, kein harter Trash)
  const system = systemPromptGermanTrashTalk();
  const user = userPromptGermanTrashTalk({
    leagueName: league?.name ?? "Sleeper League",
    season: state?.season ?? "",
    week: targetWeek,
    matchups: matchupPayload
  });

  // GPT-Aufruf
  let text;
  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    });
    text = completion.choices?.[0]?.message?.content ?? "";
  } catch (err) {
    if (err?.code === "insufficient_quota") {
      console.error("❌ OpenAI quota exhausted. Please check billing/usage.");
      text = `*Hinweis: OpenAI-API-Quota erschöpft.*\n\nMatchups (Rohdaten):\n` + JSON.stringify(matchupPayload, null, 2);
    } else {
      throw err;
    }
  }

  // Markdown-Datei schreiben
  const header = `---
title: "Week ${targetWeek} – Weekly Report"
generated: "${new Date().toISOString()}"
---

`;
  const md = header + (text || "").trim() + "\n";

  await fs.mkdir(outDir, { recursive: true });
  const file = `${outDir}/week-${String(targetWeek).padStart(2, "0")}.md`;
  await fs.writeFile(file, md, "utf8");
  console.log(`✅ Weekly report written: ${file}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

