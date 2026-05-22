"""
Script de conversion des données d'indisponibilité nucléaire.

Entrée  : indisponibilites_nucleaire_final.csv
          Fichier CSV contenant des ÉVÉNEMENTS d'indisponibilité : chaque ligne décrit
          une période pendant laquelle un réacteur était indisponible (ou partiellement
          disponible), avec une date de début, une date de fin et une puissance disponible.

Sorties : deux fichiers JSON au format attendu par l'application Angular :
          - donnees.json       : données HORAIRES sur 2 mois  → carte + histogramme
          - donnees_daily.json : données à MIDI sur 4 mois    → listes déroulantes

Algorithme général :
  1. Charger tous les événements du CSV en ne gardant que la dernière version
     de chaque publication (un même événement peut être corrigé plusieurs fois).
  2. Éliminer les événements annulés ou inactifs.
  3. Pour chaque point temporel (jour × heure × réacteur) :
       - Chercher tous les événements actifs qui couvrent ce moment.
       - Puissance disponible = min(puissances des événements couvrants),
         ou puissance nominale si aucun événement ne couvre ce moment
         (réacteur à pleine capacité).
  4. Écrire les résultats en JSON.
"""

import csv                          # lecture des fichiers CSV
import json                         # écriture des fichiers JSON
import os                           # création des dossiers de sortie
from collections import defaultdict # dictionnaire avec valeur par défaut
from datetime import date, datetime, timedelta, timezone  # manipulation des dates


# ─── Chemins des fichiers d'entrée et de sortie ───────────────────────────────

# Fichier CSV source contenant les données brutes d'indisponibilité
INPUT_FILE   = 'indisponibilites_nucleaire_final.csv'

# Fichier JSON de sortie utilisé par la CARTE et l'HISTOGRAMME (données horaires)
output_main  = 'src/assets/donnees.json'

# Fichier JSON de sortie utilisé pour les LISTES DÉROULANTES (centrale/tranche)
# Contient uniquement les relevés de midi, donc 24× moins volumineux
output_daily = 'src/assets/donnees_daily.json'


# ─── Plages de dates à générer ────────────────────────────────────────────────

# Plage pour donnees_daily.json : 4 mois, un seul point par jour (midi)
# Utilisé pour remplir les dropdowns centrale/tranche dans l'histogramme
DATE_FROM_DAILY = date(2025, 6, 1)
DATE_TO_DAILY   = date(2025, 9, 30)

# Plage pour donnees.json : 2 mois, 24 points par jour (une valeur par heure)
# Plus court car le fichier serait trop volumineux sur une longue période
DATE_FROM_MAIN  = date(2025, 8, 1)
DATE_TO_MAIN    = date(2025, 9, 30)


# ─── Coordonnées GPS des centrales ───────────────────────────────────────────
#
# Ces coordonnées sont ADAPTÉES pour la lisibilité sur la carte de France :
# certaines centrales proches ont été légèrement décalées pour éviter que
# leurs marqueurs se superposent.
# Les noms doivent correspondre EXACTEMENT aux noms dans le CSV
# (ex : 'ST ALBAN' et non 'SAINT-ALBAN').

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

# Statuts d'événement à exclure systématiquement.
# Les événements avec ces statuts sont des publications annulées ou invalides
# qui ne reflètent pas une vraie indisponibilité.
# Note : les variantes d'"Annulé" (encodage) sont gérées séparément via .lower()
EXCLUDED_STATUSES = {'', 'Inactif', 'DISMISSED'}


# ─── Fonctions utilitaires ────────────────────────────────────────────────────

def parse_dt(s):
    """
    Convertit une chaîne de caractères en objet datetime avec fuseau UTC.

    Le CSV peut contenir des dates dans deux formats différents :
      - '2025-08-01 14:00:00+02:00'  (avec espace et offset timezone)
      - '2025-08-01T14:00:00+02:00'  (format ISO avec T)

    Pour éviter les problèmes de parsing avec les offsets timezone variables,
    on ne garde que les 19 premiers caractères (la partie date + heure pure),
    puis on attache manuellement le fuseau UTC.

    Retourne None si la chaîne est vide ou non parsable.
    """
    if not s:
        return None
    s = s.strip()

    # On prend uniquement les 19 premiers caractères : 'YYYY-MM-DD HH:MM:SS'
    # Cela élimine les offsets timezone (+02:00, Z, etc.) qui varient selon les lignes
    base = s[:19]

    # On essaie les deux formats possibles
    for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S'):
        try:
            # replace(tzinfo=timezone.utc) : on considère tout en UTC
            # pour pouvoir comparer les dates uniformément
            return datetime.strptime(base, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue

    return None  # aucun format ne correspond


def get_centrale(unit_name):
    """
    Extrait le nom de la centrale à partir du nom d'une tranche.

    Exemples :
      'BLAYAIS 3'  → 'BLAYAIS'
      'ST ALBAN 1' → 'ST ALBAN'
      'DAMPIERRE'  → 'DAMPIERRE'  (si pas de numéro, retourne tel quel)

    Méthode : on coupe sur le DERNIER espace (rsplit avec maxsplit=1).
    Si la partie droite est un chiffre, c'est le numéro de tranche → on garde la gauche.
    """
    parts = unit_name.rsplit(' ', 1)
    if len(parts) == 2 and parts[1].isdigit():
        return parts[0]
    return unit_name


def gps_for(centrale):
    """
    Retourne le dictionnaire {'lat': ..., 'lon': ...} pour une centrale donnée.
    Retourne None si la centrale n'est pas dans le dictionnaire GPS.
    """
    return GPS.get(centrale)


# ─── Chargement et dédoublonnage des événements ───────────────────────────────

def load_outages(csv_path):
    """
    Lit le CSV et retourne deux structures :

    1. outages (liste) : événements d'indisponibilité ACTIFS, chacun sous la forme :
       {'unit': 'DAMPIERRE 1', 'begin': datetime(...), 'end': datetime(...), 'available': 910.0}

    2. units_info (dict) : puissance nominale par unité :
       {'DAMPIERRE 1': 910.0, 'DAMPIERRE 2': 910.0, ...}

    Pourquoi dédoublonner ?
    EDF publie les indisponibilités sous forme de "publications" versionnées.
    Quand une indisponibilité est corrigée (dates décalées, puissance révisée...),
    une nouvelle ligne est publiée avec le même publication_id mais un numéro
    de version supérieur. On ne garde que la ligne avec la version la plus haute.
    """
    # Dictionnaire temporaire : publication_id → ligne avec la version la plus haute
    best = {}

    # Dictionnaire final : unité → puissance nominale maximale connue
    units_info = {}

    # Ouverture du fichier CSV avec gestion de l'encodage
    # utf-8-sig gère le BOM (Byte Order Mark) présent dans certains CSV Windows
    try:
        f = open(csv_path, encoding='utf-8-sig')
    except FileNotFoundError:
        # Si utf-8-sig échoue, on essaie latin-1 (encodage courant des exports Windows)
        f = open(csv_path, encoding='latin-1')

    with f:
        # DictReader lit chaque ligne comme un dictionnaire {nom_colonne: valeur}
        # delimiter=';' car le CSV utilise le point-virgule comme séparateur (format français)
        reader = csv.DictReader(f, delimiter=';')

        for row in reader:
            pub_id = row.get('publication_id', '').strip()
            if not pub_id:
                continue  # ligne sans identifiant de publication → on ignore

            # Récupération du numéro de version (entier)
            try:
                ver = int(row.get('version', 0))
            except ValueError:
                ver = 0  # si la version n'est pas un entier valide, on met 0

            # Mise à jour de la puissance nominale de l'unité
            # On prend le MAX de toutes les valeurs rencontrées pour cette unité,
            # car certaines lignes peuvent avoir des valeurs manquantes ou incorrectes
            unit_name = row.get('unit_name', '').strip()
            if unit_name:
                try:
                    nom = float(row.get('nominal capacity (MW)', 0) or 0)
                    if nom > 0:
                        prev = units_info.get(unit_name, 0)
                        units_info[unit_name] = max(prev, nom)
                except (ValueError, TypeError):
                    pass  # valeur non numérique → on ignore silencieusement

            # Dédoublonnage : on ne garde que la ligne avec la version la plus haute
            prev_ver = best.get(pub_id, {}).get('_ver', -1)
            if ver > prev_ver:
                # {**row, '_ver': ver} : copie de la ligne + ajout du champ _ver
                best[pub_id] = {**row, '_ver': ver}

    # --- Construction de la liste finale des événements actifs ---
    outages = []
    for row in best.values():
        status = row.get('outage_status', '').strip()

        # Exclusion des événements annulés ou inactifs
        # On vérifie aussi 'annul' en minuscules pour gérer les variantes
        # d'encodage d'"Annulé" (avec ou sans accent, majuscules/minuscules)
        if status in EXCLUDED_STATUSES or 'annul' in status.lower():
            continue

        unit_name = row.get('unit_name', '').strip()
        if not unit_name:
            continue  # pas de nom d'unité → ligne inutilisable

        # Conversion des dates de début et fin en objets datetime
        begin = parse_dt(row.get('outage_begin_dt (UTC)', ''))
        end   = parse_dt(row.get('outage_end_dt (UTC)', ''))

        # On ignore les événements avec des dates invalides ou incohérentes
        if not begin or not end or end <= begin:
            continue

        # Puissance disponible pendant l'indisponibilité (peut être 0 = arrêt total)
        try:
            avail = float(row.get('available capacity (MW)', 0) or 0)
        except (ValueError, TypeError):
            avail = 0.0

        outages.append({
            'unit':      unit_name,
            'begin':     begin,
            'end':       end,
            'available': avail
        })

    return outages, units_info


# ─── Construction des séries temporelles ─────────────────────────────────────

def build_records(outages, units_info, date_from, date_to, hours_per_day):
    """
    Génère la liste de tous les enregistrements pour la plage de dates demandée.

    Paramètres :
      - outages       : liste des événements actifs (résultat de load_outages)
      - units_info    : dict {unité: puissance nominale}
      - date_from     : date de début (incluse)
      - date_to       : date de fin (incluse)
      - hours_per_day : liste des heures à générer
                        → [12]        pour un point par jour (midi seulement)
                        → range(24)   pour 24 points par jour (toutes les heures)

    Retourne une liste de dicts, chaque dict représentant un enregistrement
    au format attendu par l'application Angular.
    """

    # Index des événements par unité pour accélérer la recherche
    # defaultdict(list) crée automatiquement une liste vide pour toute clé inconnue
    # Sans cet index, on parcourrait TOUS les événements pour chaque point temporel
    by_unit = defaultdict(list)
    for o in outages:
        by_unit[o['unit']].append(o)

    # Liste de toutes les unités connues (union des unités avec capacité nominale
    # et des unités présentes dans les événements), triée alphabétiquement
    all_units = sorted(set(units_info) | {o['unit'] for o in outages})

    records = []
    current = date_from  # on commence à la date de début

    # Boucle principale : on avance jour par jour
    while current <= date_to:

        # Pour chaque heure demandée dans la journée
        for hour in hours_per_day:

            # Construction du timestamp exact pour ce point temporel
            # tzinfo=timezone.utc : on travaille en UTC pour comparer avec les événements
            ts = datetime(current.year, current.month, current.day, hour, 0, 0,
                          tzinfo=timezone.utc)

            # Chaîne de date au format attendu par Angular
            # Exemple : '2025-08-15T14:00:00'
            dt_str = f"{current.isoformat()}T{hour:02d}:00:00"

            # Pour chaque réacteur
            for unit in all_units:
                nominal = units_info.get(unit, 0)

                # Si la puissance nominale est inconnue ou nulle, on ignore ce réacteur
                if nominal <= 0:
                    continue

                # Recherche des événements d'indisponibilité qui couvrent ce moment
                # Un événement "couvre" un moment si : begin <= ts <= end
                covering = [o for o in by_unit[unit] if o['begin'] <= ts <= o['end']]

                if covering:
                    # Plusieurs indisponibilités simultanées sont possibles
                    # (ex : arrêt partiel + maintenance).
                    # On prend le MINIMUM des puissances disponibles :
                    # c'est la contrainte la plus restrictive qui s'applique.
                    available = min(o['available'] for o in covering)
                else:
                    # Aucun événement ne couvre ce moment → réacteur à pleine capacité
                    available = nominal

                centrale = get_centrale(unit)

                # Construction de l'enregistrement au format attendu par Angular
                # Les noms de champs correspondent aux colonnes de l'API EDF Open Data
                # pour assurer la compatibilité future
                records.append({
                    'date_et_heure_fuseau_horaire_europe_paris': dt_str,
                    'heure_fuseau_horaire_europe_paris':         hour,
                    'centrale':                                  centrale,
                    'tranche':                                   unit,
                    'puissance_disponible':                      available,
                    # Coordonnées GPS pour le placement du marqueur sur la carte Leaflet
                    'point_gps_modifie_pour_afficher_la_carte_opendata': gps_for(centrale),
                })

        # On passe au jour suivant
        current += timedelta(days=1)

    return records


# ─── Écriture du fichier JSON ─────────────────────────────────────────────────

def write_json(records, path):
    """
    Écrit la liste de records dans un fichier JSON.

    Options choisies :
      - ensure_ascii=False  : conserve les caractères accentués (é, è, â...)
                              au lieu de les convertir en séquences \\uXXXX
      - separators=(',',':') : supprime les espaces inutiles après les virgules
                               et les deux-points → fichier plus compact (moins de Ko)
    Le dossier de destination est créé automatiquement s'il n'existe pas.
    """
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, mode='w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False, separators=(',', ':'))


# ─── Point d'entrée principal ─────────────────────────────────────────────────

def main():
    """
    Orchestre l'ensemble du pipeline :
      1. Chargement et nettoyage des données source
      2. Génération de donnees_daily.json (liste déroulantes : midi, longue période)
      3. Génération de donnees.json       (carte + histogramme : horaire, courte période)
    """
    print(f"Chargement de {INPUT_FILE} ...")

    try:
        outages, units_info = load_outages(INPUT_FILE)
    except FileNotFoundError:
        print(f"Fichier introuvable : {INPUT_FILE}")
        return
    except Exception as e:
        import traceback
        print(f"Erreur lecture : {e}")
        traceback.print_exc()
        return

    print(f"  {len(outages)} evenements actifs - {len(units_info)} unites")

    # --- Génération de donnees_daily.json ---
    # hours_per_day=[12] : un seul relevé par jour, à midi
    # Utilisé pour alimenter les listes déroulantes centrale/tranche
    print(f"\nGeneration de {output_daily}  ({DATE_FROM_DAILY} a {DATE_TO_DAILY}, midi) ...")
    daily = build_records(outages, units_info, DATE_FROM_DAILY, DATE_TO_DAILY, [12])
    write_json(daily, output_daily)
    print(f"OK {output_daily} : {len(daily):,} enregistrements")

    # --- Génération de donnees.json ---
    # hours_per_day=range(24) : 24 relevés par jour, un par heure (0h à 23h)
    # Utilisé par la carte interactive et l'histogramme
    print(f"\nGeneration de {output_main}  ({DATE_FROM_MAIN} a {DATE_TO_MAIN}, horaire) ...")
    main_recs = build_records(outages, units_info, DATE_FROM_MAIN, DATE_TO_MAIN, list(range(24)))
    write_json(main_recs, output_main)
    print(f"OK {output_main} : {len(main_recs):,} enregistrements")


# Point d'entrée Python : ce bloc n'est exécuté que si on lance le script
# directement (python convert.py), pas si on l'importe depuis un autre module
if __name__ == '__main__':
    main()
