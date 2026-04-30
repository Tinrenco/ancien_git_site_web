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
  fullPeriod: boolean = true;   // toujours "Toute la période" par défaut
  isTotalMode: boolean = false; // true quand on affiche la prod totale France

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
      if (this.isTotalMode) {
        this.chargerProductionTotale();
      } else if (this.datasets.results?.length > 0) {
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

    this.selectedCentrale = queryParams['centrale'] || '';
    this.tranche          = queryParams['tranche']  || '';
    this.dateLimit        = queryParams['date']     || new Date().toISOString().split('T')[0];

    // Charge toujours la liste des centrales depuis les données daily
    this.chargerCentrales();

    if (this.selectedCentrale) {
      this.chargerTranchesPourCentrale(this.selectedCentrale);
    }

    this.loadDateLimits();
  }

  // ─── Date limits ──────────────────────────────────────────────────────────────

  private loadDateLimits(): void {
    this.isLoading = true;
    (this.datasetService as any).getDailyDateLimits().subscribe({
      next: (data: any) => {
        const results = data.results || data;
        try {
          const absoluteMinDate = new Date(results[0]['min(date_et_heure_fuseau_horaire_europe_paris)']);
          const absoluteMaxDate = new Date(results[0]['max(date_et_heure_fuseau_horaire_europe_paris)']);

          const adjustedMin = new Date(absoluteMinDate);
          adjustedMin.setDate(adjustedMin.getDate() + 50);
          const adjustedMax = new Date(absoluteMaxDate);
          adjustedMax.setDate(adjustedMax.getDate() - 50);

          this.minDate = adjustedMin.toISOString().split('T')[0];
          this.maxDate = adjustedMax.toISOString().split('T')[0];
        } catch {
          this.minDate = '2020-01-01';
          this.maxDate = '2030-12-31';
        }

        const current = new Date(this.dateLimit);
        if (current < new Date(this.minDate)) this.dateLimit = this.minDate;
        else if (current > new Date(this.maxDate)) this.dateLimit = this.maxDate;

        this.isLoading = false;

        // Lance le bon graphique selon l'état
        if (this.tranche) {
          this.chargerDonneesTranche(this.tranche);
        } else {
          this.chargerProductionTotale();
        }
      },
      error: () => { this.isLoading = false; }
    });
  }

  // ─── Production totale France ─────────────────────────────────────────────────

  chargerProductionTotale(): void {
    this.isTotalMode    = true;
    this.isChartLoading = true;
    this.chartSub?.unsubscribe();

    this.chartSub = (this.datasetService as any).getDailyRecords({}).subscribe({
      next: (data: any) => {
        const records: any[] = data.results || data;

        // Agrège la puissance disponible par date
        const byDate = new Map<number, number>();
        for (const r of records) {
          const t = new Date(r.date_et_heure_fuseau_horaire_europe_paris).getTime();
          byDate.set(t, (byDate.get(t) || 0) + (r.puissance_disponible || 0));
        }

        const series: [number, number][] = [...byDate.entries()]
          .sort((a, b) => a[0] - b[0]);

        this.afficherProductionTotale(series);
        this.isChartLoading = false;
      },
      error: () => { this.isChartLoading = false; }
    });
  }

  private afficherProductionTotale(series: [number, number][]): void {
    this.chartOptions = {
      chart: { zooming: { type: 'x' }, backgroundColor: '#FFFFFF' },
      title: {
        text: 'Production nucléaire totale — France',
        style: { color: '#003366', fontWeight: 'bold' }
      },
      subtitle: {
        text: 'Puissance disponible cumulée de toutes les tranches (MW)',
        style: { color: '#003366' }
      },
      xAxis: {
        type: 'datetime',
        labels: { style: { color: '#003366' } }
      },
      yAxis: {
        title: { text: 'Puissance disponible (MW)', style: { color: '#003366' } },
        labels: { style: { color: '#003366' } }
      },
      legend: { enabled: false },
      plotOptions: {
        area: {
          marker: { radius: 2 },
          lineWidth: 2,
          color: '#FF7300',
          fillColor: {
            linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
            stops: [
              [0, 'rgba(255, 115, 0, 0.5)'],
              [1, 'rgba(255, 115, 0, 0.05)']
            ]
          },
          threshold: null
        }
      },
      series: [{
        type: 'area',
        name: 'Puissance totale (MW)',
        data: series
      }],
      tooltip: {
        xDateFormat: '%e %B %Y',
        shared: true,
        useHTML: true,
        headerFormat: '<small>{point.key}</small><br/>',
        pointFormat: '<span style="color:{point.color}">●</span> {series.name}: <b>{point.y:.0f} MW</b><br/>'
      }
    };
  }

  // ─── Données par tranche ──────────────────────────────────────────────────────

  toggleFullPeriod(): void {
    this.fullPeriod = !this.fullPeriod;
    if (this.tranche) {
      this.chartOptions = {};
      this.chargerDonneesTranche(this.tranche);
    }
  }

  chargerDonneesTranche(tranche: string): void {
    this.isTotalMode    = false;
    this.isChartLoading = true;
    this.chartSub?.unsubscribe();

    // En mode fullPeriod, on utilise donnees_daily.json (toujours disponible)
    const source$ = this.fullPeriod
      ? (this.datasetService as any).getDailyRecords({ tranche: [tranche] })
      : (this.datasetService as any).getDatasetAllRecords(
          { tranche: [tranche], heure_fuseau_horaire_europe_paris: ['12'] },
          ['date_et_heure_fuseau_horaire_europe_paris', 'puissance_disponible', 'heure_fuseau_horaire_europe_paris'],
          this.buildWhereCondition(),
          'date_et_heure_fuseau_horaire_europe_paris'
        );

    this.chartSub = source$.subscribe({
      next: (data: any) => {
        this.datasets = { results: data.results || data } as DataSets;
        this.afficherDonnees(this.datasets);
        this.isChartLoading = false;
      },
      error: () => { this.isChartLoading = false; }
    });
  }

  private buildWhereCondition(): string {
    if (!this.dateLimit) return '';
    const center = new Date(this.dateLimit);
    const debut  = new Date(center); debut.setDate(debut.getDate() - 50);
    const fin    = new Date(center); fin.setDate(fin.getDate() + 50);
    return `date_et_heure_fuseau_horaire_europe_paris>"${debut.toISOString()}" AND date_et_heure_fuseau_horaire_europe_paris<"${fin.toISOString()}"`;
  }

  // ─── Centrales & tranches ─────────────────────────────────────────────────────

  private chargerCentrales(): void {
    // Utilise donnees_daily.json — toujours disponible, indépendant de la date
    (this.datasetService as any).getDailyRecords({}).subscribe({
      next: (data: any) => {
        const records: any[] = data.results || data;
        const seen = new Set<string>();
        this.centralesData = records.filter((r: any) => {
          if (!r.centrale || seen.has(r.centrale)) return false;
          seen.add(r.centrale);
          return true;
        });
      },
      error: () => {}
    });
  }

  private chargerTranchesPourCentrale(centrale: string): void {
    this.isChartLoading = true;
    (this.datasetService as any).getDailyRecords({ centrale: [centrale] }).subscribe({
      next: (data: any) => {
        const records: any[] = data.results || data;
        const seen = new Set<string>();
        const tranches = records.filter((r: any) => {
          if (!r.tranche || seen.has(r.tranche)) return false;
          seen.add(r.tranche);
          return true;
        });
        this.selectedCentraleData = { centrale, tranches };
        this.isChartLoading = false;
      },
      error: () => { this.isChartLoading = false; }
    });
  }

  // ─── Events ──────────────────────────────────────────────────────────────────

  onCentraleChange(): void {
    this.tranche = '';
    this.selectedCentraleData = null;
    if (this.selectedCentrale) {
      this.chargerTranchesPourCentrale(this.selectedCentrale);
    } else {
      // Retour à la prod totale si désélection
      this.chargerProductionTotale();
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
      queryParams: { centrale: this.selectedCentrale, tranche: this.tranche, date: this.dateLimit },
      queryParamsHandling: 'merge'
    });
  }

  // ─── Affichage graphique (par tranche) ────────────────────────────────────────

  afficherDonnees(_data: DataSets): void {
    if (!this.datasets.results) return;

    const series: [number, number][] = this.datasets.results.map((item) => {
      const d = new Date(item.date_et_heure_fuseau_horaire_europe_paris);
      d.setUTCHours(item.heure_fuseau_horaire_europe_paris);
      return [d.getTime(), item.puissance_disponible];
    });

    const chartTitle    = this.translate.instant('HISTOGRAM.CHART_TITLE');
    const chartSubtitle = document.ontouchstart === undefined
      ? this.translate.instant('HISTOGRAM.CHART_SUBTITLE')
      : this.translate.instant('HISTOGRAM.CHART_SUBTITLE_TOUCH');
    const yAxisTitle = this.translate.instant('HISTOGRAM.Y_AXIS_TITLE');

    this.chartOptions = {
      chart: { zooming: { type: 'x' }, backgroundColor: '#FFFFFF' },
      title:    { text: chartTitle,    style: { color: '#003366', fontWeight: 'bold' } },
      subtitle: { text: chartSubtitle, style: { color: '#003366' } },
      xAxis: { type: 'datetime', labels: { style: { color: '#003366' } } },
      yAxis: {
        title:  { text: yAxisTitle, style: { color: '#003366' } },
        labels: { style: { color: '#003366' } }
      },
      legend: { enabled: false },
      plotOptions: {
        area: {
          marker: { radius: 4, fillColor: '#003366', lineWidth: 2, lineColor: '#003366' },
          lineWidth: 2,
          color: '#FF7300',
          fillColor: {
            linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
            stops: [
              [0, 'rgba(255, 115, 0, 0.5)'],
              [1, 'rgba(255, 115, 0, 0.1)']
            ]
          },
          threshold: null
        }
      },
      series: [{ type: 'area', name: yAxisTitle, data: series, lineColor: '#FF7300' }],
      tooltip: {
        xDateFormat: '%e %B %Y %H:%M',
        shared: true,
        useHTML: true,
        headerFormat: '<small>{point.key}</small><br/>',
        pointFormat: '<span style="color:{point.color}">●</span> {series.name}: <b>{point.y} MW</b><br/>'
      }
    };

    Highcharts.chart('container', this.chartOptions);
  }
}
