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

  isLoading       = false;
  isChartLoading  = true;   // true by default: prevents rendering with empty chartOptions
  isTotalMode     = false;
  updateChart     = false;

  // Bornes absolues (pour les min/max des inputs)
  minDate = '';
  maxDate = '';

  // Intervalle sélectionné par l'utilisateur
  dateFrom = '';
  dateTo   = '';

  selectedCentrale      = '';
  selectedCentraleData: { centrale: string; tranches: Dispo[] } | null = null;
  centralesData: Dispo[] = [];

  private subs       = new Subscription();
  private chartSub?: Subscription;
  private totalSeries: [number, number][] = [];

  Highcharts: typeof Highcharts = Highcharts;
  chartOptions: Highcharts.Options = {};
  datasets: DataSets = {} as DataSets;

  get centrales(): string[] {
    return [...new Set(this.centralesData.map(d => d.centrale))];
  }

  getTranches(): string[] {
    return this.selectedCentraleData?.tranches.map(d => d.tranche) ?? [];
  }

  get isFullPeriod(): boolean {
    return !this.dateFrom && !this.dateTo;
  }

  constructor(
    private route: ActivatedRoute,
    private datasetService: DatasetService,
    private router: Router,
    private translate: TranslateService
  ) {
    this.subs.add(this.translate.onLangChange.subscribe(() => {
      if (this.isTotalMode) this.chargerProductionTotale();
      else if (this.datasets.results?.length > 0) this.afficherDonnees();
    }));
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.chartSub?.unsubscribe();
  }

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParams;

    this.selectedCentrale = qp['centrale'] || '';
    this.tranche          = qp['tranche']  || '';
    this.dateFrom         = qp['dateFrom'] || '';
    this.dateTo           = qp['dateTo']   || '';

    // Si on vient de la carte avec une date unique, construire un intervalle ±30j
    if (qp['date'] && !this.dateFrom) {
      const center = new Date(qp['date']);
      const from   = new Date(center); from.setDate(from.getDate() - 30);
      const to     = new Date(center); to.setDate(to.getDate() + 30);
      this.dateFrom = from.toISOString().split('T')[0];
      this.dateTo   = to.toISOString().split('T')[0];
    }

    this.chargerCentrales();

    if (this.selectedCentrale) {
      this.chargerTranchesPourCentrale(this.selectedCentrale);
    }

    this.loadDateLimits();
  }

  // ─── Bornes de données ────────────────────────────────────────────────────────

  private loadDateLimits(): void {
    this.isLoading = true;
    (this.datasetService as any).getDailyDateLimits().subscribe({
      next: (data: any) => {
        const results = data.results || data;
        try {
          this.minDate = results[0]['min(date_et_heure_fuseau_horaire_europe_paris)'].split('T')[0];
          this.maxDate = results[0]['max(date_et_heure_fuseau_horaire_europe_paris)'].split('T')[0];
        } catch {
          this.minDate = '2020-01-01';
          this.maxDate = '2030-12-31';
        }

        // Clamp dateFrom/dateTo dans les bornes
        if (this.dateFrom && this.dateFrom < this.minDate) this.dateFrom = this.minDate;
        if (this.dateTo   && this.dateTo   > this.maxDate) this.dateTo   = this.maxDate;

        this.isLoading = false;
        this.tranche ? this.chargerDonneesTranche(this.tranche) : this.chargerProductionTotale();
      },
      error: () => { this.isLoading = false; }
    });
  }

  // ─── Disponibilité totale France ─────────────────────────────────────────────────

  chargerProductionTotale(): void {
    this.isTotalMode   = true;
    this.isChartLoading = true;
    this.chartSub?.unsubscribe();

    this.chartSub = (this.datasetService as any)
      .getDailyRecords({}, this.buildWhereCondition())
      .subscribe({
        next: (data: any) => {
          const records: any[] = data.results || data;
          const byDate = new Map<number, number>();
          for (const r of records) {
            const t = new Date(r.date_et_heure_fuseau_horaire_europe_paris).getTime();
            byDate.set(t, (byDate.get(t) || 0) + (r.puissance_disponible || 0));
          }
          const series: [number, number][] = [...byDate.entries()].sort((a, b) => a[0] - b[0]);
          this.afficherProductionTotale(series);
          Promise.resolve().then(() => { this.isChartLoading = false; });
        },
        error: () => { this.isChartLoading = false; }
      });
  }

  private afficherProductionTotale(series: [number, number][]): void {
    this.totalSeries = series;
    const chartTitle    = this.translate.instant('HISTOGRAM.TOTAL_CHART_TITLE');
    const chartSubtitle = this.translate.instant('HISTOGRAM.TOTAL_CHART_SUBTITLE');
    const yAxisTitle    = this.translate.instant('HISTOGRAM.Y_AXIS_TITLE');
    const seriesName    = this.translate.instant('HISTOGRAM.TOTAL_SERIES_NAME');

    this.chartOptions = {
      chart: { zooming: { type: 'x' }, backgroundColor: '#FFFFFF' },
      title:    { text: chartTitle,    style: { color: '#003366', fontWeight: 'bold' } },
      subtitle: { text: chartSubtitle, style: { color: '#003366' } },
      xAxis: { type: 'datetime', labels: { style: { color: '#003366' } } },
      yAxis: {
        title: { text: yAxisTitle, style: { color: '#003366' } },
        labels: { style: { color: '#003366' } },
        min: 0
      },
      legend: { enabled: false },
      plotOptions: {
        area: {
          marker: { radius: 2 },
          lineWidth: 2,
          color: '#FF7300',
          fillColor: {
            linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
            stops: [[0, 'rgba(255,115,0,0.5)'], [1, 'rgba(255,115,0,0.05)']]
          },
          threshold: 0
        }
      },
      series: [{ type: 'area', name: seriesName, data: series }],
      tooltip: {
        xDateFormat: '%e %B %Y',
        shared: true, useHTML: true,
        headerFormat: '<small>{point.key}</small><br/>',
        pointFormat: '● {series.name}: <b>{point.y:.0f} MW</b><br/>'
      }
    };
    this.updateChart = true;
  }

  // ─── Données par tranche ──────────────────────────────────────────────────────

  chargerDonneesTranche(tranche: string): void {
    this.isTotalMode   = false;
    this.isChartLoading = true;
    this.chartSub?.unsubscribe();

    this.chartSub = (this.datasetService as any)
      .getDailyRecords({ tranche: [tranche] }, this.buildWhereCondition())
      .subscribe({
        next: (data: any) => {
          this.datasets = { results: data.results || data } as DataSets;
          this.afficherDonnees();
          Promise.resolve().then(() => { this.isChartLoading = false; });
        },
        error: () => { this.isChartLoading = false; }
      });
  }

  private buildWhereCondition(): string {
    const parts: string[] = [];
    if (this.dateFrom) parts.push(`date_et_heure_fuseau_horaire_europe_paris>="${this.dateFrom}T00:00:00"`);
    if (this.dateTo)   parts.push(`date_et_heure_fuseau_horaire_europe_paris<="${this.dateTo}T23:59:59"`);
    return parts.join(' AND ');
  }

  // ─── Centrales & tranches ─────────────────────────────────────────────────────

  private chargerCentrales(): void {
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
      },
      error: () => {}
    });
  }

  // ─── Events UI ───────────────────────────────────────────────────────────────

  onCentraleChange(): void {
    this.tranche = '';
    this.selectedCentraleData = null;
    if (this.selectedCentrale) {
      this.chargerTranchesPourCentrale(this.selectedCentrale);
    } else {
      this.chargerProductionTotale();
    }
    this.updateUrlParams();
  }

  onTrancheChange(): void {
    if (this.tranche) {
      this.chargerDonneesTranche(this.tranche);
      this.updateUrlParams();
    }
  }

  onDateChange(): void {
    // Garantir dateFrom <= dateTo
    if (this.dateFrom && this.dateTo && this.dateFrom > this.dateTo) {
      this.dateTo = this.dateFrom;
    }
    this.tranche ? this.chargerDonneesTranche(this.tranche) : this.chargerProductionTotale();
    this.updateUrlParams();
  }

  resetToFullPeriod(): void {
    this.dateFrom = '';
    this.dateTo   = '';
    this.tranche ? this.chargerDonneesTranche(this.tranche) : this.chargerProductionTotale();
    this.updateUrlParams();
  }

  private updateUrlParams(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        centrale: this.selectedCentrale,
        tranche:  this.tranche,
        dateFrom: this.dateFrom || null,
        dateTo:   this.dateTo   || null,
      },
      queryParamsHandling: 'merge'
    });
  }

  // ─── Affichage graphique par tranche ─────────────────────────────────────────

  // ─── Export CSV ──────────────────────────────────────────────────────────────

  exportCSV(): void {
    if (this.isTotalMode) {
      const lines = ['Date,Puissance disponible (MW)'];
      for (const [ts, mw] of this.totalSeries) {
        lines.push(`${new Date(ts).toISOString().split('T')[0]},${mw}`);
      }
      this.downloadCSV(lines.join('\n'), 'disponibilite_totale_france.csv');
    } else if (this.datasets.results?.length > 0) {
      const lines = ['Date,Heure,Centrale,Tranche,Puissance disponible (MW)'];
      for (const r of this.datasets.results) {
        const date = (r.date_et_heure_fuseau_horaire_europe_paris ?? '').split('T')[0];
        lines.push(`${date},${r.heure_fuseau_horaire_europe_paris ?? ''},${r.centrale ?? ''},${r.tranche ?? ''},${r.puissance_disponible ?? ''}`);
      }
      this.downloadCSV(lines.join('\n'), `disponibilite_${this.tranche || 'data'}.csv`);
    }
  }

  private downloadCSV(content: string, filename: string): void {
    const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  afficherDonnees(): void {
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
        labels: { style: { color: '#003366' } },
        min: 0
      },
      legend: { enabled: false },
      plotOptions: {
        area: {
          marker: { radius: 4, fillColor: '#003366', lineWidth: 2, lineColor: '#003366' },
          lineWidth: 2,
          color: '#FF7300',
          fillColor: {
            linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
            stops: [[0, 'rgba(255,115,0,0.5)'], [1, 'rgba(255,115,0,0.1)']]
          },
          threshold: 0
        }
      },
      series: [{ type: 'area', name: yAxisTitle, data: series, lineColor: '#FF7300' }],
      tooltip: {
        xDateFormat: '%e %B %Y',
        shared: true, useHTML: true,
        headerFormat: '<small>{point.key}</small><br/>',
        pointFormat: '<span style="color:{point.color}">●</span> {series.name}: <b>{point.y} MW</b><br/>'
      }
    };
    this.updateChart = true;
  }
}
