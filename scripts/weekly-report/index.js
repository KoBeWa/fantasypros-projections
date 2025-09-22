import { OpenAI } from "openai";
import fs from "fs/promises";
import {
  getLeague, getMatchups, getNflState, getRosters, getUsers
} from "./sleeper.js";
import { systemPrompt, userPrompt } from "./prompt.js";
import { wrapAsMarkdown } from "./markdown.js";

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

function groupMatchups(raw) {
  const byId = new Map();
  raw.forEach(m => {
    const id = m.matchup_id;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(m);
  });
  return [...byId.values()];
}

function topPlayers(m) {
  if (!m?.players_points) return [];
  const entries = Object.entries(m.players_points);
  entries.sort((a,b)=>b[1]-a[1]);
  return entries.slice(0,3).map(([pid, pts]) => `${pid} (${Number(pts).toFixed(1)})`);
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

  const grouped = groupMatchups(matchupsRaw);

  const matchupPayload = grouped.map(group => {
    const [a,b] = group;
    const home = (a.roster_id ?? 0) <= (b?.roster_id ?? 999) ? a : b;
    const away = home === a ? b : a;

    const homeOwner = ownerMap.get(home.roster_id)?.displayName ?? "Unknown";
    const awayOwner = ownerMap.get(away.roster_id)?.displayName ?? "Unknown";

    const startersNames = s => (s || []).map(pid => pid); // optional: später echte Namen mappen
    return {
      home: {
        teamName: home.metadata?.team_name || `Team ${home.roster_id}`,
        owner: homeOwner,
        points: Number(home.points ?? 0),
        starters: startersNames(home.starters),
        top: topPlayers(home)
      },
      away: {
        teamName: away?.metadata?.team_name || `Team ${away?.roster_id}`,
        owner: awayOwner,
        points: Number(away?.points ?? 0),
        starters: startersNames(away?.starters),
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

  const completion = await client.chat.completions.create({
    model: "gpt-5.1-mini",
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
