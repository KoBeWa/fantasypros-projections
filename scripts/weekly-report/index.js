import { OpenAI } from "openai";
import fs from "fs/promises";
import {
  getLeague, getMatchups, getNflState, getRosters, getUsers, getPlayersMap
} from "./sleeper.js";
import { systemPrompt, userPrompt } from "./prompt.js";
import { wrapAsMarkdown } from "./markdown.js";

// Teamname (Sleeper "metadata.team_name") -> Pretty Owner Name
const OWNER_NAME_MAP = {
  "Dreggsverein": "BENNI",
  "Talahon United": "SIMI",
  "Snatchville Lubricators": "KESSI",
  "Extrem durstige Welse": "RITZ",
  "oG United": "ERIK",
  "I_hate_Kowa": "TOMMY",
  "Suckme Mourdock Network": "MARV",
  "Juschka": "JUSCHI"
};

function ensureEnv() {
  const { OPENAI_API_KEY, SLEEPER_LEAGUE_ID, WEEK, LANGUAGE, TONE, OUTPUT_DIR } = process.env;
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is missing");
  if (!SLEEPER_LEAGUE_ID) throw new Error("SLEEPER_LEAGUE_ID is missing");
  return { OPENAI_API_KEY, SLEEPER_LEAGUE_ID, WEEK, LANGUAGE, TONE, OUTPUT_DIR };
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

function prettyOwnerName(teamName, fallbackDisplayName) {
  // Nimm zuerst dein Mapping, sonst den Sleeper-Displayname in Großbuchstaben
  return OWNER_NAME_MAP[teamName] || (fallbackDisplayName ? fallbackDisplayName.toUpperCase() : "UNKNOWN");
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

function topPlayers(m, playersById = {}) {
  if (!m?.players_points || typeof m.players_points !== "object") return [];
  const entries = Object.entries(m.players_points);
  entries.sort((a, b) => Number(b[1]) - Number(a[1]));
  return entries.slice(0, 3).map(([pid, pts]) => {
    const key = String(pid);
    const name = playersById[key] || key; // Fallback auf ID
    return `${name} (${Number(pts).toFixed(1)})`;
  });
}

async function main() {
  const env = ensureEnv();
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const state = await getNflState();
  const targetWeek = Number(env.WEEK ?? state.week);
  const league = await getLeague(env.SLEEPER_LEAGUE_ID);
  const users = await getUsers(env.SLEEPER_LEAGUE_ID);
  const rosters = await getRosters(env.SLEEPER_LEAGUE_ID);
  const ownerMap = rosterOwnerMap(users, rosters);
  const matchupsRaw = await getMatchups(env.SLEEPER_LEAGUE_ID, targetWeek);
  let playersById = {};
  try {
    playersById = await getPlayersMap();
  } catch (e) {
    console.error("⚠️ Konnte players map nicht laden – nutze IDs als Fallback:", e?.message || e);
    playersById = {}; // bleibt leer, damit unten nicht crasht
  }
  const grouped = groupMatchups(matchupsRaw);

  const matchupPayload = grouped.map(group => {
    const [a,b] = group;
    const home = (a.roster_id ?? 0) <= (b?.roster_id ?? 999) ? a : b;
    const away = home === a ? b : a;

    const homeTeamName = home.metadata?.team_name || `Team ${home.roster_id}`;
    const awayTeamName = away?.metadata?.team_name || `Team ${away?.roster_id}`;
    const homeDisplay = ownerMap.get(home.roster_id)?.displayName ?? "Unknown";
    const awayDisplay = ownerMap.get(away.roster_id)?.displayName ?? "Unknown";
    const homeOwner = prettyOwnerName(homeTeamName, homeDisplay);
    const awayOwner = prettyOwnerName(awayTeamName, awayDisplay);
    const startersNames = s => (s || []).map(pid => playersById[pid] || pid);
    return {
      home: {
       teamName: homeTeamName,
        owner: homeOwner,
        points: Number(home.points ?? 0),
        starters: startersNames(home.starters, playersById),
        top: topPlayers(away, playersById)
      },
      away: {
        teamName: away?.metadata?.team_name || `Team ${away?.roster_id}`,
        owner: awayOwner,
        points: Number(away?.points ?? 0),
        starters: startersNames(away?.starters, playersById),
        top: topPlayers(away)
      }
    };
  });

  const sys = systemPrompt(env.TONE ?? "witzig", env.LANGUAGE ?? "de");
  const usr = userPrompt({
    leagueName: league.name ?? "Sleeper League",
    season: state.season,
    week: targetWeek,
    matchups: matchupPayload
  });

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.7,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: usr }
    ]
  });

  const text = completion.choices?.[0]?.message?.content ?? "";
  const md = wrapAsMarkdown(targetWeek, text);

  const outDir = env.OUTPUT_DIR || "reports";
  await fs.mkdir(outDir, { recursive: true });
  const file = `${outDir}/week-${String(targetWeek).padStart(2,"0")}.md`;
  await fs.writeFile(file, md, "utf8");

  console.log(`✅ Weekly report written: ${file}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
