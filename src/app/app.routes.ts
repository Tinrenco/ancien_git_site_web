// ============================================================
// app.routes.ts
// Définition centralisée des routes de l'application.
//
// Chaque entrée du tableau associe un chemin URL (path) à un
// composant Angular à afficher dans le <router-outlet> de
// app.component.html lorsque l'URL correspond.
//
// L'ordre des routes est important :
//   1. Les routes spécifiques sont déclarées en premier.
//   2. La route '' (racine) redirige vers /home.
//   3. La route '**' (wildcard) est placée en dernier : elle
//      capture toutes les URL non reconnues et affiche la page 404.
// ============================================================

import { Routes } from '@angular/router';
import { HomeComponent }         from './home/home.component';
import { HistogramComponent }    from './histogram/histogram.component';
import { NucleaireInfoComponent } from './nucleaire-info/nucleaire-info.component';
import { PageNotFoundComponent } from './page-not-found/page-not-found.component';

export const routes: Routes = [

  // Page d'accueil : chiffres clés du parc, carte interactive.
  { path: 'home',           component: HomeComponent },

  // Redirection de l'ancienne route /carte vers /home (la carte y est intégrée).
  { path: 'carte',          redirectTo: '/home', pathMatch: 'full' },

  // Histogramme Highcharts : courbe de disponibilité horaire
  // d'une ou plusieurs tranches sur une période donnée.
  // Supporte ?centrale=&tranche= pour URLs partageables.
  { path: 'histogram',      component: HistogramComponent },

  // Page pédagogique : fonctionnement d'un réacteur nucléaire,
  // circuits de refroidissement, réseau de transport d'électricité.
  { path: 'nucleaire-info', component: NucleaireInfoComponent },

  // Route racine : redirige automatiquement vers /home.
  // pathMatch: 'full' évite que '' ne matche aussi des chemins
  // comme /histogram (car '' est préfixe de tout chemin).
  { path: '',               pathMatch: 'full', redirectTo: '/home' },

  // Wildcard (toujours en dernier) : affiche la page 404
  // pour toute URL qui ne correspond à aucune route ci-dessus.
  { path: '**',             component: PageNotFoundComponent },
];
