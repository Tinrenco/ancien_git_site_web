import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { Dispo } from '../app.component.models';
import { CommonModule } from '@angular/common';
import { DatasetService } from '../srvices/dataset.service';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import localeEn from '@angular/common/locales/en';

registerLocaleData(localeFr, 'fr');
registerLocaleData(localeEn, 'en');

@Component({
  selector: 'app-centrale',
  standalone: true,
  imports: [CommonModule,TranslateModule],
  templateUrl: './centrale.component.html',
  styleUrl: './centrale.component.scss'
})
export class CentraleComponent implements OnInit {
  @Input() selectedHour!: number;
  @Input() selectedDate!: string;
  @Output() closePanel = new EventEmitter<void>();
  @Input() centralesData: Dispo[] = []; // Nouvelle input property
  centraleName: string = ''; // Nouvelle propriété pour stocker le nom de la centrale


  additionalData: Dispo[] | null = null;
  isVisible: boolean = false;

  constructor(private datasetService: DatasetService, private router: Router, public  translate: TranslateService,    private route: ActivatedRoute) {}
  ngOnInit() {
    // Surveiller les paramètres d'URL
    this.route.queryParams.subscribe(params => {
      this.centraleName = params['centrale'] || '';
      this.selectedDate = params['date'] || '';
      this.selectedHour = parseInt(params['hour'] || '12', 10);

      if (this.centraleName) {
        this.isVisible = true;
        this.fetchAdditionalData();
      }
    });
    console.log(this.centraleName)
  }

  private getRefinements(): Record<string, string[]> {
    const hour = this.selectedHour.toString().padStart(2, '0');
    return {
      date_et_heure_fuseau_horaire_europe_paris: [this.selectedDate || new Date().toISOString().split('T')[0]],
      heure_fuseau_horaire_europe_paris: [hour]
    };
  }

goToHistogram(tranche: string): void {
  if (this.additionalData) {
    this.router.navigate(['/histogram'], {
      queryParams: { 
        centrale: this.centraleName,
        tranche: tranche,
        date: this.selectedDate
      },
      state: { 
        selectedCentraleData: {
          centrale: this.centraleName,
          tranches: this.additionalData
        },
        centralesData: this.centralesData
      }
    });
  }
}

fetchAdditionalData(): void {
  if (!this.centraleName) return;

  const refinements = this.getRefinements();
  this.datasetService.getDatasetAllRecords(
    refinements,
    ['centrale', 'tranche', 'point_gps_modifie_pour_afficher_la_carte_opendata', 'puissance_disponible'],
    `centrale = '${this.centraleName}'`,
    "tranche ASC"
  ).subscribe({
    next: (data) => {
      this.additionalData = data.results;
      this.isVisible = true;
    },
    error: (error) => {
      console.error('Erreur lors de la récupération des données :', error);
      this.additionalData = null;
    }
  });
}
  close(): void {
    this.isVisible = false;
    // Attendre la fin de l'animation avant d'émettre l'événement
    setTimeout(() => {
      this.closePanel.emit();
    }, 300); // 300ms correspond à la durée de l'animation CSS
  }

  calculateTotalPower(): number {
    if (!this.additionalData) return 0;
    return this.additionalData.reduce((total, item) => total + item.puissance_disponible, 0);
  }

  calculatePowerPercentage(power: number): number {
    if (!this.additionalData || !this.additionalData.length) return 0;
    const maxPower = Math.max(...this.additionalData.map(item => item.puissance_disponible));
    return maxPower === 0 ? 0 : (power / maxPower) * 100;
  }

  // Helpers pour le formatage
  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  formatHour(hour: number): string {
    return hour.toString().padStart(2, '0') + ':00';
  }
}