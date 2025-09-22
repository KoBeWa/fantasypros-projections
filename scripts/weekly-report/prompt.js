export function systemPrompt(tone = "witzig", language = "de") {
  const style = tone === "trash"
    ? "Frech, locker, kurze Punchlines, aufschlussreich, aber nicht beleidigend. Deutsch mit sporttypischem Slang."
    : tone === "witzig"
      ? "Locker, humorvoll, kurze Sätze, sportjournalistisch."
      : "Sachlich-knapp, sportjournalistisch.";
  const lang = language === "de" ? "Deutsch" : "English";

  return `Du bist ein Sport-Redakteur für Fantasy Football Weekly Reports.
Schreibe in ${lang}. Stil: ${style}
Nutze die gelieferten Matchup-Daten (Teams, Punkte, Top/Flop-Spieler, Bench-Highlights, knappe Spiele, Highest/Lowest Score, Streaks).
Regeln:

Nenne Sieger/Verlierer korrekt, keine Halluzinationen.

1–2 knackige Overreactions/Trash-Talk-Einwürfe, aber nicht beleidigend.

Keine erfundenen Stats; verwende nur übergebene Zahlen/Namen.

Schreibe in natürlichem, lockeren Ton; keine Listen – ein flüssiger Textabsatz.“`;
}

export function userPrompt(payload) {
  const { leagueName, season, week, matchups } = payload;
  const lines = [
    `Liga: ${leagueName}`,
    `Season: ${season}`,
    `Woche: ${week}`,
    ``,
    `Matchups:`
  ];
  matchups.forEach((m, i) => {
    lines.push(
      `#${i + 1}`,
      `Home: ${m.home.teamName} (${m.home.owner}) – ${m.home.points.toFixed(2)} Pts`,
      `Top: ${m.home.top.join(", ") || "-"}`,
      `Away: ${m.away.teamName} (${m.away.owner}) – ${m.away.points.toFixed(2)} Pts`,
      `Top: ${m.away.top.join(", ") || "-"}`,
      `Starters(Home): ${m.home.starters.join(", ") || "-"}`,
      `Starters(Away): ${m.away.starters.join(", ") || "-"}`,
      `---`
    );
  });
  lines.push(
    ``,
    `Aufgabe: Erstelle einen Weekly-Report-Textblock im Markdown-Format.`,
    `Struktur:`,
    `- H1: "Week ${week} – Weekly Report"`,
    `- Danach pro Matchup:`,
    `  - H2: "Matchup #N – Home vs Away (Score)"`,
    `  - H3: Kurze Headline`,
    `  - 1 Absatz (3–6 Sätze)`,
    `- Am Ende: 3 Bullet Points "Notable Performances" (ligaweit) basierend auf den Top-Spielern`
  );
  return lines.join("\n");
}
