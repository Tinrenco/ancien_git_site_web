import { Component, OnDestroy, OnInit } from '@angular/core';
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

  isLoading       = false;
  isChartLoading  = true;
  isTotalMode     = false;
  updateChart     = false;

  minDate = '';
  maxDate = '';
  dateFrom = '';
  dateTo   = '';

  selectedCentrale      = '';
  selectedCentraleData: { centrale: string; tranches: Dispo[] } | null = null;
  centralesData: Dispo[] = [];

  selectedTranches: string[] = [];

  private readonly SERIES_COLORS = [
    '#FF7300', '#003366', '#1348d0', '#22c55e', '#a855f7', '#ef4444', '#14b8a6', '#f59e0b'
  ];

  private subs       = new Subscription();
  private chartSub?: Subscription;
  private totalSeries: [number, number][] = [];
  private tranchesData: { tranche: string; series: [number, number][] }[] = [];

  datasets: DataSets = {} as DataSets;

  Highcharts: typeof Highcharts = Highcharts;
  chartOptions: Highcharts.Options = {};

  get centrales(): string[] {
    return [...new Set(this.centralesData.map(d => d.centrale))];
  }

  getTranches(): string[] {
    return this.selectedCentraleData?.tranches.map(d => d.tranche) ?? [];
  }

  get isFullPeriod(): boolean {
    return !this.dateFrom && !this.dateTo;
  }

  getTrancheColor(index: number): string {
    return this.SERIES_COLORS[index % this.SERIES_COLORS.length];
  }

  constructor(
    private route: ActivatedRoute,
    private datasetService: DatasetService,
    private router: Router,
    private translate: TranslateService
  ) {
    this.subs.add(this.translate.onLangChange.subscribe(() => {
      if (this.isTotalMode) this.chargerProductionTotale();
      else if (this.tranchesData.length > 0) this.afficherDonneesTranches();
    }));
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.chartSub?.unsubscribe();
  }

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParams;

    this.selectedCentrale = qp['centrale'] || '';
    const trancheParam    = qp['tranche']  || '';
    this.selectedTranches = trancheParam
      ? trancheParam.split(',').map((t: string) => t.trim()).filter(Boolean)
      : [];
    this.dateFrom = qp['dateFrom'] || '';
    this.dateTo   = qp['dateTo']   || '';

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

        if (this.dateFrom && this.dateFrom < this.minDate) this.dateFrom = this.minDate;
        if (this.dateTo   && this.dateTo   > this.maxDate) this.dateTo   = this.maxDate;

        this.isLoading = false;
        this.selectedTranches.length > 0 ? this.chargerDonneesTranches() : this.chargerProductionTotale();
      },
      error: () => { this.isLoading = false; }
    });
  }

  // ─── Disponibilité totale France ─────────────────────────────────────────────

  chargerProductionTotale(): void {
    this.isTotalMode    = true;
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
          this.totalSeries = series;
          this.afficherProductionTotale(series);
          Promise.resolve().then(() => { this.isChartLoading = false; });
        },
        error: () => { this.isChartLoading = false; }
      });
  }

  private afficherProductionTotale(series: [number, number][]): void {
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

  // ─── Données multi-tranches ───────────────────────────────────────────────────

  chargerDonneesTranches(): void {
    this.isTotalMode    = false;
    this.isChartLoading = true;
    this.chartSub?.unsubscribe();

    this.chartSub = (this.datasetService as any)
      .getDailyRecords({ tranche: this.selectedTranches }, this.buildWhereCondition())
      .subscribe({
        next: (data: any) => {
          const records: any[] = data.results || data;
          this.datasets = { results: records } as DataSets;

          const byTranche = new Map<string, [number, number][]>();
          for (const r of records) {
            if (!byTranche.has(r.tranche)) byTranche.set(r.tranche, []);
            const d = new Date(r.date_et_heure_fuseau_horaire_europe_paris);
            d.setUTCHours(r.heure_fuseau_horaire_europe_paris);
            byTranche.get(r.tranche)!.push([d.getTime(), r.puissance_disponible]);
          }

          this.tranchesData = this.selectedTranches
            .filter(t => byTranche.has(t))
            .map(t => ({
              tranche: t,
              series: (byTranche.get(t) || []).sort((a, b) => a[0] - b[0])
            }));

          this.afficherDonneesTranches();
          Promise.resolve().then(() => { this.isChartLoading = false; });
        },
        error: () => { this.isChartLoading = false; }
      });
  }

  private afficherDonneesTranches(): void {
    if (this.tranchesData.length === 0) return;

    const isSingle = this.tranchesData.length === 1;

    const chartTitle = isSingle
      ? this.translate.instant('HISTOGRAM.CHART_TITLE')
      : this.translate.instant('HISTOGRAM.COMPARE_TITLE');
    const chartSubtitle = document.ontouchstart === undefined
      ? this.translate.instant('HISTOGRAM.CHART_SUBTITLE')
      : this.translate.instant('HISTOGRAM.CHART_SUBTITLE_TOUCH');
    const yAxisTitle = this.translate.instant('HISTOGRAM.Y_AXIS_TITLE');

    const series: Highcharts.SeriesOptionsType[] = this.tranchesData.map((td, i) => {
      const color = this.SERIES_COLORS[i % this.SERIES_COLORS.length];
      if (isSingle) {
        return {
          type: 'area',
          name: td.tranche,
          data: td.series,
          lineColor: color,
          color,
          fillColor: {
            linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
            stops: [[0, 'rgba(255,115,0,0.5)'], [1, 'rgba(255,115,0,0.1)']] as [number, string][]
          },
          marker: { radius: 4, fillColor: '#003366', lineWidth: 2, lineColor: '#003366' }
        } as Highcharts.SeriesAreaOptions;
      } else {
        return {
          type: 'line',
          name: td.tranche,
          data: td.series,
          color,
          lineWidth: 2,
          marker: { radius: 3, fillColor: color, lineWidth: 1, lineColor: color }
        } as Highcharts.SeriesLineOptions;
      }
    });

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
      legend: { enabled: !isSingle, itemStyle: { color: '#003366' } },
      series,
      tooltip: {
        xDateFormat: '%e %B %Y',
        shared: true, useHTML: true,
        headerFormat: '<small>{point.key}</small><br/>',
        pointFormat: '<span style="color:{point.color}">●</span> {series.name}: <b>{point.y:.0f} MW</b><br/>'
      }
    };
    this.updateChart = true;
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
    this.selectedTranches = [];
    this.tranchesData = [];
    this.selectedCentraleData = null;
    if (this.selectedCentrale) {
      this.chargerTranchesPourCentrale(this.selectedCentrale);
    } else {
      this.chargerProductionTotale();
    }
    this.updateUrlParams();
  }

  onTrancheToggle(tranche: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      this.selectedTranches = [...this.selectedTranches, tranche];
    } else {
      this.selectedTranches = this.selectedTranches.filter(t => t !== tranche);
    }

    if (this.selectedTranches.length > 0) {
      this.chargerDonneesTranches();
    } else {
      this.chargerProductionTotale();
    }
    this.updateUrlParams();
  }

  onDateChange(): void {
    if (this.dateFrom && this.dateTo && this.dateFrom > this.dateTo) {
      this.dateTo = this.dateFrom;
    }
    this.selectedTranches.length > 0 ? this.chargerDonneesTranches() : this.chargerProductionTotale();
    this.updateUrlParams();
  }

  resetToFullPeriod(): void {
    this.dateFrom = '';
    this.dateTo   = '';
    this.selectedTranches.length > 0 ? this.chargerDonneesTranches() : this.chargerProductionTotale();
    this.updateUrlParams();
  }

  private updateUrlParams(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        centrale: this.selectedCentrale || null,
        tranche:  this.selectedTranches.length > 0 ? this.selectedTranches.join(',') : null,
        dateFrom: this.dateFrom || null,
        dateTo:   this.dateTo   || null,
      },
      queryParamsHandling: 'merge'
    });
  }

  // ─── Export CSV ──────────────────────────────────────────────────────────────

  exportCSV(): void {
    if (this.isTotalMode) {
      const lines = ['Date,Puissance disponible (MW)'];
      for (const [ts, mw] of this.totalSeries) {
        lines.push(`${new Date(ts).toISOString().split('T')[0]},${mw}`);
      }
      this.downloadCSV(lines.join('\n'), 'disponibilite_totale_france.csv');
    } else if (this.tranchesData.length === 1) {
      const lines = ['Date,Puissance disponible (MW)'];
      for (const [ts, mw] of this.tranchesData[0].series) {
        lines.push(`${new Date(ts).toISOString().split('T')[0]},${mw}`);
      }
      this.downloadCSV(lines.join('\n'), `disponibilite_${this.tranchesData[0].tranche}.csv`);
    } else if (this.tranchesData.length > 1) {
      const allTs = new Set<number>();
      for (const td of this.tranchesData) td.series.forEach(([ts]) => allTs.add(ts));
      const sortedTs = [...allTs].sort((a, b) => a - b);
      const header = ['Date', ...this.tranchesData.map(td => td.tranche)].join(',');
      const lines = [header];
      for (const ts of sortedTs) {
        const dateStr = new Date(ts).toISOString().split('T')[0];
        const vals = this.tranchesData.map(td => {
          const pt = td.series.find(([t]) => t === ts);
          return pt !== undefined ? pt[1] : '';
        });
        lines.push([dateStr, ...vals].join(','));
      }
      this.downloadCSV(lines.join('\n'), 'disponibilite_comparaison.csv');
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
}
