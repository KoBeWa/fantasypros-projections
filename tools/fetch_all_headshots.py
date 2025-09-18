# tools/fetch_all_headshots.py
"""
Zieht Headshots für ALLE Spieler von Sleeper (QB/RB/WR/TE/K).
- Lädt https://api.sleeper.app/v1/players/nfl
- Filtert nach Positionen (QB, RB, WR, TE, K)
- Speichert pro Position unter assets/players/<POS>/<player_id>.jpg|.png
- Überspringt bereits vorhandene Dateien
- Schreibt eine kurze Zusammenfassung am Ende
Hinweis zu DST/DEF siehe Kommentar unten.
"""
import pathlib, requests, time, concurrent.futures as cf

# Welche Positionen ziehen?
POSITIONS = {"QB", "RB", "WR", "TE", "K"}

# Zielordner
BASE_OUT = pathlib.Path("assets/players")
BASE_OUT.mkdir(parents=True, exist_ok=True)

# Höfliche, knappe Pause zwischen Requests (bei vielen Downloads wichtig)
PAUSE_SECONDS = 0.02  # 20ms

def load_all_players():
    url = "https://api.sleeper.app/v1/players/nfl"
    r = requests.get(url, timeout=120)
    r.raise_for_status()
    return r.json()  # dict: player_id -> player_dict

def wanted(player):
    """Filter: nur gewünschte Positionen, ignoriere 'DEF/DST' hier (siehe unten)."""
    pos = player.get("position")
    if not pos:
        # manche Einträge haben nur 'fantasy_positions'
        fps = player.get("fantasy_positions") or []
        pos = fps[0] if fps else None
    return pos in POSITIONS

def build_urls(player_id: str):
    base = f"https://sleepercdn.com/content/nfl/players/{player_id}"
    return [f"{base}.jpg", f"{base}.png"]

def download_one(args):
    pos, player_id = args
    out_dir = BASE_OUT / pos
    out_dir.mkdir(parents=True, exist_ok=True)

    out_jpg = out_dir / f"{player_id}.jpg"
    out_png = out_dir / f"{player_id}.png"

    # schon vorhanden?
    if out_jpg.exists() or out_png.exists():
        return ("skip", pos, player_id)

    # nacheinander versuchen
    for url, dest in [(f"https://sleepercdn.com/content/nfl/players/{player_id}.jpg", out_jpg),
                      (f"https://sleepercdn.com/content/nfl/players/{player_id}.png", out_png)]:
        try:
            resp = requests.get(url, timeout=30)
            if resp.status_code == 200 and resp.content:
                with open(dest, "wb") as f:
                    f.write(resp.content)
                time.sleep(PAUSE_SECONDS)
                return ("ok", pos, player_id)
        except requests.RequestException:
            pass
    time.sleep(PAUSE_SECONDS)
    return ("miss", pos, player_id)

def main():
    print("[INFO] Lade komplette Sleeper-Spielerliste …")
    players = load_all_players()

    tasks = []
    for pid, p in players.items():
        # robuste Positionsbestimmung
        pos = p.get("position")
        if not pos:
            fps = p.get("fantasy_positions") or []
            pos = fps[0] if fps else None
        if pos in POSITIONS:
            tasks.append((pos, str(pid)))

    print(f"[INFO] Zu verarbeitende Spieler: {len(tasks)} (Positionen: {sorted(POSITIONS)})")

    # moderat parallel (Runner ist flott, aber wir bleiben freundlich)
    ok = miss = skip = 0
    with cf.ThreadPoolExecutor(max_workers=16) as ex:
        for status, pos, pid in ex.map(download_one, tasks):
            if status == "ok":
                ok += 1
                if ok % 250 == 0:
                    print(f"[OK] bisher: {ok} gespeichert …")
            elif status == "skip":
                skip += 1
            else:
                miss += 1

    print("\n[SUMMARY]")
    print(f"Neu gespeichert: {ok}")
    print(f"Bereits vorhanden (übersprungen): {skip}")
    print(f"Nicht gefunden / fehlgeschlagen: {miss}")

    print("\nHinweis zu DST/DEF:")
    print("- Team-Defenses haben in der Regel KEINE individuellen Headshots.")
    print("- Wenn du für DST Logos möchtest, kann ich dir einen separaten Logo-Downloader bauen (andere CDN-Pfade).")

if __name__ == "__main__":
    main()
