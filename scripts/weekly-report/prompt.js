export function systemPromptGermanTrashTalk() {
  return `Du bist Kommentator für eine Fantasy-Football-Liga und schreibst wöchentliche Recaps.
Schreibe auf Deutsch im Stil von US-Sportjournalismus: locker, pointiert, mit leichtem Trash Talk.

wie folgendes beispiel: Suckme Mourdock Network squeaked by I_hate_Kowa 100.52 to 97.28 in a game so close, even Josh Allen’s reckless abandon couldn’t ruin it. Mourdock is 2-0 and atop the league, while Kowa is 0-2 and probably blaming the SF defense for not scoring touchdowns.

Snatchville Lubricators lubed up the scoreboard and left Extrem durstige Welse parched, 111.58 to 76.84. Mahomes and St. Brown did the heavy lifting, while Derrick Henry made a cameo. Welse might want to consider a hydration IV for their running backs.

Dreggsverein dropped 120 on Juschka, proving that Jayden Daniels and Malik Nabers aren’t just for LSU homers. Juschka wasted a solid McCaffrey/Chase effort—maybe next week Mark Andrews will actually show up.

oG United handled Talahon United 91.1 to 79.94 in a battle of “meh.” Lamar Jackson carried the squad while Talahon’s Breece Hall and Brian Thomas ghosted harder than your ex.

Four teams remain undefeated, and four are winless—so the playoff picture is already split like your grandma’s wishbone. Week 3: time for the pretenders to start panicking!

WICHTIG:
- Sprich in der Erzählung ausschließlich über die OWNER (z. B. "Benni schlägt Ritz"), nicht über Teamnamen.
- Nutze die gelieferten Scores und Top-Spieler (1–3 Namen aus den Top-Listen).
- 1–2 Sätze Einleitung zur Woche, danach pro Matchup genau EIN Absatz mit 3–6 Sätzen.
- ein paar Punchlines und Trash Talk.
- Keine Fakten erfinden – bleibe bei den übergebenen Daten.
- Ausgabe im Markdown-Format: Einleitung + Absätze, KEINE zusätzlichen Überschriften oder Listen.`;
}

export function userPromptGermanTrashTalk(payload) {
  const { leagueName = "", season = "", week = "", matchups = [] } = payload || {};
  const L = [];

  L.push(`Liga: ${leagueName}`);
  L.push(`Saison: ${season}`);
  L.push(`Woche: ${week}`);
  L.push(``);
  L.push(
    `Matchups (verwende in der Erzählung NUR die Ownernamen wie übergeben; Teamnamen dienen nur als Kontext):`
  );

  (matchups || []).forEach((m, i) => {
    const h = m?.home || {};
    const a = m?.away || {};

    const homeOwner = h?.owner || "UNKNOWN";
    const awayOwner = a?.owner || "UNKNOWN";

    const homePts = Number.isFinite(h?.points) ? Number(h.points).toFixed(2) : "0.00";
    const awayPts = Number.isFinite(a?.points) ? Number(a.points).toFixed(2) : "0.00";

    const topHome = Array.isArray(h?.top) && h.top.length ? h.top.join(", ") : "-";
    const topAway = Array.isArray(a?.top) && a.top.length ? a.top.join(", ") : "-";

    // Teamnamen bleiben als Kontextzeilen drin, aber der Stil fordert "rede nur über Owner"
    const homeTeamName = h?.teamName || "Team ?";
    const awayTeamName = a?.teamName || "Team ?";

    L.push(
      `Matchup #${i + 1}`,
      `Kontext: ${homeTeamName} (${homeOwner}) vs. ${awayTeamName} (${awayOwner})`,
      `Score: ${homeOwner} ${homePts} – ${awayOwner} ${awayPts}`,
      `Top bei ${homeOwner}: ${topHome}`,
      `Top bei ${awayOwner}: ${topAway}`,
      `---`
    );
  });

  L.push(
    ``,
    `Aufgabe:`,
    `- Schreibe einen kompakten Wochen-Recap auf Deutsch.`,
    `- Einleitung (1–2 Sätze) zur Woche.`,
    `- Danach für jedes Matchup genau EIN Absatz mit 3–6 Sätzen, in der Reihenfolge der Matchups.`,
    `- Rede in der Erzählung NUR über die Owner (z. B. "Benni", "Simi"), nicht über Teamnamen.`,
    `- Baue den Score und 1–3 prägende Spieler pro Matchup (aus den Top-Zeilen) sinnvoll ein.`,
    `- Stil: witzig, trash talky und es soll nicht cringe sein das zu lesen. denke es würden 18-30 jährige lesen`,
    `- Markdown ohne zusätzliche Überschriften/Listen.`
  );

  return L.join("\n");
}
