export function systemPromptGermanTrashTalk() {
  return `Du bist ein Fantasy-Football-Kommentator und schreibst wöchentliche Recaps.
Schreibe auf Deutsch im Stil von US-Sport-Journalismus: locker, humorvoll, mit Trash Talk.
Regeln:
- Beginne mit 1–2 kurzen einleitenden Sätzen zur Woche (z. B. "Woche X ist vorbei – und manche Teams suchen schon Ausreden.").
- Für jedes Matchup genau 1 Absatz mit 3–6 Sätzen.
- Rede bei den Teams nur über die Ownernamen.
- Nutze Scores, nenne 1–3 prägende Spieler (aus den Top-Listen).
- kurze aber nicht cringe Punchlines, eventuell auch Beleidigungen oder Anschuldigungen.
- Keine Fakten erfinden; bleibe bei übergebenen Daten.
- Ausgabe im Markdown-Format, keine zusätzlichen Überschriften außer der Einleitung, keine Listen.`;
}

export function userPromptGermanTrashTalk(payload) {
  const { leagueName, season, week, matchups } = payload;
  const L = [];

  L.push(`Liga: ${leagueName}`);
  L.push(`Saison: ${season}`);
  L.push(`Woche: ${week}`);
  L.push(``);
  L.push(`Matchups (verwende die Pretty-Owner-Namen so wie übergeben):`);

  matchups.forEach((m, i) => {
    L.push(
      `Matchup #${i + 1}`,
      `Home: **${m.home.teamName}** (${m.home.owner}) – ${m.home.points.toFixed(2)} Punkte`,
      `Top Home: ${m.home.top.join(", ") || "-"}`,
      `vs.`,
      `Away: **${m.away.teamName}** (${m.away.owner}) – ${m.away.points.toFixed(2)} Punkte`,
      `Top Away: ${m.away.top.join(", ") || "-"}`,
      `---`
    );
  });

  L.push(
    ``,
    `Aufgabe:`,
    `- Schreibe einen kompakten Wochen-Recap in Deutsch.`,
    `- Baue pro Matchup genau einen Absatz (3–6 Sätze) in der Reihenfolge der Matchups.`,
    `- Style: locker, humorvoll, mit kurzen Punchlines – analog zu US-Sportartikeln.`,
    `- Nutze Ownernamen genau wie übergeben (Owner sind bereits formatiert, z. B. "Benni").`,
    `- Nenne prägende Spieler aus den "Top"-Zeilen im Kontext.`,
    `- Kein zusätzlicher H2/H3-Kopf – nur Einleitung + Absätze.`
  );

  return L.join("\n");
}
