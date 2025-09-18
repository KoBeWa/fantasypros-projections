# tools/fetch_headshots_once.py
import os, json, re, pathlib, requests, pandas as pd
from collections import Counter
from unidecode import unidecode

# === Einstellungen ============================================================
# Passe Jahr/Woche an, falls du NICHT "week_current" verwenden willst
DATA_DIR = pathlib.Path("data/2025/week_current")
POS_FILES = {
    "QB": DATA_DIR/"qb.csv",
    "RB": DATA_DIR/"rb.csv",
    "WR": DATA_DIR/"wr.csv",
    "TE": DATA_DIR/"te.csv",
    "K":  DATA_DIR/"k.csv",
    "DST":DATA_DIR/"dst.csv",
}
OUT_DIR  = pathlib.Path("assets/players")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# === Hilfsfunktionen: Normalisierung =========================================
def norm_text(s: str) -> str:
    """kleinschreiben, Akzente & Sonderzeichen raus, Whitespace trimmen"""
    s = unidecode(s or "").lower().strip()
    s = re.sub(r"\s+", " ", s)
    return s

def norm_col(c) -> str:
    """Spaltennamen robust normalisieren (egal ob Tuple-String etc.)."""
    c = str(c)
    # Klammern, Quotes, Kommata, Doppelleerzeichen entfernen
    c = c.replace('"', "'")
    c = re.sub(r"[\(\)]", " ", c)
    c = c.replace(",", " ")
    c = re.sub(r"\s+", " ", c)
    return norm_text(c)

TEAM_SUFFIX_RE = re.compile(r"\s+\(?([A-Z]{2,3})\)?$")  # " BUF" oder "(BUF)" am Ende

def extract_clean_player_name(row, player_col: str) -> str:
    """
    Holt einen sauberen Spielernamen aus der CSV-Zeile:
    - nimmt die erkannte Player-Spalte
    - entfernt Team-Suffix am Ende (BUF / (BUF))
    """
    raw = row.get(player_col)
    if not isinstance(raw, str) or not raw.strip():
        return ""
    name = TEAM_SUFFIX_RE.sub("", raw.strip())
    name = re.sub(r"\s+", " ", name).strip()
    return name

# === Sleeper Index aufbauen ===================================================
print("[INFO] Lade Sleeper-Spielerliste …")
players_json = requests.get("https://api.sleeper.app/v1/players/nfl", timeout=60).json()

index_full = {}
index_lastfirst = {}
for pid, p in players_json.items():
    fn = p.get("full_name") or ""
    first = p.get("first_name") or ""
    last = p.get("last_name") or ""
    if fn:
        index_full.setdefault(norm_text(fn), []).append(pid)
    if first or last:
        index_lastfirst.setdefault(norm_text(f"{first} {last}"), []).append(pid)

def guess_pid(player_name: str):
    name_n = norm_text(player_name)
    hits = index_full.get(name_n)
    if hits: return hits[0]
    hits = index_lastfirst.get(name_n)
    if hits: return hits[0]
    # Suffixe entfernen (Jr., Sr., II, III, IV) und erneut probieren
    cleaned = re.sub(r"\b(jr|sr|ii|iii|iv)\b\.?", "", player_name, flags=re.I).strip()
    if cleaned != player_name:
        return guess_pid(cleaned)
    return None

# === CSV lesen: Spalten automatisch erkennen =================================
def read_csv_and_detect_columns(path: pathlib.Path):
    """
    Liest die CSV und gibt zurück:
    - df: DataFrame
    - player_col: tatsächlicher Spaltenname für "Player/Defense (DST)"
    - fpts_col: tatsächlicher Spaltenname für FPTS
    """
    df = pd.read_csv(path)

    # Karte: normalisierte Spalten -> originale Spaltennamen
    col_map = {norm_col(c): c for c in df.columns}

    # Player-Spalte finden
    player_col = None
    # Kandidaten nach Priorität
    player_candidates = [
        "player",                        # normaler Name
        "unnamed: 0_level_0 player",     # dein Multi-Index-Fall als String
        "defense dst",                   # DST Headline
        "defense (dst)",                 # falls Klammern erhalten blieben
    ]
    for cand in player_candidates:
        if cand in col_map:
            player_col = col_map[cand]
            break
    # Fallback: nimm die erste Spalte, die "player" enthält
    if player_col is None:
        for nc, oc in col_map.items():
            if "player" in nc:
                player_col = oc
                break
    if player_col is None:
        raise RuntimeError("Konnte keine Player-Spalte erkennen.")

    # FPTS-Spalte finden (enthält 'fpts')
    fpts_col = None
    for nc, oc in col_map.items():
        if "fpts" in nc:
            fpts_col = oc
            break
    if fpts_col is None:
        raise RuntimeError("Konnte keine FPTS-Spalte erkennen.")

    return df, player_col, fpts_col

def top50_from_csv(path: pathlib.Path) -> tuple[pd.DataFrame, str]:
    df, player_col, fpts_col = read_csv_and_detect_columns(path)
    # nach FPTS sortieren, Top-50
    try:
        df = df.sort_values(fpts_col, ascending=False)
    except Exception:
        # falls FPTS als Text – in Zahl konvertieren
        df[fpts_col] = pd.to_numeric(df[fpts_col], errors="coerce")
        df = df.sort_values(fpts_col, ascending=False)
    return df.head(50), player_col

def try_download(url: str, dest: pathlib.Path) -> bool:
    r = requests.get(url, timeout=30)
    if r.status_code == 200 and r.content:
        dest.parent.mkdir(parents=True, exist_ok=True)
        with open(dest, "wb") as f:
            f.write(r.content)
        return True
    return False

# === Hauptlogik: je Position Top-50 matchen & Bild holen =====================
stats = Counter()

for pos, csv_path in POS_FILES.items():
    if not csv_path.exists():
        print(f"[WARN] CSV fehlt: {csv_path}")
        continue

    print(f"[INFO] {pos}: lese {csv_path.name}")
    df, player_col = None, None
    try:
        df, player_col = top50_from_csv(csv_path)
    except Exception as e:
        print(f"[ERR ] {pos}: konnte CSV nicht verarbeiten -> {e}")
        continue

    for _, row in df.iterrows():
        name = extract_clean_player_name(row, player_col)
        if not name:
            continue
        stats[f"seen_{pos}"] += 1

        pid = guess_pid(name)
        if not pid and pos == "DST":
            # Bei DST optional: Team probieren
            t = row.get("team")
            if isinstance(t, str) and t:
                pid = guess_pid(t)

        if not pid:
            print(f"[MISS] {pos:<3}  {name}  -> keine Sleeper-ID gefunden")
            stats[f"miss_{pos}"] += 1
            continue

        # schon vorhanden? dann überspringen
        out_jpg = OUT_DIR/pos/ f"{pid}.jpg"
        out_png = out_jpg.with_suffix(".png")
        if out_jpg.exists() or out_png.exists():
            continue

        # Sleeper-CDN: erst .jpg, dann .png probieren
        url_jpg = f"https://sleepercdn.com/content/nfl/players/{pid}.jpg"
        url_png = f"https://sleepercdn.com/content/nfl/players/{pid}.png"
        ok = try_download(url_jpg, out_jpg)
        if not ok:
            ok = try_download(url_png, out_png)
        if ok:
            print(f"[OK ] {pos:<3}  {name}  ->  {pid}")
        else:
            print(f"[FAIL] {pos:<3}  {name}  ->  {pid} (kein Bild gefunden)")
            stats[f"miss_{pos}"] += 1

# === Zusammenfassung =========================================================
print("\n[SUMMARY]")
for pos in POS_FILES.keys():
    seen = stats.get(f"seen_{pos}", 0)
    miss = stats.get(f"miss_{pos}", 0)
    print(f"{pos}: gesehen={seen}, verfehlt={miss}, Treffer={seen - miss}")

print("\nFertig.")
