import csv
import json
import os

input_file = 'export_ods.csv'

# === CONFIGURATION ===
# Fichier 1 : données horaires complètes sur une plage réduite (pour la carte / vue par heure)
output_main  = 'src/assets/donnees.json'
DATE_FROM    = '2024-04-01'   # YYYY-MM-DD  (None = pas de limite)
DATE_TO      = '2024-07-01'   # YYYY-MM-DD  (None = pas de limite)

# Fichier 2 : données journalières (heure midi) sur TOUTE la période (pour les graphiques)
output_daily = 'src/assets/donnees_daily.json'
DAILY_HOUR   = 12   # Une mesure par jour à midi
# =====================

FIELD_MAP = {
    'Date et Heure (fuseau horaire Europe/Paris)': 'date_et_heure_fuseau_horaire_europe_paris',
    'Heure (fuseau horaire Europe/Paris)':         'heure_fuseau_horaire_europe_paris',
    'Perimètre juridique':                         'perimetre_juridique',
    'Perimètre spatial':                           'perimetre_spatial',
    'Spatial perimeter':                           'spatial_perimeter',
    'Centrale':                                    'centrale',
    'Tranche':                                     'tranche',
    'Puissance disponible':                        'puissance_disponible',
    'Unité':                                       'unite',
    "Lien de publication de l'indisponibilité":    'lien_de_publication_de_l_indisponibilite',
    'Point GPS corrigé':                           'point_gps_modifie_pour_afficher_la_carte_opendata',
}


def parse_gps(gps_str):
    if not gps_str or not gps_str.strip():
        return None
    parts = gps_str.split(',')
    if len(parts) == 2:
        try:
            return {'lat': float(parts[0].strip()), 'lon': float(parts[1].strip())}
        except ValueError:
            return None
    return None


def build_record(row):
    record = {}
    for csv_key, json_key in FIELD_MAP.items():
        value = row.get(csv_key, '')

        if json_key == 'date_et_heure_fuseau_horaire_europe_paris':
            value = value.replace(' ', 'T', 1)
        elif json_key == 'heure_fuseau_horaire_europe_paris':
            try:
                value = int(value)
            except (ValueError, TypeError):
                value = 0
        elif json_key == 'puissance_disponible':
            try:
                value = float(value)
            except (ValueError, TypeError):
                value = 0.0
        elif json_key == 'point_gps_modifie_pour_afficher_la_carte_opendata':
            value = parse_gps(value)
        elif json_key == 'lien_de_publication_de_l_indisponibilite':
            value = value if value else None

        record[json_key] = value
    return record


def write_json(records, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, mode='w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False, separators=(',', ':'))


def convert(csv_path):
    try:
        main_records  = []
        daily_records = []

        with open(csv_path, mode='r', encoding='utf-8') as f:
            reader = csv.DictReader(f, delimiter=';')
            for row in reader:
                raw_date  = row.get('Date et Heure (fuseau horaire Europe/Paris)', '')
                date_part = raw_date[:10]
                try:
                    hour = int(row.get('Heure (fuseau horaire Europe/Paris)', -1))
                except ValueError:
                    hour = -1

                record = build_record(row)

                # Fichier 1 : plage configurée, toutes les heures
                if (not DATE_FROM or date_part >= DATE_FROM) and \
                   (not DATE_TO   or date_part <= DATE_TO):
                    main_records.append(record)

                # Fichier 2 : toute la période, uniquement à midi
                if hour == DAILY_HOUR:
                    daily_records.append(record)

        write_json(main_records, output_main)
        print(f"✅ {output_main} : {len(main_records)} enregistrements")
        if main_records:
            print(f"   Plage : {main_records[0]['date_et_heure_fuseau_horaire_europe_paris']} → {main_records[-1]['date_et_heure_fuseau_horaire_europe_paris']}")

        write_json(daily_records, output_daily)
        print(f"✅ {output_daily} : {len(daily_records)} enregistrements (toute la période, midi)")
        if daily_records:
            print(f"   Plage : {daily_records[0]['date_et_heure_fuseau_horaire_europe_paris']} → {daily_records[-1]['date_et_heure_fuseau_horaire_europe_paris']}")

    except FileNotFoundError:
        print(f"❌ Fichier introuvable : {csv_path}")
    except Exception as e:
        print(f"❌ Erreur : {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    convert(input_file)
