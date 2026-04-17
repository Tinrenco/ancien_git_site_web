import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Subscription } from 'rxjs';
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
  imports: [CommonModule, TranslateModule],
  templateUrl: './centrale.component.html',
  styleUrl: './centrale.component.scss'
})
export class CentraleComponent implements OnInit, OnDestroy {
  @Input() selectedHour!: number;
  @Input() selectedDate!: string;
  @Output() closePanel = new EventEmitter<void>();
  @Input() centralesData: Dispo[] = []; 
  centraleName: string = ''; 

  additionalData: Dispo[] | null = null;
  isVisible: boolean = false;
  private subs = new Subscription();

  constructor(
    private datasetService: DatasetService, 
    private router: Router, 
    public translate: TranslateService,    
    private route: ActivatedRoute
  ) {}

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  ngOnInit() {
    this.subs.add(this.route.queryParams.subscribe(params => {
      this.centraleName = params['centrale'] || '';
      this.selectedDate = params['date'] || '';
      this.selectedHour = parseInt(params['hour'] || '12', 10);

      if (this.centraleName) {
        this.isVisible = true;
        this.fetchAdditionalData();
      }
    }));
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
    
    // On utilise "as any" ici pour éviter les erreurs de compilation sur le nombre d'arguments
    // car on a simplifié le service pour utiliser le fichier JSON local
    (this.datasetService as any).getDatasetAllRecords(
      refinements,
      ['centrale', 'tranche', 'point_gps_modifie_pour_afficher_la_carte_opendata', 'puissance_disponible'],
      `centrale = '${this.centraleName}'`,
      "tranche ASC"
    ).subscribe({
      // 1ère MODIFICATION ICI : On précise (data: any)
      next: (data: any) => {
        // 2ème MODIFICATION ICI : Si data.results n'existe pas, on prend data directement
        this.additionalData = data.results || data; 
        this.isVisible = true;
      },
      // 3ème MODIFICATION ICI : On précise (error: any)
      error: (error: any) => {
        console.error('Erreur lors de la récupération des données :', error);
        this.additionalData = null;
      }
    });
  }

  close(): void {
    this.isVisible = false;
    setTimeout(() => {
      this.closePanel.emit();
    }, 300);
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