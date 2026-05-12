"""
Converts indisponibilites_nucleaire_final.csv (event-based outage data)
into two time-series JSON files compatible with the Angular site.

Algorithm:
  1. Load all events, keeping the latest version per publication_id.
  2. Exclude events with status: '', 'Inactif', 'Annulé', 'DISMISSED'.
  3. For each (unit, day [, hour]):
       - Find all active outages whose period covers that timestamp.
       - Available capacity = min(available_cap) of covering outages,
         or nominal_cap if no outage covers the timestamp.
  4. Write two output files with the same schema the Angular app expects.
"""

import csv
import json
import os
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

# ─── Input / output ──────────────────────────────────────────────────────────
INPUT_FILE   = 'indisponibilites_nucleaire_final.csv'
output_main  = 'src/assets/donnees.json'        # map  (hourly, shorter range)
output_daily = 'src/assets/donnees_daily.json'  # graphs (daily noon, long range)

# Date ranges
DATE_FROM_DAILY = date(2025, 6, 1)
DATE_TO_DAILY   = date(2025, 9, 30)

DATE_FROM_MAIN  = date(2025, 8, 1)
DATE_TO_MAIN    = date(2025, 9, 30)

# ─── GPS dict (centrale name → lat/lon) ──────────────────────────────────────
GPS = {
    'BELLEVILLE':  {'lat': 47.5111, 'lon':  2.8733},
    'BLAYAIS':     {'lat': 45.1558, 'lon': -0.6906},
    'BUGEY':       {'lat': 45.7975, 'lon':  5.2700},
    'CATTENOM':    {'lat': 49.4025, 'lon':  6.2197},
    'CHINON':      {'lat': 47.2328, 'lon':  0.1731},
    'CHOOZ':       {'lat': 50.0908, 'lon':  4.7878},
    'CIVAUX':      {'lat': 46.4589, 'lon':  0.6544},
    'CRUAS':       {'lat': 44.6308, 'lon':  4.7589},
    'DAMPIERRE':   {'lat': 47.7347, 'lon':  2.5153},
    'FESSENHEIM':  {'lat': 47.9053, 'lon':  7.5631},
    'FLAMANVILLE': {'lat': 49.5353, 'lon': -1.8853},
    'GOLFECH':     {'lat': 44.1081, 'lon':  0.8467},
    'GRAVELINES':  {'lat': 50.9578, 'lon':  2.1353},
    'NOGENT':      {'lat': 48.5175, 'lon':  3.5194},
    'PALUEL':      {'lat': 49.8614, 'lon':  0.6333},
    'PENLY':       {'lat': 49.9758, 'lon':  1.2122},
    'ST ALBAN':    {'lat': 45.4061, 'lon':  4.7558},
    'ST LAURENT':  {'lat': 47.7194, 'lon':  1.5767},
    'TRICASTIN':   {'lat': 44.3317, 'lon':  4.7317},
}

EXCLUDED_STATUSES = {'', 'Inactif', 'DISMISSED'}

# ─── Helpers ─────────────────────────────────────────────────────────────────

def parse_dt(s):
    if not s:
        return None
    s = s.strip()
    # Strip timezone offset so strptime works uniformly, then attach UTC
    base = s[:19]
    for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S'):
        try:
            return datetime.strptime(base, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def get_centrale(unit_name):
    """'BLAYAIS 3' → 'BLAYAIS',  'ST ALBAN 1' → 'ST ALBAN'"""
    parts = unit_name.rsplit(' ', 1)
    if len(parts) == 2 and parts[1].isdigit():
        return parts[0]
    return unit_name


def gps_for(centrale):
    return GPS.get(centrale)


# ─── Load & deduplicate outages ───────────────────────────────────────────────

def load_outages(csv_path):
    """
    Returns:
      outages    – list of active outage dicts {unit, begin, end, available}
      units_info – dict {unit_name: nominal_cap}
    """
    best = {}        # publication_id → row with highest version
    units_info = {}  # unit_name → nominal capacity

    try:
        f = open(csv_path, encoding='utf-8-sig')
    except FileNotFoundError:
        # Fallback: try latin-1
        f = open(csv_path, encoding='latin-1')

    with f:
        reader = csv.DictReader(f, delimiter=';')
        for row in reader:
            pub_id = row.get('publication_id', '').strip()
            if not pub_id:
                continue

            try:
                ver = int(row.get('version', 0))
            except ValueError:
                ver = 0

            # Track nominal capacity per unit
            unit_name = row.get('unit_name', '').strip()
            if unit_name:
                try:
                    nom = float(row.get('nominal capacity (MW)', 0) or 0)
                    if nom > 0:
                        prev = units_info.get(unit_name, 0)
                        units_info[unit_name] = max(prev, nom)
                except (ValueError, TypeError):
                    pass

            # Keep highest version only
            prev_ver = best.get(pub_id, {}).get('_ver', -1)
            if ver > prev_ver:
                best[pub_id] = {**row, '_ver': ver}

    outages = []
    for row in best.values():
        status = row.get('outage_status', '').strip()
        # Exclude inactive / cancelled — handle encoding variants of "Annulé"
        if status in EXCLUDED_STATUSES or 'annul' in status.lower():
            continue

        unit_name = row.get('unit_name', '').strip()
        if not unit_name:
            continue

        begin = parse_dt(row.get('outage_begin_dt (UTC)', ''))
        end   = parse_dt(row.get('outage_end_dt (UTC)', ''))
        if not begin or not end or end <= begin:
            continue

        try:
            avail = float(row.get('available capacity (MW)', 0) or 0)
        except (ValueError, TypeError):
            avail = 0.0

        outages.append({'unit': unit_name, 'begin': begin, 'end': end, 'available': avail})

    return outages, units_info


# ─── Build time-series records ────────────────────────────────────────────────

def build_records(outages, units_info, date_from, date_to, hours_per_day):
    """
    hours_per_day: list of hours to generate (e.g. [12] for daily noon, or range(24) for hourly).
    Returns list of record dicts.
    """
    by_unit = defaultdict(list)
    for o in outages:
        by_unit[o['unit']].append(o)

    all_units = sorted(set(units_info) | {o['unit'] for o in outages})

    records = []
    current = date_from
    while current <= date_to:
        for hour in hours_per_day:
            ts = datetime(current.year, current.month, current.day, hour, 0, 0,
                          tzinfo=timezone.utc)
            dt_str = f"{current.isoformat()}T{hour:02d}:00:00"

            for unit in all_units:
                nominal = units_info.get(unit, 0)
                if nominal <= 0:
                    continue

                covering = [o for o in by_unit[unit] if o['begin'] <= ts <= o['end']]
                available = min(o['available'] for o in covering) if covering else nominal

                centrale = get_centrale(unit)
                records.append({
                    'date_et_heure_fuseau_horaire_europe_paris': dt_str,
                    'heure_fuseau_horaire_europe_paris': hour,
                    'centrale': centrale,
                    'tranche': unit,
                    'puissance_disponible': available,
                    'point_gps_modifie_pour_afficher_la_carte_opendata': gps_for(centrale),
                })

        current += timedelta(days=1)

    return records


# ─── Write JSON ───────────────────────────────────────────────────────────────

def write_json(records, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, mode='w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False, separators=(',', ':'))


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print(f"Chargement de {INPUT_FILE} ...")
    try:
        outages, units_info = load_outages(INPUT_FILE)
    except FileNotFoundError:
        print(f"❌ Fichier introuvable : {INPUT_FILE}")
        return
    except Exception as e:
        import traceback
        print(f"❌ Erreur lecture : {e}")
        traceback.print_exc()
        return

    print(f"  {len(outages)} evenements actifs - {len(units_info)} unites")

    # ── donnees_daily.json (graphiques) ──────────────────────────────────────
    print(f"\nGeneration de {output_daily}  ({DATE_FROM_DAILY} a {DATE_TO_DAILY}, midi) ...")
    daily = build_records(outages, units_info, DATE_FROM_DAILY, DATE_TO_DAILY, [12])
    write_json(daily, output_daily)
    print(f"OK {output_daily} : {len(daily):,} enregistrements")

    # ── donnees.json (carte, horaire) ─────────────────────────────────────────
    print(f"\nGeneration de {output_main}  ({DATE_FROM_MAIN} a {DATE_TO_MAIN}, horaire) ...")
    main_recs = build_records(outages, units_info, DATE_FROM_MAIN, DATE_TO_MAIN, list(range(24)))
    write_json(main_recs, output_main)
    print(f"OK {output_main} : {len(main_recs):,} enregistrements")


if __name__ == '__main__':
    main()
