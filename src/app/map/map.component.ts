import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import * as L from 'leaflet';
import { Subscription } from 'rxjs';
import { DatasetService } from '../srvices/dataset.service';
import { DataSets, DateLimits, Dispo } from '../app.component.models';
import { CentraleComponent } from '../centrale/centrale.component';
import { TranslateService, TranslateModule } from '@ngx-translate/core';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.scss'],
  standalone: true,
  imports: [CommonModule, CentraleComponent, TranslateModule]
})
export class MapComponent implements OnInit, OnDestroy {
  selectedHour: number = 0;
  selectedDate: string = '';
  private map!: L.Map;
  datasets: DataSets = { total_count: 0, results: [] };
  dataset: Dispo[] = [];
  selectedCentrale: Dispo | null = null;
  isCompactView: boolean = false;
  isLoading: boolean = false;
  dateLimits: DateLimits | null = null;
  minDate: string = '';
  maxDate: string = '';

  private mapSub?: Subscription;
  private subs = new Subscription();

  constructor(private datasetService: DatasetService, private router: Router, private activatedRoute: ActivatedRoute) {}

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  ngOnInit(): void {
    this.initMap();

    const qp = this.activatedRoute.snapshot.queryParams;
    this.selectedDate = qp['date'] || new Date().toISOString().split('T')[0];
    this.selectedHour = qp['hour'] !== undefined ? parseInt(qp['hour'], 10) : new Date().getHours();

    this.loadCentralesOnMap();
    this.loadDateLimits();
  }

  private loadDateLimits(): void {
    this.isLoading = true;
    this.subs.add(this.datasetService.getDateLimits().subscribe({
      next: (data: any) => { // MODIFICATION : on précise : any
        const results = data.results || data; // Adaptation au JSON local

        try {
          // Conversion des dates en format YYYY-MM-DD pour l'input date
          this.minDate = new Date(results[0]['min(date_et_heure_fuseau_horaire_europe_paris)']).toISOString().split('T')[0];
          this.maxDate = new Date(results[0]['max(date_et_heure_fuseau_horaire_europe_paris)']).toISOString().split('T')[0];
        } catch (e) {
          // Sécurité si les champs n'existent pas dans le JSON local
          this.minDate = '2020-01-01';
          this.maxDate = '2030-12-31';
        }
        
        // Vérifier si la date actuelle est dans les limites
        const currentDate = new Date(this.selectedDate);
        const minDateTime = new Date(this.minDate);
        const maxDateTime = new Date(this.maxDate);
        
        if (currentDate < minDateTime) {
          this.selectedDate = this.minDate;
        } else if (currentDate > maxDateTime) {
          this.selectedDate = this.maxDate;
        }
        
        this.isLoading = false;
        // Charger les données initiales après avoir défini les limites
        this.loadCentralesOnMap(); 
      },
      error: (error: any) => {
        console.error('Erreur lors du chargement des dates limites:', error);
        this.isLoading = false;
      }
    }));
  }

  private setCurrentDate(): void {
    const today = new Date();
    this.selectedDate = today.toISOString().split('T')[0];
  }

  setCurrentHour(): void {
    const now = new Date();
    this.selectedHour = now.getHours();
  }

  onDateChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedDate = input.value;
    console.log(`Date sélectionnée : ${this.selectedDate}`);
    this.refreshData();
  }

  onTimeChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedHour = parseInt(input.value, 10);
    console.log(`Heure sélectionnée : ${this.selectedHour}:00`);
    this.refreshData();
  }

  private getRefinementsForNow(): Record<string, string[]> {
    const hour = this.selectedHour.toString().padStart(2, '0');
    return {
      date_et_heure_fuseau_horaire_europe_paris: [this.selectedDate],
      heure_fuseau_horaire_europe_paris: [hour],
    };
  }

  private loadCentralesOnMap(): void {
    // Annule la requête précédente si elle est encore en cours
    this.mapSub?.unsubscribe();
    this.isLoading = true;
    
    const centraleIcon = L.icon({
      iconUrl: 'centraleNuc1.png',
      iconSize: [45, 45],
      iconAnchor: [20, 0],
      popupAnchor: [0, 0],
    });
  
    // Effacer tous les marqueurs existants
    this.map.eachLayer((layer) => {
      if (layer instanceof L.Marker) {
        this.map.removeLayer(layer);
      }
    });
  
    this.mapSub = (this.datasetService as any).getDatasetAllRecords(
      this.getRefinementsForNow(),
      ['centrale', 'point_gps_modifie_pour_afficher_la_carte_opendata'],
      "tranche like '%1'"
    ).subscribe({
      next: (data: any) => { // MODIFICATION : data: any
        const results = data.results || data; // JSON local ou API

        this.dataset = results;
        this.datasets = { total_count: results.length, results: results };
  
        // Ajouter les nouveaux marqueurs
        this.dataset.forEach((dispo) => {
          if (dispo.point_gps_modifie_pour_afficher_la_carte_opendata) {
            const { lat, lon } = dispo.point_gps_modifie_pour_afficher_la_carte_opendata;
            const marker = L.marker([lat, lon], { icon: centraleIcon })
              .addTo(this.map);

            const popup = L.popup({
              closeButton: false,
              className: 'custom-popup'
            }).setContent(`<b>${dispo.centrale}</b>`);

            marker.on('mouseover', (e) => {
              popup.setLatLng(e.target.getLatLng()).openOn(this.map);
            }, this);

            marker.on('mouseout', () => {
              this.map.closePopup(popup);
            }, this);

            marker.on('click', () => {
              this.selectCentrale(dispo);
            });
          }
        });

        // Auto-sélection depuis les queryParams (ex: barre de recherche)
        const centraleName = this.activatedRoute.snapshot.queryParams['centrale'];
        if (centraleName && !this.selectedCentrale) {
          const match = this.dataset.find(d => d.centrale === centraleName);
          if (match) this.selectCentrale(match);
        }

        if (this.selectedCentrale) {
          this.updateHistogram();
        }
      },
      error: (err: any) => { // MODIFICATION : err: any
        console.error('Erreur lors du chargement des données :', err);
        this.isLoading = false;
      },
      complete: () => {
        this.isLoading = false;
      }
    });
  }

  private updateHistogram(): void {
    if (this.selectedCentrale) {
      const centraleName = this.selectedCentrale.centrale;
      this.selectedCentrale = this.dataset.find((dispo) => dispo.centrale === centraleName) || null;
    }
  }

  private initMap(): void {
    const franceBounds: L.LatLngBoundsExpression = [
      [55.124199, -5.142222],
      [40.371944, 9.561556],
    ];

    this.map = L.map('map', {
      center: [47.3, 1.8883],
      zoom: 6,
      minZoom: 6,
      maxBounds: franceBounds,
      maxBoundsViscosity: 0.8,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(this.map);
  }

  private selectCentrale(centrale: Dispo): void {
    this.selectedCentrale = centrale;
    this.isCompactView = true;
    
    if (centrale.point_gps_modifie_pour_afficher_la_carte_opendata) {
      const { lat, lon } = centrale.point_gps_modifie_pour_afficher_la_carte_opendata;
    
      this.router.navigate([], {
        relativeTo: this.activatedRoute,
        queryParams: { 
          centrale: centrale.centrale,
          date: this.selectedDate,
          hour: this.selectedHour.toString()
        },
        queryParamsHandling: 'merge'
      });
    
      setTimeout(() => {
        this.map.invalidateSize();
        this.map.flyTo([lat, lon], 8, { animate: true });
      });
    }
  }

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

  closeHistogram(): void {
    this.selectedCentrale = null;
    this.isCompactView = false;
    this.map.flyTo([47.3, 1.8883], 6, { animate: true });
  }
}