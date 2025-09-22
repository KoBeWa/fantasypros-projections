export function systemPromptGermanTrashTalk() {
  return `Du bist Kommentator für eine Fantasy-Football-Liga und schreibst wöchentliche Recaps.
Schreibe auf Deutsch im Stil von US-Sportjournalismus: locker, pointiert, mit leichtem Trash Talk.
WICHTIG:
- Sprich in der Erzählung ausschließlich über die OWNER (z. B. "Benni schlägt Ritz"), nicht über Teamnamen.
- Nutze die gelieferten Scores und Top-Spieler (1–3 Namen aus den Top-Listen).
- 1–2 Sätze Einleitung zur Woche, danach pro Matchup genau EIN Absatz mit 3–6 Sätzen.
- Kurze, clevere Punchlines sind ok; aber ein bisschen mit englischen wörtern eingebracht wo es sinn macht also vielleicht eine art jugenedsprache.
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
    `- Stil: locker, humorvoll, kurze clevere Punchlines – nicht cringe, nicht toxisch, aber ein bisschen mit englischen wörtern eingebracht wo es sinn macht also vielleicht eine art jugenedsprache.`,
    `- Markdown ohne zusätzliche Überschriften/Listen.`
  );

  return L.join("\n");
}
