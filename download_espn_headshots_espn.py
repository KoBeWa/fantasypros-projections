#!/usr/bin/env python3
import csv
import io
import os
from pathlib import Path

import requests

# ---------------------------------------------------------
# Einstellungen
# ---------------------------------------------------------

# CSV mit ESPN-Spielern (aus deinem Scrape-Repo)
CSV_URL = "https://raw.githubusercontent.com/KoBeWa/Scrape/master/output/espn_players.csv"

# Name der Spalte, in der die ESPN-Spieler-ID steht
ID_COLUMN = "espn_id"

# Zielordner relativ zum Repo-Root von fantasypros-projections
REPO_ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = REPO_ROOT / "assets" / "players" / "espn"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ESPN-Headshot-URL-Template
HEADSHOT_URL_TEMPLATE = (
    "https://a.espncdn.com/combiner/i"
    "?img=/i/headshots/nfl/players/full/{player_id}.png&w=350&h=254"
)

# ---------------------------------------------------------
# Funktionen
# ---------------------------------------------------------


def detect_delimiter(first_line: str) -> str:
    """
    Ermittelt das Trennzeichen anhand der ersten Zeile.
    Falls ';' vorkommt und ',' nicht, nimm ';', sonst ','.
    """
    if ";" in first_line and "," not in first_line:
        return ";"
    return ","


def download_csv(url: str) -> list[dict]:
    """Lädt die CSV von GitHub und gibt eine Liste von Dict-Zeilen zurück."""
    print(f"Lade CSV von {url} ...")
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()

    text = resp.text
    lines = text.splitlines()
    if not lines:
        raise RuntimeError("CSV scheint leer zu sein.")

    delimiter = detect_delimiter(lines[0])
    print(f"Erkanntes Trennzeichen: '{delimiter}'")
    f = io.StringIO(text)
    reader = csv.DictReader(f, delimiter=delimiter)

    if ID_COLUMN not in reader.fieldnames:
        raise RuntimeError(
            f"Spalte '{ID_COLUMN}' nicht in CSV gefunden. "
            f"Gefundene Spalten: {reader.fieldnames}"
        )

    rows = list(reader)
    print(f"CSV geladen, {len(rows)} Zeilen gefunden.")
    return rows


def download_headshot(player_id: str, session: requests.Session) -> bool:
    """
    Lädt den Headshot für eine gegebene ESPN-Player-ID herunter.
    Gibt True zurück, wenn erfolgreich (oder bereits vorhanden), sonst False.
    """
    filename = OUTPUT_DIR / f"{player_id}.png"

    # Falls Bild schon existiert: überspringen
    if filename.exists():
        print(f"  -> {player_id}.png existiert bereits, überspringe.")
        return True

    url = HEADSHOT_URL_TEMPLATE.format(player_id=player_id)
    try:
        resp = session.get(url, timeout=30)
    except requests.RequestException as e:
        print(f"  !! Fehler bei Request für ID {player_id}: {e}")
        return False

    if resp.status_code != 200:
        print(f"  !! Kein Bild für ID {player_id} (HTTP {resp.status_code})")
        return False

    # Optional: Content-Type check
    content_type = resp.headers.get("Content-Type", "")
    if not content_type.startswith("image"):
        print(
            f"  !! Unerwarteter Content-Type für ID {player_id}: {content_type}"
        )
        return False

    with open(filename, "wb") as f:
        f.write(resp.content)

    print(f"  -> {player_id}.png gespeichert.")
    return True


def main():
    rows = download_csv(CSV_URL)

    # IDs sammeln (Robustheit gegen doppelte IDs / leere Einträge)
    player_ids: set[str] = set()
    for row in rows:
        raw_id = row.get(ID_COLUMN)
        if raw_id is None:
            continue
        player_id = str(raw_id).strip()
        if player_id:
            player_ids.add(player_id)

    print(f"Insgesamt {len(player_ids)} eindeutige ESPN-IDs gefunden.")

    session = requests.Session()

    success = 0
    fail = 0

    for i, player_id in enumerate(sorted(player_ids), start=1):
        print(f"[{i}/{len(player_ids)}] Lade Headshot für ID {player_id} ...")
        if download_headshot(player_id, session):
            success += 1
        else:
            fail += 1

    print("\nFertig.")
    print(f"Erfolgreich: {success}")
    print(f"Fehlgeschlagen: {fail}")
    print(f"Bilder liegen in: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
