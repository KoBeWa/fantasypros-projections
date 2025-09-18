# tools/fetch_headshots_once.py
import os, json, re, pathlib, requests, pandas as pd
from unidecode import unidecode

DATA_DIR = pathlib.Path("data/2025/week_current")  # ggf. Jahr/Woche anpassen
OUT_DIR  = pathlib.Path("assets/players")
OUT_DIR.mkdir(parents=True, exist_ok=True)

POS_FILES = {
    "QB": DATA_DIR/"qb.csv",
    "RB": DATA_DIR/"rb.csv",
    "WR": DATA_DIR/"wr.csv",
    "TE": DATA_DIR/"te.csv",
    "K":  DATA_DIR/"k.csv",
    "DST":DATA_DIR/"dst.csv",
}

print("[INFO] Lade Sleeper-Spielerliste …")
players_json = requests.get("https://api.sleeper.app/v1/players/nfl", timeout=60).json()

def norm(s: str) -> str:
    s = unidecode(s or "").lower().strip()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"\s+", " ", s)
    return s

index_full = {}
index_lastfirst = {}
for pid, p in players_json.items():
    fn = p.get("full_name") or ""
    first = p.get("first_name") or ""
    last = p.get("last_name") or ""
    if fn:
        index_full.setdefault(norm(fn), []).append(pid)
    if first or last:
        index_lastfirst.setdefault(norm(f"{first} {last}"), []).append(pid)

def guess_pid(player_name: str):
    hits = index_full.get(norm(player_name))
    if hits: return hits[0]
    hits = index_lastfirst.get(norm(player_name))
    if hits: return hits[0]
    cleaned = re.sub(r"\b(jr|sr|ii|iii|iv)\b\.?", "", player_name, flags=re.I).strip()
    if cleaned != player_name:
        return guess_pid(cleaned)
    return None

def top50_from_csv(path: pathlib.Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    fcol = "FPTS"
    if fcol not in df.columns:
        cand = [c for c in df.columns if str(c).upper().startswith("FPTS")]
        if cand: fcol = cand[0]
    if fcol in df.columns:
        df = df.sort_values(fcol, ascending=False)
    return df.head(50)

def try_download(url: str, dest: pathlib.Path) -> bool:
    r = requests.get(url, timeout=30)
    if r.status_code == 200 and r.content:
        dest.parent.mkdir(parents=True, exist_ok=True)
        with open(dest, "wb") as f:
            f.write(r.content)
        return True
    return False

for pos, csv_path in POS_FILES.items():
    if not csv_path.exists():
        print(f"[WARN] CSV fehlt: {csv_path}")
        continue
    print(f"[INFO] {pos}: lese {csv_path.name}")
    df = top50_from_csv(csv_path)
    for _, row in df.iterrows():
        name = row.get("player_name") or row.get("Player") or ""
        if not isinstance(name, str) or not name.strip():
            continue
        pid = guess_pid(name)
        if not pid and pos == "DST":
            t = row.get("team")
            if isinstance(t, str) and t:
                pid = guess_pid(t)
        if not pid:
            print(f"[MISS] {pos}  {name}  -> keine Sleeper-ID gefunden")
            continue

        out_jpg = OUT_DIR/pos/ f"{pid}.jpg"
        if out_jpg.exists():
            continue

        url_jpg = f"https://sleepercdn.com/content/nfl/players/{pid}.jpg"
        url_png = f"https://sleepercdn.com/content/nfl/players/{pid}.png"
        ok = try_download(url_jpg, out_jpg)
        if not ok:
            ok = try_download(url_png, out_jpg.with_suffix(".png"))
        if ok:
            print(f"[OK ] {pos}  {name}  ->  {pid}")
        else:
            print(f"[FAIL] {pos}  {name}  ->  {pid} (kein Bild gefunden)")

