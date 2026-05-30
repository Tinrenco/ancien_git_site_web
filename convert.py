"""
Script de conversion des données d'indisponibilité nucléaire.

Source des données (par ordre de priorité) :
  1. API EDF Open Data  — si un token est trouvé dans api_config.json
                          ou la variable d'environnement EDF_API_TOKEN.
  2. CSV local          — fichier indisponibilites_nucleaire_final.csv
                          (fallback si l'API est indisponible ou sans token).

Sorties : deux fichiers JSON au format attendu par l'application Angular :
  - donnees.json       : données HORAIRES (~2 derniers mois) → carte + histogramme
  - donnees_daily.json : données à MIDI   (~8 derniers mois) → listes déroulantes

Configuration du token API :
  Créer api_config.json à la racine du projet (non versionné) :
  { "token": "votre_token_base64_ici" }
  OU définir la variable d'environnement EDF_API_TOKEN.
"""

import csv
import json
import os
import urllib.request
import urllib.parse
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone


# ─── Chemins des fichiers d'entrée et de sortie ───────────────────────────────

INPUT_FILE   = 'donnees_edf.csv'
output_main  = 'src/assets/donnees.json'
output_daily = 'src/assets/donnees_daily.json'


# ─── Plages de dates à générer ────────────────────────────────────────────────
# Les dates se calculent automatiquement à partir d'aujourd'hui.
# Modifier les constantes de durée (en jours) pour ajuster la fenêtre.

_today = date.today()

DATE_TO_DAILY   = _today
DATE_FROM_DAILY = _today - timedelta(days=240)   # ~8 mois en arrière

DATE_TO_MAIN    = _today
DATE_FROM_MAIN  = _today - timedelta(days=60)    # ~2 mois en arrière


# ─── Configuration de l'API EDF Open Data ────────────────────────────────────
# Dataset : "Indisponibilités des moyens de production de EDF SA"
# (accessible avec les identifiants fournis par EDF)

API_BASE       = "https://opendata.edf.fr/data-fair/api/v1"
API_DATASET_ID = "haqk2fpmdz21sjiwhva-0n2x"
API_PAGE_SIZE  = 10000   # nombre max d'enregistrements par page


# ─── Coordonnées GPS des centrales ───────────────────────────────────────────
# Légèrement ajustées pour éviter les superpositions de marqueurs sur la carte.

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

# Statuts à exclure (publications annulées ou invalides)
EXCLUDED_STATUSES = {'', 'Inactif', 'DISMISSED'}


# ─── Fonctions utilitaires ────────────────────────────────────────────────────

def parse_dt(s):
    """
    Convertit une chaîne de date en datetime UTC.
    Gère les formats ISO avec ou sans offset : '2025-08-01T14:00:00+02:00'
    Retourne None si la chaîne est vide ou non parsable.
    """
    if not s:
        return None
    base = s.strip()[:19]
    for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S'):
        try:
            return datetime.strptime(base, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def get_centrale(unit_name):
    """
    Extrait le nom de la centrale depuis le nom complet de l'unité.
    Exemples : 'BLAYAIS 3' → 'BLAYAIS',  'ST ALBAN 1' → 'ST ALBAN'
    """
    parts = unit_name.rsplit(' ', 1)
    if len(parts) == 2 and parts[1].isdigit():
        return parts[0]
    return unit_name


def gps_for(centrale):
    return GPS.get(centrale)


# ─── Chargement depuis l'API EDF Open Data ───────────────────────────────────

def get_api_token():
    """
    Charge le token d'authentification API depuis :
      1. La variable d'environnement EDF_API_TOKEN
      2. Le fichier local api_config.json  (non versionné sur Git)
    Retourne None si aucun token n'est trouvé.
    """
    token = os.environ.get("EDF_API_TOKEN")
    if token:
        return token
    try:
        with open("api_config.json", encoding="utf-8") as f:
            return json.load(f).get("token")
    except (FileNotFoundError, KeyError, json.JSONDecodeError):
        return None


def load_outages_from_api(api_token):
    """
    Récupère toutes les indisponibilités nucléaires depuis l'API EDF.

    Algorithme :
      1. Pagination : on récupère API_PAGE_SIZE enregistrements à la fois
         jusqu'à avoir tout le dataset (filtre filiere=Nucléaire).
      2. Exclusion : on filtre les statuts invalides (annulés, inactifs).
      3. Déduplication : pour chaque identifiant d'événement, on ne garde
         que la ligne avec le numéro de version le plus élevé.
      4. Construction : on retourne la même structure que load_outages()
         pour que build_records() fonctionne sans modification.

    Retourne : (outages, units_info)
      - outages    : [{'unit', 'begin', 'end', 'available'}, ...]
      - units_info : {'CHOOZ 1': 1500.0, 'PALUEL 2': 1300.0, ...}
    """
    all_records = []
    after       = None   # curseur de pagination (valeur _i du dernier enregistrement)

    print("  Connexion a l'API EDF Open Data...")
    while True:
        # Filtre sur la filière nucléaire (accent encodé correctement par urlencode)
        params: dict = {
            "size":    API_PAGE_SIZE,
            "filiere": "Nucléaire",   # "Nucléaire" — URL-encodé par urlencode
        }
        if after is not None:
            params["after"] = after   # pagination curseur (data-fair)

        url = f"{API_BASE}/datasets/{API_DATASET_ID}/lines?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(url, headers={"Authorization": f"Basic {api_token}"})

        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        results = data.get("results", [])
        all_records.extend(results)
        total = data.get("total", 0)
        print(f"    {len(all_records)}/{total} enregistrements recuperes...")

        # Fin de pagination : dernière page si la réponse est incomplète
        if not results or len(results) < API_PAGE_SIZE:
            break

        # Curseur pour la page suivante : valeur _i du dernier enregistrement
        after = results[-1].get("_i")

    # Exclusion des statuts invalides
    valid = [
        r for r in all_records
        if r.get("status", "").strip() not in EXCLUDED_STATUSES
        and "annul" not in r.get("status", "").lower()
    ]

    # Déduplication : on garde la version la plus récente par identifiant
    best = {}
    for r in valid:
        ident = r.get("identifiant", "")
        ver   = r.get("numero_de_version", 0) or 0
        if ident not in best or ver > (best[ident].get("numero_de_version", 0) or 0):
            best[ident] = r

    # Construction de outages et units_info
    outages    = []
    units_info = {}

    for r in best.values():
        unit = r.get("nom", "").strip()
        if not unit:
            continue

        # Filtrer les centrales non-nucléaires : seules celles présentes dans
        # le dictionnaire GPS (centrales nucléaires françaises connues) sont gardées.
        # Le filtre filiere=Nucléaire envoyé à l'API est ignoré par le serveur,
        # ce qui ramène aussi des centrales hydrauliques, BESS, etc.
        if not gps_for(get_centrale(unit)):
            continue

        # Puissance nominale : on prend le max rencontré pour cette unité
        try:
            nom = float(r.get("puissance_maximale_mw") or 0)
        except (ValueError, TypeError):
            nom = 0.0
        if nom > 0:
            units_info[unit] = max(units_info.get(unit, 0), nom)

        # Dates de début et de fin de l'indisponibilité
        begin = parse_dt(r.get("date_de_debut", ""))
        end   = parse_dt(r.get("date_de_fin",   ""))
        if not begin or not end or end <= begin:
            continue

        # Puissance disponible pendant l'indisponibilité.
        # Si puissance_maximale_mw = 0 dans ce record, c'est une publication
        # REMIT incomplète (placeholder sans données de puissance) : on l'ignore
        # pour ne pas affecter le calcul de disponibilité avec de faux 0 MW.
        try:
            nom_record = float(r.get("puissance_maximale_mw") or 0)
        except (ValueError, TypeError):
            nom_record = 0.0

        if nom_record == 0:
            continue  # publication placeholder — pas de données fiables

        try:
            avail = float(r.get("puissance_disponible_mw") or 0)
        except (ValueError, TypeError):
            avail = 0.0

        outages.append({
            "unit":      unit,
            "begin":     begin,
            "end":       end,
            "available": avail,
        })

    return outages, units_info


# ─── Chargement depuis le CSV local (fallback) ───────────────────────────────

def load_outages(csv_path):
    """
    Lit le CSV d'indisponibilités et retourne outages + units_info.
    Utilisé en fallback si l'API est indisponible ou sans token.

    Le CSV contient des publications versionnées : on ne garde que
    la ligne avec le numéro de version le plus élevé par publication_id.
    """
    best      = {}
    units_info = {}

    try:
        f = open(csv_path, encoding='utf-8-sig')
    except FileNotFoundError:
        f = open(csv_path, encoding='latin-1')

    with f:
        reader = csv.DictReader(f, delimiter=',')
        for row in reader:
            pub_id = row.get('publication_id', '').strip()
            if not pub_id:
                continue
            try:
                ver = int(row.get('version', 0))
            except ValueError:
                ver = 0

            unit_name = row.get('unit_name', '').strip()
            if unit_name:
                try:
                    nom = float(row.get('nominal capacity (MW)', 0) or 0)
                    if nom > 0:
                        units_info[unit_name] = max(units_info.get(unit_name, 0), nom)
                except (ValueError, TypeError):
                    pass

            if ver > best.get(pub_id, {}).get('_ver', -1):
                best[pub_id] = {**row, '_ver': ver}

    outages = []
    for row in best.values():
        status = row.get('outage_status', '').strip()
        if status in EXCLUDED_STATUSES or 'annul' in status.lower():
            continue
        unit_name = row.get('unit_name', '').strip()
        if not unit_name:
            continue
        begin = parse_dt(row.get('outage_begin_dt (UTC)', ''))
        end   = parse_dt(row.get('outage_end_dt (UTC)',   ''))
        if not begin or not end or end <= begin:
            continue
        try:
            avail = float(row.get('available capacity (MW)', 0) or 0)
        except (ValueError, TypeError):
            avail = 0.0
        outages.append({'unit': unit_name, 'begin': begin, 'end': end, 'available': avail})

    return outages, units_info


# ─── Construction des séries temporelles ─────────────────────────────────────

def build_records(outages, units_info, date_from, date_to, hours_per_day):
    """
    Génère la liste de tous les enregistrements pour la plage de dates demandée.

    Pour chaque point temporel (date × heure × réacteur) :
      - Si un événement d'indisponibilité couvre ce moment → puissance = min(événements).
      - Sinon → puissance = puissance nominale (réacteur à pleine capacité).
    """
    by_unit  = defaultdict(list)
    for o in outages:
        by_unit[o['unit']].append(o)

    all_units = sorted(set(units_info) | {o['unit'] for o in outages})

    records = []
    current = date_from

    while current <= date_to:
        for hour in hours_per_day:
            ts     = datetime(current.year, current.month, current.day, hour, 0, 0,
                              tzinfo=timezone.utc)
            dt_str = f"{current.isoformat()}T{hour:02d}:00:00"

            for unit in all_units:
                nominal = units_info.get(unit, 0)
                if nominal <= 0:
                    continue

                covering  = [o for o in by_unit[unit] if o['begin'] <= ts <= o['end']]
                available = min(o['available'] for o in covering) if covering else nominal
                centrale  = get_centrale(unit)

                records.append({
                    'date_et_heure_fuseau_horaire_europe_paris': dt_str,
                    'heure_fuseau_horaire_europe_paris':         hour,
                    'centrale':                                  centrale,
                    'tranche':                                   unit,
                    'puissance_disponible':                      available,
                    'point_gps_modifie_pour_afficher_la_carte_opendata': gps_for(centrale),
                })

        current += timedelta(days=1)

    return records


# ─── Écriture du fichier JSON ─────────────────────────────────────────────────

def write_json(records, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, mode='w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False, separators=(',', ':'))


# ─── Point d'entrée principal ─────────────────────────────────────────────────

def main():
    # 1. Chargement des données : API EDF si token disponible, CSV sinon
    token = get_api_token()

    if token:
        print("Token API trouvé — chargement depuis l'API EDF Open Data...")
        try:
            outages, units_info = load_outages_from_api(token)
        except Exception as e:
            print(f"  Erreur API : {e}")
            print("  Bascule sur le CSV local...")
            try:
                outages, units_info = load_outages(INPUT_FILE)
            except FileNotFoundError:
                print(f"  Fichier CSV introuvable : {INPUT_FILE}")
                return
    else:
        print(f"Aucun token API — chargement depuis {INPUT_FILE} ...")
        print("  (Pour utiliser l'API : créer api_config.json avec {'token': '...'})")
        try:
            outages, units_info = load_outages(INPUT_FILE)
        except FileNotFoundError:
            print(f"  Fichier introuvable : {INPUT_FILE}")
            print("  → Créez api_config.json ou déposez le CSV à la racine du projet.")
            return

    print(f"  {len(outages)} événements actifs — {len(units_info)} unités")
    print(f"  Periode donnees_daily : {DATE_FROM_DAILY} -> {DATE_TO_DAILY}")
    print(f"  Periode donnees.json  : {DATE_FROM_MAIN}  -> {DATE_TO_MAIN}")

    # 2. Génération de donnees_daily.json (midi, longue période)
    print(f"\nGénération de {output_daily}...")
    daily = build_records(outages, units_info, DATE_FROM_DAILY, DATE_TO_DAILY, [12])
    write_json(daily, output_daily)
    print(f"  OK — {len(daily):,} enregistrements")

    # 3. Génération de donnees.json (horaire, période courte)
    print(f"\nGénération de {output_main}...")
    main_recs = build_records(outages, units_info, DATE_FROM_MAIN, DATE_TO_MAIN, list(range(24)))
    write_json(main_recs, output_main)
    print(f"  OK — {len(main_recs):,} enregistrements")


if __name__ == '__main__':
    main()
