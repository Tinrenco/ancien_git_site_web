// ============================================================
// home.component.ts
// Composant de la page d'accueil.
//
// Rôle :
//   Affiche le bandeau "chiffres clés" du parc nucléaire français :
//     - Puissance totale disponible (en MW)
//     - Nombre de réacteurs actifs / nombre total
//     - Date du dernier relevé disponible dans les données
//
//   Ces trois valeurs sont calculées à l'initialisation en deux
//   requêtes chaînées au DatasetService :
//     1. getDateLimits()             → détermine la date du dernier relevé
//     2. getDatasetAllRecords(...)   → récupère les enregistrements à midi
//                                      à cette date pour calculer les stats
//
//   Le bandeau n'est rendu (statsLoaded = true) qu'une fois les deux
//   requêtes terminées, évitant un affichage de "0 MW / 0 réacteurs"
//   pendant le chargement.
// ============================================================

import { Component, OnDestroy, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { SearchBarComponent } from '../search-bar/search-bar.component';
import { DatasetService } from '../srvices/dataset.service';
import { MapComponent } from '../map/map.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslateModule, SearchBarComponent, MapComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent implements OnInit, OnDestroy {

  // ─── Chiffres clés affichés dans le bandeau ──────────────────────────────

  // Somme des puissances disponibles de toutes les tranches au dernier relevé.
  totalPower = 0;

  // Nombre de tranches dont la puissance disponible est > 0 MW
  // (réacteurs effectivement en production à l'instant du relevé).
  activeReactors = 0;

  // Nombre total de tranches présentes dans les données
  // (tranches en production + à l'arrêt + en maintenance).
  totalReactors = 0;

  // Date du dernier relevé formatée en français : "12 septembre 2025".
  latestDate = '';

  // Passe à true quand toutes les stats sont calculées.
  // Utilisé dans le template via *ngIf="statsLoaded" pour masquer
  // le bandeau jusqu'à ce que les données soient prêtes.
  statsLoaded = false;

  // Conteneur d'abonnements RxJS, annulés proprement dans ngOnDestroy.
  private subs = new Subscription();

  constructor(private datasetService: DatasetService) {}

  // ─── Cycle de vie Angular ─────────────────────────────────────────────────

  /**
   * Calcul des chiffres clés en deux requêtes chaînées :
   *
   * Étape 1 – getDateLimits()
   *   Récupère la date maximale présente dans les données (= date du
   *   dernier relevé). Cette date est formatée pour l'affichage, et sa
   *   version ISO (YYYY-MM-DD) est utilisée comme filtre pour l'étape 2.
   *
   * Étape 2 – getDatasetAllRecords(date + heure 12)
   *   Récupère tous les enregistrements à midi à la date du dernier relevé.
   *   Un relevé de midi est utilisé pour avoir une représentation stable
   *   de la journée (ni début ni fin de service).
   *   À partir de ces enregistrements :
   *     - totalReactors  = nombre d'entrées (une par tranche)
   *     - activeReactors = entrées où puissance_disponible > 0
   *     - totalPower     = somme des puissances, arrondie au MW
   */
  ngOnInit(): void {
    this.subs.add(
      this.datasetService.getDateLimits().subscribe({
        next: (data: any) => {
          const results    = data.results || data;
          const maxDateRaw = results[0]['max(date_et_heure_fuseau_horaire_europe_paris)'];
          if (!maxDateRaw) return; // sécurité si le JSON est vide

          const maxDateObj = new Date(maxDateRaw);

          // Formatage lisible de la date pour le bandeau : "12 septembre 2025"
          this.latestDate = maxDateObj.toLocaleDateString('fr-FR', {
            day:   '2-digit',
            month: 'long',
            year:  'numeric'
          });

          // Format YYYY-MM-DD pour le filtre de la requête suivante
          const dateStr = maxDateObj.toISOString().split('T')[0];

          // Requête imbriquée : données de midi à la dernière date connue
          this.subs.add(
            (this.datasetService as any).getDatasetAllRecords(
              {
                date_et_heure_fuseau_horaire_europe_paris: [dateStr],
                heure_fuseau_horaire_europe_paris: ['12'] // relevé de midi
              }
            ).subscribe({
              next: (records: any[]) => {
                // Adaptation format : tableau direct ou { results: [] }
                const list = Array.isArray(records) ? records : (records as any).results || [];

                this.totalReactors  = list.length;
                this.activeReactors = list.filter((r: any) => r.puissance_disponible > 0).length;
                this.totalPower     = Math.round(
                  list.reduce((s: number, r: any) => s + (r.puissance_disponible || 0), 0)
                );

                // Déclenche l'affichage du bandeau dans le template
                this.statsLoaded = true;
              }
            })
          );
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }
}
