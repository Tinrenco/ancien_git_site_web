// ============================================================
// map.component.ts
// Composant de la carte interactive des centrales nucléaires.
//
// Fonctionnement général :
//   1. ngOnInit initialise la carte Leaflet, lit les query params
//      de l'URL (date, hour, centrale) pour permettre les URLs
//      partageables, puis charge les marqueurs et les limites de date.
//   2. À chaque changement de date ou d'heure, refreshData() recharge
//      les marqueurs et met à jour les query params dans l'URL.
//   3. Un clic sur un marqueur sélectionne la centrale et ouvre le
//      panneau latéral (ou bottom sheet sur mobile) via CentraleComponent.
//   4. Les données proviennent de donnees_daily.json via DatasetService,
//      filtré sur la date+heure sélectionnées et sur la tranche 1
//      (une seule entrée par centrale pour positionner le marqueur).
// ============================================================

import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, OnDestroy, OnInit } from '@angular/core';
import * as L from 'leaflet';
import { Subscription } from 'rxjs';
import { DatasetService } from '../srvices/dataset.service';
import { DataSets, DateLimits, Dispo } from '../app.component.models';
import { CentraleComponent } from '../centrale/centrale.component';
import { TranslateModule } from '@ngx-translate/core';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.scss'],
  standalone: true,
  imports: [CommonModule, CentraleComponent, TranslateModule]
})
export class MapComponent implements OnInit, AfterViewInit, OnDestroy {

  // ─── État de la sélection date/heure ────────────────────────────────────

  // Heure sélectionnée par le slider (0–23). Initialisée depuis l'URL
  // ou à l'heure courante si aucun paramètre n'est présent.
  selectedHour: number = 0;

  // Date sélectionnée au format YYYY-MM-DD. Initialisée depuis l'URL
  // ou à la date du jour.
  selectedDate: string = '';

  // ─── Leaflet ─────────────────────────────────────────────────────────────

  // Instance de la carte Leaflet. Le '!' indique qu'elle sera initialisée
  // dans initMap() avant tout usage (Angular strict mode).
  private map!: L.Map;

  // ─── Données chargées depuis le service ──────────────────────────────────

  // Conteneur au format API EDF (total_count + results[]).
  datasets: DataSets = { total_count: 0, results: [] };

  // Tableau des enregistrements de disponibilité pour l'instant sélectionné.
  // Un enregistrement par centrale (filtré sur tranche T1).
  dataset: Dispo[] = [];

  // Centrale actuellement sélectionnée (clic sur un marqueur).
  // null → aucun panneau ouvert.
  selectedCentrale: Dispo | null = null;

  // ─── État de l'interface ─────────────────────────────────────────────────

  // Passe à true quand une centrale est sélectionnée : la carte se rétrécit
  // pour laisser la place au panneau latéral (layout CSS flex).
  isCompactView: boolean = false;
  isHistoricalMode: boolean = false;

  isLoading: boolean = false;

  // ─── Limites de date disponibles ─────────────────────────────────────────

  // Récupérées depuis computeDateLimits() pour contraindre le sélecteur
  // de date (attributs min= et max= sur l'<input type="date">).
  dateLimits: DateLimits | null = null;
  minDate: string = '';
  maxDate: string = '';

  // ─── Abonnements RxJS ────────────────────────────────────────────────────

  // Abonnement spécifique au chargement des marqueurs. Séparé de subs
  // pour pouvoir l'annuler (unsubscribe) avant de relancer une nouvelle
  // requête, évitant ainsi des réponses qui arrivent dans le désordre.
  private mapSub?: Subscription;

  // Conteneur d'abonnements secondaires (date limits...).
  // Tous sont annulés proprement dans ngOnDestroy().
  private subs = new Subscription();

  // Nom de centrale à auto-sélectionner une fois les données chargées.
  // Mis à jour par la souscription aux queryParams (cas carte embarquée dans /home).
  private pendingCentrale: string | null = null;

  constructor(
    private datasetService: DatasetService,
    private router: Router,
    private activatedRoute: ActivatedRoute
  ) {}

  // ─── Cycle de vie Angular ─────────────────────────────────────────────────

  /** Annule tous les abonnements RxJS quand le composant est détruit
   *  (changement de route) pour éviter les memory leaks. */
  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  /**
   * Initialisation complète du composant :
   *   1. Crée la carte Leaflet dans le div#map.
   *   2. Lit les query params de l'URL pour restaurer l'état partagé.
   *   3. Charge les marqueurs des centrales pour l'instant sélectionné.
   *   4. Charge les limites de date disponibles dans les données.
   */
  ngOnInit(): void {
    const qp = this.activatedRoute.snapshot.queryParams;
    this.selectedDate    = qp['date'] || new Date().toISOString().split('T')[0];
    this.selectedHour    = qp['hour'] !== undefined ? parseInt(qp['hour'], 10) : new Date().getHours();
    this.pendingCentrale = qp['centrale'] || null;

    // Réagit aux changements de query params quand la carte est embarquée
    // dans /home : l'utilisateur navigue vers /home?centrale=X depuis la
    // barre de recherche sans que HomeComponent soit détruit/recréé.
    this.subs.add(
      this.activatedRoute.queryParams.subscribe(params => {
        const c = params['centrale'];
        if (c && c !== this.selectedCentrale?.centrale) {
          this.pendingCentrale = c;
          if (this.dataset.length > 0) {
            const match = this.dataset.find(d => d.centrale === c);
            if (match) this.selectCentrale(match);
          }
        }
      })
    );
  }

  // Leaflet nécessite que le div#map soit dans le DOM avant d'être initialisé.
  // Quand le composant est embarqué (pas via router-outlet), le DOM du template
  // n'est disponible qu'à partir de ngAfterViewInit, pas de ngOnInit.
  ngAfterViewInit(): void {
    this.initMap();
    // Laisse le navigateur appliquer le CSS (notamment les surcharges ::ng-deep
    // du composant parent) avant que Leaflet calcule la taille du conteneur.
    setTimeout(() => {
      this.map.invalidateSize();
      this.loadCentralesOnMap();
      this.loadDateLimits();
    }, 0);
  }

  // ─── Chargement des limites de date ──────────────────────────────────────

  /**
   * Récupère la date minimale et maximale présentes dans les données,
   * puis contraint selectedDate si elle est hors plage.
   * Un deuxième appel à loadCentralesOnMap() est déclenché après pour
   * s'assurer que la date corrigée est bien appliquée aux marqueurs.
   */
  private loadDateLimits(): void {
    this.minDate = `${this.datasetService.HIST_START_YEAR}-01-01`;
    this.maxDate = new Date().toISOString().split('T')[0];
    if (this.selectedDate > this.maxDate) this.selectedDate = this.maxDate;
    if (this.selectedDate < this.minDate) this.selectedDate = this.minDate;
    this.isHistoricalMode = !this.datasetService.isRecentDate(this.selectedDate);
    this.loadCentralesOnMap();
  }

  // ─── Helpers date/heure ──────────────────────────────────────────────────

  /** Réinitialise selectedHour à l'heure courante (bouton "Maintenant"). */
  setCurrentHour(): void {
    const now = new Date();
    this.selectedHour = now.getHours();
  }

  // ─── Gestionnaires d'événements UI ──────────────────────────────────────

  /** Appelé quand l'utilisateur change la date dans l'<input type="date">. */
  onDateChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedDate = input.value;
    this.isHistoricalMode = !this.datasetService.isRecentDate(this.selectedDate);
    this.refreshData();
  }

  /** Appelé quand l'utilisateur déplace le slider d'heure. */
  onTimeChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedHour = parseInt(input.value, 10);
    console.log(`Heure sélectionnée : ${this.selectedHour}:00`);
    this.refreshData();
  }

  // ─── Construction des filtres ─────────────────────────────────────────────

  /**
   * Construit le dictionnaire de refinements à passer à getDatasetAllRecords.
   * Filtre simultanément sur la date (préfixe YYYY-MM-DD) et sur l'heure
   * (valeur numérique 0–23) pour isoler un instant précis.
   */
  private getRefinementsForNow(): Record<string, string[]> {
    const hour = this.selectedHour.toString().padStart(2, '0');
    return {
      date_et_heure_fuseau_horaire_europe_paris: [this.selectedDate],
      heure_fuseau_horaire_europe_paris: [hour],
    };
  }

  // ─── Chargement et affichage des marqueurs ────────────────────────────────

  /**
   * Charge les centrales pour l'instant sélectionné et place un marqueur
   * Leaflet sur la carte pour chacune d'elles.
   *
   * On filtre sur "tranche like '%1'" pour n'obtenir qu'un seul enregistrement
   * par centrale (la tranche 1 → T1, R1, etc.) qui contient les coordonnées GPS.
   * La disponibilité détaillée par tranche est affichée dans CentraleComponent
   * après sélection d'une centrale.
   */
  private loadCentralesOnMap(): void {
    // Annulation de la requête précédente si elle n'est pas encore terminée.
    // Sans ça, un changement rapide de date pourrait afficher des données
    // correspondant à l'ancien instant.
    this.mapSub?.unsubscribe();
    this.isLoading = true;

    // Icône personnalisée : image centraleNuc1.png placée dans assets/.
    const centraleIcon = L.icon({
      iconUrl:    'centraleNuc1.png',
      iconSize:   [45, 45],
      iconAnchor: [20, 0],   // point de l'icône ancré sur les coordonnées GPS
      popupAnchor: [0, 0],
    });

    // Suppression de tous les marqueurs existants avant d'en ajouter de nouveaux,
    // pour éviter la superposition en cas de rechargement.
    this.map.eachLayer((layer) => {
      if (layer instanceof L.Marker) {
        this.map.removeLayer(layer);
      }
    });

    this.isHistoricalMode = !this.datasetService.isRecentDate(this.selectedDate);

    this.mapSub = this.datasetService.getRecordsForDate(
      this.selectedDate,
      this.selectedHour,
      undefined,
      "tranche like '%1'"
    ).subscribe({
      next: (data: any) => {
        // Adaptation format : l'API EDF retourne { results: [] }, le JSON local
        // retourne directement un tableau [].
        const results = data.results || data;

        this.dataset  = results;
        this.datasets = { total_count: results.length, results: results };

        // Création des marqueurs pour chaque centrale
        this.dataset.forEach((dispo) => {
          if (dispo.point_gps_modifie_pour_afficher_la_carte_opendata) {
            const { lat, lon } = dispo.point_gps_modifie_pour_afficher_la_carte_opendata;

            const marker = L.marker([lat, lon], { icon: centraleIcon }).addTo(this.map);

            // Popup léger avec le nom de la centrale (survol de la souris)
            const popup = L.popup({
              closeButton: false,
              className: 'custom-popup'
            }).setContent(`<b>${dispo.centrale}</b>`);

            // Affiche le popup au survol
            marker.on('mouseover', (e) => {
              popup.setLatLng(e.target.getLatLng()).openOn(this.map);
            }, this);

            // Ferme le popup quand la souris quitte le marqueur
            marker.on('mouseout', () => {
              this.map.closePopup(popup);
            }, this);

            // Sélectionne la centrale au clic
            marker.on('click', () => {
              this.selectCentrale(dispo);
            });
          }
        });

        // Auto-sélection si ?centrale=NOM est présent (depuis la recherche ou URL partagée).
        if (this.pendingCentrale && !this.selectedCentrale) {
          const match = this.dataset.find(d => d.centrale === this.pendingCentrale);
          if (match) this.selectCentrale(match);
        }

        // Si une centrale était déjà sélectionnée, on met à jour son objet
        // avec les nouvelles données (la disponibilité a peut-être changé).
        if (this.selectedCentrale) {
          this.updateHistogram();
        }
      },
      error: (err: any) => {
        console.error('Erreur lors du chargement des données :', err);
        this.isLoading = false;
      },
      complete: () => {
        this.isLoading = false;
      }
    });
  }

  /**
   * Met à jour selectedCentrale avec l'enregistrement frais du dataset
   * (après rechargement suite à un changement de date/heure).
   * Cela force CentraleComponent à se rafraîchir avec les nouvelles
   * valeurs de disponibilité.
   */
  private updateHistogram(): void {
    if (this.selectedCentrale) {
      const centraleName = this.selectedCentrale.centrale;
      this.selectedCentrale = this.dataset.find((dispo) => dispo.centrale === centraleName) || null;
    }
  }

  // ─── Initialisation Leaflet ───────────────────────────────────────────────

  /**
   * Crée la carte Leaflet centrée sur la France métropolitaine.
   *
   * Options notables :
   *   - minZoom = 6 : on ne peut pas dézoomer au-delà de la vue de la France.
   *   - maxBounds : empêche l'utilisateur de faire défiler en dehors de la France.
   *   - maxBoundsViscosity = 0.8 : résistance élastique aux bords (0 = libre,
   *     1 = mur dur).
   *   - Fond de carte OpenStreetMap (libre et gratuit).
   */
  private initMap(): void {
    // Limites géographiques de la France métropolitaine (NW → SE)
    const franceBounds: L.LatLngBoundsExpression = [
      [55.124199, -5.142222],  // coin Nord-Ouest
      [40.371944,  9.561556],  // coin Sud-Est
    ];

    this.map = L.map('map', {
      center: [47.3, 1.8883], // centre géographique de la France
      zoom: 6,
      minZoom: 6,
      maxBounds: franceBounds,
      maxBoundsViscosity: 0.8,
    });

    // Couche de tuiles OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(this.map);
  }

  // ─── Sélection d'une centrale ─────────────────────────────────────────────

  /**
   * Gère le clic sur un marqueur :
   *   1. Stocke la centrale sélectionnée (déclenche l'affichage du panneau).
   *   2. Passe en vue compacte (isCompactView = true → carte réduite).
   *   3. Met à jour les query params de l'URL (centrale, date, hour) pour
   *      permettre le partage de lien.
   *   4. Anime la caméra Leaflet vers la centrale choisie (flyTo).
   *
   * Le setTimeout() est nécessaire pour laisser Angular re-rendre le DOM
   * (changement de layout) avant de recalculer la taille de la carte
   * avec invalidateSize(). Sans ça, Leaflet calcule la taille sur un
   * conteneur qui n'a pas encore sa nouvelle taille CSS.
   */
  private selectCentrale(centrale: Dispo): void {
    this.selectedCentrale = centrale;
    this.isCompactView = true;

    if (centrale.point_gps_modifie_pour_afficher_la_carte_opendata) {
      const { lat, lon } = centrale.point_gps_modifie_pour_afficher_la_carte_opendata;

      // Mise à jour des query params sans recharger la page (queryParamsHandling: 'merge'
      // conserve les éventuels autres params déjà présents dans l'URL).
      this.router.navigate([], {
        relativeTo: this.activatedRoute,
        queryParams: {
          centrale: centrale.centrale,
          date:     this.selectedDate,
          hour:     this.selectedHour.toString()
        },
        queryParamsHandling: 'merge'
      });

      // Délai d'un tick pour que le layout CSS soit appliqué avant
      // de recalculer la taille de la carte Leaflet.
      setTimeout(() => {
        this.map.invalidateSize();
        this.map.flyTo([lat, lon], 8, { animate: true });
      });
    }
  }

  // ─── Rafraîchissement ────────────────────────────────────────────────────

  /**
   * Appelée à chaque changement de date ou d'heure :
   *   1. Met à jour les query params dans l'URL (URL partageable).
   *   2. Recharge les marqueurs pour le nouvel instant.
   *
   * La propagation de centrale dans l'URL n'est faite que si une centrale
   * est déjà sélectionnée (opérateur spread conditionnel &&).
   */
  private refreshData(): void {
    const currentCentraleName = this.selectedCentrale?.centrale;

    this.router.navigate([], {
      relativeTo: this.activatedRoute,
      queryParams: {
        ...(currentCentraleName && { centrale: currentCentraleName }),
        date: this.selectedDate,
        hour: this.selectedHour.toString()
      },
      queryParamsHandling: 'merge'
    });

    this.isLoading = true;
    this.loadCentralesOnMap();
  }

  // ─── Fermeture du panneau ────────────────────────────────────────────────

  /**
   * Désélectionne la centrale et referme le panneau latéral.
   * La carte reprend sa taille complète et revient à la vue de la France.
   * Appelée depuis le bouton "Fermer" du panneau CentraleComponent.
   */
  closeHistogram(): void {
    this.selectedCentrale = null;
    this.isCompactView    = false;
    this.map.flyTo([47.3, 1.8883], 6, { animate: true });
  }
}
