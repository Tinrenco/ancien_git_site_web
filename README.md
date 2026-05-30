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

Ce tableau de bord permet de visualiser en temps quasi-réel la **disponibilité des tranches nucléaires françaises** : puissance disponible par centrale, historique horaire, comparaison entre tranches, et export des données.

### Fonctionnalités principales

| Fonctionnalité | Description |
|---|---|
| **Carte interactive** | Carte Leaflet de la France avec un marqueur par centrale. Clic → panneau de détail des tranches avec barres de puissance. |
| **Graphique historique** | Courbe de disponibilité horaire sur une période configurable. Mode tranche unique (area chart) ou comparaison multi-tranches (multi-lignes). |
| **Chiffres clés** | Bandeau d'accueil avec la puissance totale disponible, le nombre de réacteurs actifs, et la date du dernier relevé. |
| **Barre de recherche** | Autocomplétion sur les noms de centrales depuis la page d'accueil, navigation directe vers la carte. |
| **URLs partageables** | La date, l'heure et la centrale sélectionnées sont persistées dans l'URL (`?date=&hour=&centrale=`), permettant le partage d'un état précis. |
| **Export CSV** | Téléchargement des données affichées (mode total, tranche unique, ou comparaison multi-colonnes). |
| **Internationalisation** | Interface disponible en français et en anglais, avec détection automatique de la langue du navigateur. |
| **Page pédagogique** | Présentation du fonctionnement d'un réacteur REP, des circuits de refroidissement et du réseau de transport d'électricité. |

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

# 2. Se placer sur la branche de développement active
git checkout nouvelles-fonctionnalites_eao

# 3. Installer les dépendances Node
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

Ce script Python lit `export_ods.csv` et produit deux fichiers dans `src/assets/` :

| Fichier généré | Contenu | Utilisé par |
|---|---|---|
| `src/assets/donnees.json` | Un enregistrement **par heure** sur les **2 derniers mois**. Chaque enregistrement contient : centrale, tranche, date, heure, puissance disponible, coordonnées GPS. | Graphique historique (histogram), carte interactive |
| `src/assets/donnees_daily.json` | Un enregistrement **par jour** (relevé à midi) sur **toute la période disponible**. | Listes de centrales/tranches, chiffres clés de la page d'accueil |

> **Pourquoi deux fichiers ?** `donnees.json` est précis mais lourd (~2 mois × 24h × 56 tranches). `donnees_daily.json` est ~24× plus léger et suffit pour les listes déroulantes et les stats.

### Paramétrage de la période (optionnel)

Pour modifier la période couverte par `donnees.json`, ouvrir `convert.py` et changer la constante :

```python
DATE_FROM_MAIN = date(2025, 8, 1)   # début de la période horaire
```

---

## Lancer le serveur de développement

```bash
ng serve
```

Ouvrir [http://localhost:4200/home](http://localhost:4200/home) dans le navigateur.

Le serveur se recharge automatiquement à chaque modification de fichier source (hot reload).

---

## Structure du projet

```
ancien_git_site_web/
│
├── convert.py                   ← Script Python : CSV → JSON (données de disponibilité)
├── export_ods.csv               ← Données brutes (non versionné, à récupérer sur Drive)
│
├── public/
│   ├── logoEDF.png              ← Logo EDF (navbar)
│   ├── image-centrale.jpg       ← Photo de fond de la page d'accueil
│   └── centraleNuc1.png         ← Icône des marqueurs Leaflet
│
└── src/
    ├── app/
    │   ├── app.component.ts/html/scss   ← Composant racine : navbar, router-outlet,
    │   │                                   modales À propos / Contact, sélecteur de langue
    │   ├── app.routes.ts                ← Table de routage Angular (home, carte, histogram,
    │   │                                   nucleaire-info, page-not-found)
    │   ├── app.component.models.ts      ← Interfaces TypeScript (Dispo, DataSets, DateLimits)
    │   ├── app.config.ts                ← Configuration Angular (HttpClient, Router, i18n)
    │   │
    │   ├── home/                        ← Page d'accueil
    │   │   ├── home.component.ts        ← Calcul des chiffres clés (puissance, réacteurs, date)
    │   │   ├── home.component.html      ← Hero section, bandeau stats, cartes de navigation
    │   │   └── home.component.scss
    │   │
    │   ├── map/                         ← Carte interactive
    │   │   ├── map.component.ts         ← Leaflet, marqueurs, sélection centrale, URL shareable
    │   │   ├── map.component.html       ← Carte + panneau latéral (CentraleComponent)
    │   │   └── map.component.scss       ← Bottom sheet mobile
    │   │
    │   ├── centrale/                    ← Panneau de détail d'une centrale
    │   │   ├── centrale.component.ts    ← Chargement des tranches, barres de puissance,
    │   │   │                              navigation vers le graphique
    │   │   ├── centrale.component.html
    │   │   └── centrale.component.scss
    │   │
    │   ├── histogram/                   ← Graphique de disponibilité
    │   │   ├── histogram.component.ts   ← Highcharts, mode total / tranche(s), export CSV,
    │   │   │                              plage de dates, URL shareable
    │   │   ├── histogram.component.html ← Sélecteurs centrale/tranches (checkboxes), dates,
    │   │   │                              bouton export, chart container
    │   │   └── histogram.component.scss
    │   │
    │   ├── nucleaire-info/              ← Page pédagogique
    │   │   ├── nucleaire-info.component.ts   ← Données statiques des étapes de fonctionnement
    │   │   ├── nucleaire-info.component.html ← Sections : REP, circuits, réseau, stats France
    │   │   └── nucleaire-info.component.scss
    │   │
    │   ├── search-bar/                  ← Barre de recherche avec autocomplétion
    │   │   ├── search-bar.component.ts  ← Filtrage, navigation clavier, fermeture au clic ext.
    │   │   ├── search-bar.component.html
    │   │   └── search-bar.component.scss
    │   │
    │   ├── page-not-found/              ← Page 404
    │   │
    │   └── srvices/
    │       └── dataset.service.ts       ← Service central de données :
    │                                      - Chargement unique des JSON (shareReplay)
    │                                      - Filtrage par refinements, clause WHERE, tri
    │                                      - getDailyRecords / getDatasetAllRecords / getDateLimits
    │
    └── assets/
        ├── i18n/
        │   ├── fr.json                  ← Toutes les chaînes de l'interface en français
        │   └── en.json                  ← Toutes les chaînes de l'interface en anglais
        ├── donnees.json                 ← Généré par convert.py (non versionné)
        └── donnees_daily.json           ← Généré par convert.py (non versionné)
```

---

## Architecture des données

### Pipeline de traitement (`convert.py`)

```
export_ods.csv  →  convert.py  →  donnees.json  (horaire, 2 mois)
(données EDF/RTE)              →  donnees_daily.json  (journalier, période complète)
```

Le script fonctionne en plusieurs étapes :
1. **Parsing** : lecture du CSV d'indisponibilités (chaque ligne = une période d'arrêt d'une tranche).
2. **Reconstruction horaire** : pour chaque heure de la période, calcul de la puissance disponible (puissance nominale − indisponibilités actives).
3. **Enrichissement GPS** : ajout des coordonnées géographiques de chaque centrale (dictionnaire codé en dur dans le script).
4. **Export JSON** : écriture de `donnees.json` et `donnees_daily.json` dans `src/assets/`.

### Modèle de données (interface `Dispo`)

```typescript
interface Dispo {
  centrale: string;                // ex : "BUGEY"
  tranche: string;                 // ex : "T1"
  date_et_heure_fuseau_horaire_europe_paris: string; // ex : "2025-09-01T12:00:00+02:00"
  heure_fuseau_horaire_europe_paris: number;         // ex : 12
  puissance_disponible: number;    // MW disponibles à cet instant
  point_gps_modifie_pour_afficher_la_carte_opendata: {
    lat: number;
    lon: number;
  };
}
```

### Chargement des données (DatasetService)

Le service utilise `shareReplay(1)` de RxJS : les deux fichiers JSON sont chargés **une seule fois** au démarrage et le résultat est mis en cache. Tous les composants qui s'abonnent reçoivent immédiatement la valeur mémorisée, sans requête réseau supplémentaire.

```
Composants                    DatasetService
   │                               │
   ├── getDailyRecords()  ──────►  dailyData$ (shareReplay) ──► donnees_daily.json
   ├── getDatasetAllRecords() ──►  allData$   (shareReplay) ──► donnees.json
   └── getDateLimits()    ──────►  allData$   (même cache)
```

---

## Branches Git

| Branche | Rôle |
|---|---|
| `main` | Version stable de référence |
| `nouvelles-fonctionnalites_eao` | Branche de développement principale (active) |
| `Corentin_branch` | Branche de Corentin |
| `fonctionnalites-corentin` | Fonctionnalités développées par Corentin |

### Récupérer les dernières modifications

```bash
git fetch origin
git checkout nouvelles-fonctionnalites_eao
git pull
```

### Contribuer

```bash
# Toujours partir de la branche à jour
git checkout nouvelles-fonctionnalites_eao
git pull

# Créer une branche pour sa fonctionnalité
git checkout -b ma-fonctionnalite

# ... développement ...

git add <fichiers>
git commit -m "Description claire de la modification"
git push origin ma-fonctionnalite
# → ouvrir une Pull Request vers nouvelles-fonctionnalites_eao sur GitHub
```

---

## Build de production

```bash
ng build
```

Les fichiers compilés et optimisés sont générés dans `dist/`. Ils peuvent être déployés sur n'importe quel hébergeur statique (Vercel, Netlify, GitHub Pages, nginx...).

> **Note** : les fichiers `donnees.json` et `donnees_daily.json` doivent être présents dans `src/assets/` avant le build (lancez `python convert.py` en premier).

---

## Évolutions prévues

### Migration vers l'API EDF temps réel

Actuellement, les données sont statiques (fichiers JSON générés par `convert.py`). L'équipe EDF a fourni des identifiants API pour accéder au jeu de données en temps réel :

- **Endpoint** : `https://opendata.edf.fr/data-fair/api/v1/datasets/4wsb2p5ghkbutlyrnqjmgazo`
- **Auth** : `Authorization: Basic <token>` (Basic Auth fourni par EDF)

Une fois les droits d'accès confirmés (permission `readLines` à activer côté EDF), la migration consistera à :
1. Mettre à jour `convert.py` pour récupérer les données via l'API au lieu de lire un CSV local.
2. Automatiser l'exécution hebdomadaire du script pour rafraîchir les JSON.

Cette approche conserve l'architecture existente (Angular lit des JSON statiques) tout en alimentant ces JSON avec des données fraîches sans exposer la clé API dans le code frontend.

---

## Source des données

| Source | Rôle |
|---|---|
| [ENTSO-E](https://www.entsoe.eu/) | Données de transparence européennes sur la production nucléaire |
| [RTE Open Data](https://data.rte-france.com/) | Données de disponibilité du réseau français |
| [Open Data EDF](https://opendata.edf.fr) | Jeu de données `indisponibilites-nucleaires` mis à jour toutes les heures |
| [EDF REMIT](https://doaat.edf.fr/indisponibilites/list) | Publications officielles des indisponibilités (REMIT réglementaire) |
