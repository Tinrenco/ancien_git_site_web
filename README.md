# Tableau de bord du parc nucléaire français

Site web de visualisation de la disponibilité des centrales nucléaires EDF, développé dans le cadre du pôle projet **Nouveaux concepts énergétiques** de CentraleSupélec (promotion 2028).

## L'équipe

| Nom | École |
|-----|-------|
| Valentin LAVIGNE | CentraleSupélec · Promo 2028 |
| Bechir BECHIR | CentraleSupélec · Promo 2028 |
| El-Hadj Amadou OUMAR | CentraleSupélec · Promo 2028 |
| Corentin PRIZZON | CentraleSupélec · Promo 2028 |

Projet réalisé en collaboration avec l'équipe EDF Open Data.

---

## Prérequis

- [Node.js](https://nodejs.org/) v18+
- [Angular CLI](https://angular.dev/tools/cli) v18 : `npm install -g @angular/cli`
- Python 3.x (pour la génération des données)

---

## Installation

```bash
# 1. Cloner le dépôt
git clone <url-du-repo>
cd <dossier-projet>

# 2. Installer les dépendances Node
npm install
```

---

## Données (étape obligatoire)

Les fichiers de données sont trop volumineux pour être versionnés sur Git. Il faut les générer localement.

**Récupérer le fichier source** `export_ods.csv` depuis le lien partagé (Google Drive de l'équipe) et le placer à la racine du projet.

**Générer les fichiers JSON :**

```bash
python convert.py
```

Cela crée automatiquement :
- `src/assets/donnees.json` — données horaires sur 3 mois (carte interactive)
- `src/assets/donnees_daily.json` — données journalières sur toute la période (graphiques)

> Ces deux fichiers sont ignorés par Git (`.gitignore`). Chaque développeur doit les générer une fois en local.

---

## Lancer le serveur de développement

```bash
ng serve
```

Ouvrir [http://localhost:4200/home](http://localhost:4200/home) dans le navigateur.  
Le serveur se recharge automatiquement à chaque modification de fichier source.

---

## Structure du projet

```
src/
├── app/
│   ├── home/           → Page d'accueil (hero, stats live, barre de recherche)
│   ├── carte/          → Carte interactive Leaflet des centrales
│   ├── histogram/      → Graphiques de disponibilité par tranche ou totale France
│   ├── centrale/       → Page détail d'une centrale
│   ├── search-bar/     → Composant barre de recherche avec autocomplétion
│   └── srvices/        → DatasetService (chargement et filtrage des données JSON)
├── assets/
│   ├── i18n/           → Traductions FR / EN
│   ├── donnees.json        ← à générer (non versionné)
│   └── donnees_daily.json  ← à générer (non versionné)
public/
├── logoEDF.png
└── image-centrale.jpg  → Image de fond de la page d'accueil
convert.py              → Script de conversion CSV → JSON
```

---

## Branches Git

| Branche | Rôle |
|---------|------|
| `main` | Version stable de référence |
| `nouvelles-fonctionnalites_eao` | Développements en cours (branche principale active) |
| `Corentin_branch` | Branche de Corentin |

Pour récupérer les dernières modifications :

```bash
git fetch origin
git checkout nouvelles-fonctionnalites_eao
git pull
```

---

## Build de production

```bash
ng build
```

Les fichiers compilés sont générés dans `dist/`.

---

## Source des données

- Données brutes : [ENTSO-E](https://www.entsoe.eu/) et [RTE](https://data.rte-france.com/)
- Publication : [Open Data EDF](https://opendata.edf.fr)
- Publications officielles REMIT : [EDF REMIT](https://doaat.edf.fr/indisponibilites/list)

Les données sont actualisées au début de chaque heure.
