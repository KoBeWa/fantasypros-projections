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
  const userMap = new Map();
  users.forEach(u => userMap.set(u.user_id, u));
  const ownerByRoster = new Map();
  rosters.forEach(r => {
    const u = userMap.get(r.owner_id);
    ownerByRoster.set(r.roster_id, { displayName: u?.display_name ?? "Unknown" });
  });
  return ownerByRoster;
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

function prettyOwnerName(teamName, fallbackDisplayName) {
  const key = String(teamName || "").trim();
  if (key && Object.prototype.hasOwnProperty.call(OWNER_NAME_MAP, key)) {
    return OWNER_NAME_MAP[key];
  }
  return (fallbackDisplayName ? String(fallbackDisplayName).toUpperCase() : "UNKNOWN");
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
    const homeOwner = prettyOwnerName(homeTeamName, homeDisplay);
    const awayOwner = prettyOwnerName(awayTeamName, awayDisplay);

    return {
      home: {
        teamName: homeTeamName,
        owner: homeOwner,
        points: Number(home?.points ?? 0),
        starters: startersNames(home?.starters, playersById),
        top: topPlayers(home, playersById)
      },
      away: {
        teamName: awayTeamName,
        owner: awayOwner,
        points: Number(away?.points ?? 0),
        starters: startersNames(away?.starters, playersById),
        top: topPlayers(away, playersById)
      }
    };
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

