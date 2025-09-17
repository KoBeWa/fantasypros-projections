#!/usr/bin/env python3
# Dieses Skript lädt die Standard-Projections (Week) von FantasyPros
# für QB, RB, WR, TE, K und DST und speichert sie als CSV.
import argparse, os, sys, pathlib, datetime, re
import pandas as pd
import requests
from bs4 import BeautifulSoup

BASE = "https://www.fantasypros.com/nfl/projections"
POS_PATHS = {
    "qb":  "qb.php",
    "rb":  "rb.php",
    "wr":  "wr.php",
    "te":  "te.php",
    "k":   "k.php",
    "dst": "dst.php",
}

def read_table_from_html(html: str) -> pd.DataFrame:
    # Versuche die größte Tabelle im HTML zu nehmen (das ist i.d.R. die Daten-Tabelle)
    soup = BeautifulSoup(html, "html.parser")
    tables = soup.find_all("table")
    if not tables:
        # Fallback: pandas erkennt Tabellen automatisch, wenn vorhanden
        dfs = pd.read_html(html)
        if not dfs:
            raise RuntimeError("Keine Tabelle gefunden.")
        return dfs[0]
    biggest = max(tables, key=lambda t: len(t.find_all("tr")) + len(t.get_text()))
    dfs = pd.read_html(str(biggest))
    if not dfs:
        raise RuntimeError("Keine Tabelle gefunden.")
    return dfs[0]

def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    df.columns = [re.sub(r"\s+", " ", str(c)).strip() for c in df.columns]
    df = df.dropna(how="all")
    return df

def detect_week_from_header(html: str) -> int | None:
    m = re.search(r"\bWeek\s+(\d{1,2})\b", html, re.IGNORECASE)
    return int(m.group(1)) if m else None

def add_player_team_columns(df: pd.DataFrame) -> pd.DataFrame:
    # Spieler
    if "Player" in df.columns:
        ext = df["Player"].str.extract(r"^(.*)\s+([A-Z]{2,3})$", expand=True)
        df["player_name"] = ext[0].str.strip()
        df["team"] = ext[1]
    # Team-Defense
    if "Defense (DST)" in df.columns:
        df.rename(columns={"Defense (DST)":"player_name"}, inplace=True)
        df["team"] = df["player_name"].str.extract(r"\((.*?)\)")[0]
        df["player_name"] = df["player_name"].str.replace(r"\s*\(.*?\)\s*", "", regex=True).str.strip()
    return df

def ensure_fpts(df: pd.DataFrame) -> pd.DataFrame:
    if "FPTS" not in df.columns:
        cand = next((c for c in df.columns if str(c).upper().startswith("FPTS")), None)
        if cand:
            df.rename(columns={cand: "FPTS"}, inplace=True)
    return df

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--outdir", default="data")
    ap.add_argument("--year", default=str(datetime.datetime.now().year))
    ap.add_argument("--week", default=os.environ.get("WEEK", "").strip(),
                    help="NFL Week (1..18). Leer lassen = aktuelle Week laut Seite.")
    args = ap.parse_args()

    year = int(args.year)
    week_param = int(args.week) if args.week.isdigit() else None

    out_root = pathlib.Path(args.outdir) / f"{year}"
    week_dirname = f"week_{week_param:02d}" if week_param else "week_current"
    out_dir = out_root / week_dirname
    out_dir.mkdir(parents=True, exist_ok=True)

    headers = {"User-Agent": "Mozilla/5.0"}

    for pos, path in POS_PATHS.items():
        url = f"{BASE}/{path}"
        if week_param:
            url = f"{url}?week={week_param}"

        r = requests.get(url, headers=headers, timeout=30)
        r.raise_for_status()
        html = r.text

        df = read_table_from_html(html)
        df = normalize_columns(df)
        df = add_player_team_columns(df)
        df = ensure_fpts(df)

        detected_week = detect_week_from_header(html) or week_param

        # Metadaten vorn anfügen
        df.insert(0, "position", pos.upper())
        df.insert(1, "season", year)
        df.insert(2, "week", detected_week)

        out_file = out_dir / f"{pos}.csv"
        df.to_csv(out_file, index=False, encoding="utf-8")
        print(f"[OK] {out_file}")

if __name__ == "__main__":
    sys.exit(main())
