import fetch from "node-fetch";
const BASE = "https://api.sleeper.app/v1";

export async function getNflState() {
  const res = await fetch(`${BASE}/state/nfl`);
  if (!res.ok) throw new Error(`Sleeper state failed: ${res.status}`);
  return res.json();
}
export async function getLeague(leagueId) {
  const res = await fetch(`${BASE}/league/${leagueId}`);
  if (!res.ok) throw new Error(`Sleeper league failed: ${res.status}`);
  return res.json();
}
export async function getUsers(leagueId) {
  const res = await fetch(`${BASE}/league/${leagueId}/users`);
  if (!res.ok) throw new Error(`Sleeper users failed: ${res.status}`);
  return res.json();
}
export async function getRosters(leagueId) {
  const res = await fetch(`${BASE}/league/${leagueId}/rosters`);
  if (!res.ok) throw new Error(`Sleeper rosters failed: ${res.status}`);
  return res.json();
}
export async function getMatchups(leagueId, week) {
  const res = await fetch(`${BASE}/league/${leagueId}/matchups/${week}`);
  if (!res.ok) throw new Error(`Sleeper matchups failed: ${res.status}`);
  return res.json();
}
export async function getPlayoffBracket(leagueId) {
  const res = await fetch(`${BASE}/league/${leagueId}/winners_bracket`);
  if (!res.ok) return [];
  return res.json();
}
