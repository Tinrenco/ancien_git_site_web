import { Component, OnDestroy, OnInit, Input } from '@angular/core';
import { Subscription } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import * as Highcharts from 'highcharts';
import { HighchartsChartModule } from 'highcharts-angular';
import { DatasetService } from '../srvices/dataset.service';
import { DataSets, Dispo } from '../app.component.models';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-histogram',
  standalone: true,
  imports: [HighchartsChartModule, CommonModule, FormsModule, TranslateModule],
  templateUrl: './histogram.component.html',
  styleUrl: './histogram.component.scss',
})
export class HistogramComponent implements OnInit, OnDestroy {
  @Input() tranche!: string;
  isLoading: boolean = false;
  minDate: string = '';
  maxDate: string = '';
  isChartLoading: boolean = false;
  selectedCentrale: string = '';
  dateLimit: string = '';
  fullPeriod: boolean = false;
  private subs = new Subscription();
  private chartSub?: Subscription;
  centralesData: Dispo[] = []; 
  
  selectedCentraleData: {
    centrale: string;
    tranches: Dispo[];
  } | null = null;

  get centrales(): string[] {
    return [...new Set(this.centralesData.map(d => d.centrale))];
  }

  getTranches(): string[] {
    if (!this.selectedCentraleData?.tranches) return [];
    return this.selectedCentraleData.tranches.map(d => d.tranche);
  }

  constructor(
    private route: ActivatedRoute, 
    private datasetService: DatasetService,
    private router: Router,
    private translate: TranslateService
  ) {
        this.subs.add(this.translate.onLangChange.subscribe(() => {
          if (this.datasets.results?.length > 0) {
            this.afficherDonnees(this.datasets);
          }
        }));
  }

  Highcharts: typeof Highcharts = Highcharts;
  chartOptions: Highcharts.Options = {};
  datasets: DataSets = {} as DataSets;

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.chartSub?.unsubscribe();
  }

  ngOnInit(): void {
    const queryParams = this.route.snapshot.queryParams;
    const state = history.state;
    
    this.selectedCentrale = queryParams['centrale'] || '';
    this.tranche = queryParams['tranche'] || '';
    this.dateLimit = queryParams['date'] || new Date().toISOString().split('T')[0];

    if (state.centralesData) {
      this.centralesData = state.centralesData;
    } else {
      this.chargerCentrales();
    }

    if (this.selectedCentrale) {
      this.chargerTranchesPourCentrale(this.selectedCentrale);
    }

    // loadDateLimits corrige dateLimit si hors-plage, puis appelle chargerDonneesTranche
    this.loadDateLimits();
  }

  private loadDateLimits(): void {
    this.isLoading = true;
    (this.datasetService as any).getDailyDateLimits().subscribe({
      next: (data: any) => { // MODIFICATION ICI
        const results = data.results || data; // MODIFICATION ICI
        
        // Sécurité : si le JSON local ne contient pas les min/max pré-calculés, on met des dates par défaut
        try {
          const absoluteMinDate = new Date(results[0]['min(date_et_heure_fuseau_horaire_europe_paris)']);
          const absoluteMaxDate = new Date(results[0]['max(date_et_heure_fuseau_horaire_europe_paris)']);
    
          const adjustedMinDate = new Date(absoluteMinDate);
          adjustedMinDate.setDate(adjustedMinDate.getDate() + 50);
          
          const adjustedMaxDate = new Date(absoluteMaxDate);
          adjustedMaxDate.setDate(adjustedMaxDate.getDate() - 50);
    
          this.minDate = adjustedMinDate.toISOString().split('T')[0];
          this.maxDate = adjustedMaxDate.toISOString().split('T')[0];
        } catch (e) {
          // Fallback de sécurité si le JSON local n'a pas la bonne forme
          this.minDate = '2020-01-01';
          this.maxDate = '2030-12-31';
        }
        
        const currentDate = new Date(this.dateLimit);
        const minDateTime = new Date(this.minDate);
        const maxDateTime = new Date(this.maxDate);
        
        if (currentDate < minDateTime) {
          this.dateLimit = this.minDate;
        } else if (currentDate > maxDateTime) {
          this.dateLimit = this.maxDate;
        }
        
        this.isLoading = false;
        
        if (this.tranche) {
          this.chargerDonneesTranche(this.tranche);
        }
      },
      error: (error: any) => { // MODIFICATION ICI
        console.error('Erreur lors du chargement des dates limites:', error);
        this.isLoading = false;
      }
    });
  }

  toggleFullPeriod(): void {
    this.fullPeriod = !this.fullPeriod;
    if (this.tranche) {
      this.chartOptions = {};
      this.chargerDonneesTranche(this.tranche);
    }
  }

  chargerDonneesTranche(tranche: string): void {
    this.isChartLoading = true;
    let whereCondition = '';

    if (!this.fullPeriod && this.dateLimit) {
      const dateLimite = new Date(this.dateLimit);
      dateLimite.setHours(23, 59, 59);

      const dateDebut = new Date(dateLimite);
      dateDebut.setDate(dateDebut.getDate() - 50);
      dateDebut.setHours(0, 0, 0);

      const dateFin = new Date(dateLimite);
      dateFin.setDate(dateFin.getDate() + 50);
      dateFin.setHours(23, 59, 59);

      whereCondition = `date_et_heure_fuseau_horaire_europe_paris>"${dateDebut.toISOString()}" AND date_et_heure_fuseau_horaire_europe_paris<"${dateFin.toISOString()}"`;
    }

    this.chartSub?.unsubscribe();

    const source$ = this.fullPeriod
      ? (this.datasetService as any).getDailyRecords({ tranche: [tranche] })
      : (this.datasetService as any).getDatasetAllRecords(
          { tranche: [tranche], heure_fuseau_horaire_europe_paris: ['12'] },
          ['date_et_heure_fuseau_horaire_europe_paris', 'puissance_disponible', 'heure_fuseau_horaire_europe_paris'],
          whereCondition,
          'date_et_heure_fuseau_horaire_europe_paris'
        );

    this.chartSub = source$.subscribe({
      next: (data: any) => {
        this.datasets = { results: data.results || data } as DataSets;
        this.afficherDonnees(this.datasets);
        this.isChartLoading = false;
      },
      error: (error: any) => {
        console.error('Erreur lors de la récupération des données :', error);
        this.isChartLoading = false;
      }
    });
  }

  private chargerTranchesPourCentrale(centrale: string): void {
    const hour = '12'; 
    this.isChartLoading = true;
    const refinements = {
      date_et_heure_fuseau_horaire_europe_paris: [this.dateLimit || new Date().toISOString().split('T')[0]],
      heure_fuseau_horaire_europe_paris: [hour],
    };
    (this.datasetService as any).getDatasetAllRecords( // MODIFICATION ICI
      refinements,
      ['centrale', 'tranche', 'puissance_disponible'],
      `centrale = '${centrale}'`,
      "tranche ASC"
    ).subscribe({
      next: (data: any) => { // MODIFICATION ICI
        this.selectedCentraleData = {
          centrale: centrale,
          tranches: data.results || data // MODIFICATION ICI
        };
      },
      error: (error: any) => { // MODIFICATION ICI
        console.error('Erreur lors du chargement des tranches:', error);
        this.selectedCentraleData = null;
      }
    });
  }

  private chargerCentrales(): void {
    const hour = '12';
    const refinements = {
      date_et_heure_fuseau_horaire_europe_paris: [this.dateLimit],
      heure_fuseau_horaire_europe_paris: [hour],
    };

    (this.datasetService as any).getDatasetAllRecords( // MODIFICATION ICI
      refinements,
      ['centrale', 'tranche'],
      "tranche like '%1'", 
      "centrale ASC"
    ).subscribe({
      next: (data: any) => { // MODIFICATION ICI
        this.centralesData = data.results || data; // MODIFICATION ICI
      },
      error: (error: any) => { // MODIFICATION ICI
        console.error('Erreur lors du chargement des centrales:', error);
      }
    });
  }

  onCentraleChange(): void {
    this.tranche = '';
    if (this.selectedCentrale) {
      this.chargerTranchesPourCentrale(this.selectedCentrale);
    }
    this.updateUrlParams();
  }

  onTrancheChange(): void {
    if (this.tranche) {
      this.chartOptions = {}; 
      this.chargerDonneesTranche(this.tranche);
      this.updateUrlParams();
    }
  }

  onDateChange(): void {
    if (this.tranche) {
      this.chartOptions = {}; 
      this.chargerDonneesTranche(this.tranche);
      this.updateUrlParams();
    }
  }

  private updateUrlParams(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        centrale: this.selectedCentrale,
        tranche: this.tranche,
        date: this.dateLimit
      },
      queryParamsHandling: 'merge'
    });
  }

  afficherDonnees(data: DataSets): void {
    // Sécurité au cas où il n'y a pas de données
    if (!this.datasets.results) return;

    const dataStructure: [number, number][] = this.datasets.results.map((item) => {
      const baseDate = new Date(item.date_et_heure_fuseau_horaire_europe_paris);
      baseDate.setUTCHours(item.heure_fuseau_horaire_europe_paris);
      return [
        baseDate.getTime(),
        item.puissance_disponible,
      ];
    });
  
    const chartTitle = this.translate.instant('HISTOGRAM.CHART_TITLE');
    const chartSubtitle = document.ontouchstart === undefined
      ? this.translate.instant('HISTOGRAM.CHART_SUBTITLE')
      : this.translate.instant('HISTOGRAM.CHART_SUBTITLE_TOUCH');
    const yAxisTitle = this.translate.instant('HISTOGRAM.Y_AXIS_TITLE');
  
    this.chartOptions = {
      chart: {
        zooming: {
          type: 'x',
        },
        backgroundColor: '#FFFFFF',
      },
      title: {
        text: chartTitle,
        style: {
          color: '#003366',
          fontWeight: 'bold',
        },
      },
      subtitle: {
        text: chartSubtitle,
        style: {
          color: '#003366',
        },
      },
      xAxis: {
        type: 'datetime',
        labels: {
          style: {
            color: '#003366',
          },
        },
      },
      yAxis: {
        title: {
          text: yAxisTitle,
          style: {
            color: '#003366',
          },
        },
        labels: {
          style: {
            color: '#003366',
          },
        },
      },
      legend: {
        enabled: false,
      },
      plotOptions: {
        area: {
          marker: {
            radius: 4,
            fillColor: '#003366',
            lineWidth: 2,
            lineColor: '#003366',
          },
          lineWidth: 2,
          color: '#FF7300',
          fillColor: {
            linearGradient: {
              x1: 0,
              y1: 0,
              x2: 0,
              y2: 1,
            },
            stops: [
              [0, 'rgba(255, 115, 0, 0.5)'],
              [1, 'rgba(255, 115, 0, 0.1)'],
            ],
          },
          threshold: null,
        },
      },
      series: [
        {
          type: 'area',
          name: yAxisTitle,
          data: dataStructure,
          lineColor: '#FF7300',
        },
      ],
      tooltip: {
        xDateFormat: '%e %B %Y %H:%M', 
        shared: true,
        useHTML: true,
        headerFormat: '<small>{point.key}</small><br/>',
        pointFormat: '<span style="color:{point.color}">\u25CF</span> {series.name}: <b>{point.y} MW</b><br/>'
      },
    };
  
    Highcharts.chart('container', this.chartOptions);
  }
}