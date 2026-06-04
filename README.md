# Tableau de bord du parc nucléaire français

Site web de visualisation de la disponibilité des centrales nucléaires EDF, développé dans le cadre du pôle projet **Nouveaux concepts énergétiques** de CentraleSupélec (promotion 2028), en collaboration avec l'équipe **EDF Open Data**.

---

## L'équipe

| Nom | École |
|-----|-------|
| Valentin LAVIGNE | CentraleSupélec · Promo 2028 |
| Bechir BECHIR | CentraleSupélec · Promo 2028 |
| El-Hadj Amadou OUMAR | CentraleSupélec · Promo 2028 |
| Corentin PRIZZON | CentraleSupélec · Promo 2028 |

---

## Présentation du projet

Ce tableau de bord permet de visualiser la **disponibilité des tranches nucléaires françaises** : puissance disponible par centrale, historique depuis 2014, comparaison entre tranches, et export des données.

### Fonctionnalités principales

| Fonctionnalité | Description |
|---|---|
| **Carte interactive** | Carte Leaflet de la France avec un marqueur par centrale. Clic → panneau de détail des tranches avec barres de puissance. |
| **Graphique historique** | Courbe de disponibilité depuis 2014. Mode total France, total par site, tranche unique ou comparaison multi-tranches. Résolution horaire (≤ 31 jours) ou journalière. |
| **Chiffres clés** | Bandeau d'accueil avec la puissance totale disponible, le nombre de réacteurs actifs, et la date du dernier relevé. |
| **Barre de recherche** | Autocomplétion sur les noms de centrales depuis la page d'accueil, navigation directe vers la carte. |
| **URLs partageables** | La date, l'heure, la centrale et les tranches sélectionnées sont persistées dans l'URL. |
| **Export CSV** | Téléchargement des données affichées (mode total, tranche unique, ou comparaison multi-colonnes). |
| **Internationalisation** | Interface disponible en français et en anglais, avec détection automatique de la langue du navigateur. |
| **Page pédagogique** | Présentation du fonctionnement d'un réacteur REP, des circuits de refroidissement et du réseau de transport d'électricité. |
| **Mentions légales** | Disclaimer EDF obligatoire conforme aux exigences juridiques EDF Open Data. |

---

## Stack technique

| Couche | Technologie | Version |
|---|---|---|
| Framework frontend | Angular (standalone components) | 18.2 |
| Cartographie | Leaflet | 1.9.4 |
| Graphiques | Highcharts + highcharts-angular | 11.4.8 |
| Internationalisation | @ngx-translate/core | 16.0.4 |
| Données | Fichiers JSON statiques (générés par `convert.py`) | — |
| Script de traitement | Python 3 | 3.x |
| Styles | SCSS (composants standalone) | — |

---

## Prérequis

- [Node.js](https://nodejs.org/) v18 ou supérieur
- [Angular CLI](https://angular.dev/tools/cli) v18 : `npm install -g @angular/cli`
- Python 3.x (pour la génération locale des données)

---

## Installation

```bash
# 1. Cloner le dépôt
git clone git@github.com:Tinrenco/ancien_git_site_web.git
cd ancien_git_site_web

# 2. Installer les dépendances Node
npm install
```

---

## Données (étape obligatoire avant de lancer le projet)

Les fichiers de données JSON sont volumineux et ne sont **pas versionnés sur Git** (voir `.gitignore`). Chaque développeur doit les générer une fois en local.

### Étape 1 — Récupérer le fichier source CSV

Télécharger le fichier `export_ods.csv` depuis le Google Drive partagé de l'équipe et le placer à la **racine du projet** (au même niveau que `convert.py`).

> Ce fichier contient les données brutes d'indisponibilité nucléaire exportées depuis l'API EDF/RTE.

### Étape 2 — Générer les fichiers JSON

```bash
python convert.py
```

Ce script Python lit `export_ods.csv` et produit quatre fichiers dans `src/assets/` :

| Fichier généré | Contenu | Utilisé par |
|---|---|---|
| `src/assets/donnees.json` | Un enregistrement **par heure** sur les **2 derniers mois**. | Carte interactive (snapshot temps réel) |
| `src/assets/donnees_daily.json` | Un enregistrement **par jour** (relevé à midi) sur ~8 mois. | Listes de centrales/tranches, chiffres clés |
| `src/assets/events.json` | Événements bruts d'indisponibilité **depuis 2014**. | Graphique historique (toutes les courbes) |
| `src/assets/units.json` | Liste des réacteurs avec puissance nominale et coordonnées GPS. | Carte, graphique (référence nominale) |

---

## Lancer le serveur de développement

```bash
ng serve
```

Ouvrir [http://localhost:4200/home](http://localhost:4200/home) dans le navigateur.

---

## Structure du projet

```
ancien_git_site_web/
│
├── convert.py                   ← Script Python : CSV → JSON (données de disponibilité)
├── export_ods.csv               ← Données brutes (non versionné, à récupérer sur Drive)
│
├── public/
│   ├── image-centrale.jpg       ← Photo de fond de la page d'accueil
│   └── centraleNuc1.png         ← Icône des marqueurs Leaflet
│
└── src/
    ├── app/
    │   ├── app.component.*              ← Composant racine : navbar, footer, modales
    │   ├── app.routes.ts                ← Table de routage Angular
    │   ├── app.component.models.ts      ← Interfaces TypeScript (Dispo, DataSets)
    │   ├── app.config.ts                ← Configuration Angular (HttpClient, Router, i18n)
    │   │
    │   ├── home/                        ← Page d'accueil (KPIs, cartes de navigation)
    │   ├── map/                         ← Carte Leaflet interactive
    │   ├── centrale/                    ← Panneau de détail d'une centrale
    │   ├── histogram/                   ← Graphique Highcharts (historique, comparaison)
    │   ├── nucleaire-info/              ← Page pédagogique sur le nucléaire
    │   ├── search-bar/                  ← Barre de recherche avec autocomplétion
    │   ├── page-not-found/              ← Page 404
    │   │
    │   └── srvices/
    │       └── dataset.service.ts       ← Service central : chargement JSON (shareReplay),
    │                                      calcul des séries temporelles depuis events.json
    │
    └── assets/
        ├── i18n/
        │   ├── fr.json                  ← Chaînes de l'interface en français
        │   └── en.json                  ← Chaînes de l'interface en anglais
        ├── donnees.json                 ← Généré par convert.py (non versionné)
        ├── donnees_daily.json           ← Généré par convert.py (non versionné)
        ├── events.json                  ← Généré par convert.py (non versionné)
        └── units.json                   ← Généré par convert.py (non versionné)
```

---

## Architecture des données

### Pipeline de traitement (`convert.py`)

```
export_ods.csv  →  convert.py  →  donnees.json        (horaire, 2 mois — carte)
(données EDF/RTE)              →  donnees_daily.json  (journalier, 8 mois — listes)
                               →  events.json         (événements bruts depuis 2014 — graphique)
                               →  units.json          (réacteurs + GPS + nominale — référence)
```

### Modèle de données

```typescript
// Enregistrement horaire/journalier (donnees.json / donnees_daily.json)
interface Dispo {
  centrale: string;   // ex : "BUGEY"
  tranche:  string;   // ex : "BUGEY 1"
  date_et_heure_fuseau_horaire_europe_paris: string; // ISO 8601
  puissance_disponible: number;  // MW
  point_gps_modifie_pour_afficher_la_carte_opendata: { lat: number; lon: number };
}

// Réacteur de référence (units.json)
interface Unit {
  unit:     string;   // ex : "BUGEY 1"
  centrale: string;   // ex : "BUGEY"
  nominal:  number;   // puissance nominale en MW
  gps:      { lat: number; lon: number };
}
```

### Chargement des données (DatasetService)

Le service utilise `shareReplay(1)` de RxJS : les fichiers JSON sont chargés **une seule fois** au démarrage. Le graphique historique est entièrement calculé depuis `events.json` (15 000+ événements depuis 2014) sans re-requête réseau.

```
Composants                        DatasetService
   │                                    │
   ├── getSnapshotForDateTime()  ──────► indexedEvents$ + units$  (shareReplay)
   ├── getTotalProductionSeries() ─────► indexedEvents$ + units$
   ├── getTimeSeriesForTranches() ─────► indexedEvents$ + units$
   └── getDailyRecords()          ─────► dailyData$              ──► donnees_daily.json
```

---

## Build de production

```bash
ng build
```

Les fichiers compilés sont générés dans `dist/`. Déployables sur tout hébergeur statique (Vercel, Netlify, GitHub Pages, nginx...).

> **Note** : les fichiers `donnees.json`, `donnees_daily.json`, `events.json` et `units.json` doivent être présents dans `src/assets/` avant le build (lancer `python convert.py` en premier).

---

## Source des données

| Source | Rôle |
|---|---|
| [ENTSO-E](https://www.entsoe.eu/) | Données de transparence européennes sur la production nucléaire |
| [RTE Open Data](https://data.rte-france.com/) | Données de disponibilité du réseau français |
| [Open Data EDF](https://opendata.edf.fr) | Jeu de données `indisponibilites-nucleaires`, mis à jour toutes les heures |
| [EDF REMIT](https://doaat.edf.fr/indisponibilites/list) | Publications officielles des indisponibilités (règlement REMIT) |

---

## Mentions légales

Ce site a été conçu par **Valentin LAVIGNE, Bechir BECHIR, El-Hadj Amadou OUMAR et Corentin PRIZZON** à partir de jeux de données issus du portail open data du groupe EDF, librement accessibles conformément aux conditions de la licence applicable. Les auteurs sont seuls responsables de la sélection, du traitement et de l'exploitation de ces données, indépendamment d'EDF.
