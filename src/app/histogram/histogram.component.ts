// ============================================================
// histogram.component.ts
// Composant graphique de disponibilité des tranches nucléaires.
//
// Deux modes d'affichage :
//   - Mode TOTAL (isTotalMode = true) : agrège la puissance disponible
//     de toutes les tranches françaises sur la période, affiche une
//     courbe de zone unique (area chart).
//   - Mode TRANCHES (isTotalMode = false) : affiche la disponibilité
//     d'une ou plusieurs tranches sélectionnées par l'utilisateur.
//     · 1 tranche → area chart (même style que le mode total).
//     · 2+ tranches → multi-séries lignes avec légende (comparaison).
//
// Persistance d'état via query params :
//   ?centrale=BUGEY&tranche=T1,T2&dateFrom=2025-08-01&dateTo=2025-09-30
//   L'URL est mise à jour à chaque interaction, permettant le partage.
// ============================================================

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

  // ─── État de chargement ───────────────────────────────────────────────────

  // isLoading : vrai pendant le chargement des listes (centrales, tranches, dates).
  isLoading = false;

  // isChartLoading : vrai pendant le chargement des données du graphique.
  // Séparé de isLoading pour pouvoir afficher un spinner uniquement sur
  // la zone graphique sans geler toute l'interface.
  isChartLoading = true;

  // ─── Mode d'affichage ────────────────────────────────────────────────────

  // Vrai si on affiche la disponibilité agrégée de tout le parc nucléaire
  // français (aucune centrale/tranche sélectionnée).
  isTotalMode = false;

  // Drapeau passé à la directive <highcharts-chart [(update)]="updateChart">.
  // Passer à true force Highcharts à re-rendre le graphique avec les nouvelles
  // options. Highcharts-angular le remet à false automatiquement après le rendu.
  updateChart = false;

  // ─── Plage de dates ───────────────────────────────────────────────────────

  // Bornes absolues des données disponibles dans le JSON (calculées au démarrage).
  minDate = '';
  maxDate = '';

  // Bornes de la période sélectionnée par l'utilisateur (format YYYY-MM-DD).
  // Vides = toute la période disponible (isFullPeriod = true).
  dateFrom = '';
  dateTo   = '';

  // ─── Sélection centrale / tranches ───────────────────────────────────────

  // Nom de la centrale sélectionnée dans la liste déroulante (ex: 'BUGEY').
  selectedCentrale = '';

  // Données de la centrale sélectionnée : son nom + la liste de ses tranches
  // (issues de donnees_daily.json via chargerTranchesPourCentrale).
  selectedCentraleData: { centrale: string; tranches: Dispo[] } | null = null;

  // Toutes les centrales disponibles (une entrée dédupliquée par centrale).
  centralesData: Dispo[] = [];

  // Liste des tranches cochées par l'utilisateur pour la comparaison.
  // Ex : ['T1', 'T3']. Vide = mode total.
  selectedTranches: string[] = [];

  // ─── Couleurs des séries du graphique ────────────────────────────────────

  // Palette de couleurs cycliques pour les séries multi-tranches.
  // L'index de chaque tranche dans selectedTranches détermine sa couleur.
  // Le modulo (%) dans getTrancheColor() permet d'avoir plus de 8 tranches
  // sans planter (la couleur boucle).
  private readonly SERIES_COLORS = [
    '#FF7300', '#003366', '#1348d0', '#22c55e', '#a855f7', '#ef4444', '#14b8a6', '#f59e0b'
  ];

  // ─── Abonnements RxJS ────────────────────────────────────────────────────

  // Conteneur d'abonnements secondaires (langue, etc.) — annulés dans ngOnDestroy.
  private subs = new Subscription();

  // Abonnement spécifique au chargement des données du graphique. Séparé
  // pour pouvoir l'annuler avant de lancer une nouvelle requête (évite
  // les réponses hors-ordre lors de changements rapides).
  private chartSub?: Subscription;

  // Cache des données de la dernière requête, pour le re-rendu
  // sans re-requête (ex: changement de langue).
  private totalSeries:    [number, number][]  = [];
  private totalNominal:   number = 0;
  private tranchesData:   { tranche: string; series: [number, number][]; nominal: number }[] = [];

  // ─── Highcharts ──────────────────────────────────────────────────────────

  datasets: DataSets = {} as DataSets;

  // Référence à la bibliothèque Highcharts, passée à la directive
  // <highcharts-chart [Highcharts]="Highcharts">.
  Highcharts: typeof Highcharts = Highcharts;

  // Configuration complète du graphique (mise à jour via updateChart).
  chartOptions: Highcharts.Options = {};

  // ─── Getters (accès template) ─────────────────────────────────────────────

  /** Liste dédupliquée et triée des noms de centrales pour la liste déroulante. */
  get centrales(): string[] {
    return [...new Set(this.centralesData.map(d => d.centrale))];
  }

  /** Liste des tranches disponibles pour la centrale sélectionnée. */
  getTranches(): string[] {
    return this.selectedCentraleData?.tranches.map(d => d.tranche) ?? [];
  }

  /** Vrai si aucune borne de date n'est sélectionnée (pleine période). */
  get isFullPeriod(): boolean {
    return !this.dateFrom && !this.dateTo;
  }

  get isHourlyMode(): boolean {
    const from = this.dateFrom || this.minDate;
    const to   = this.dateTo   || this.maxDate;
    if (!from || !to) return false;
    const days = (new Date(to).getTime() - new Date(from).getTime()) / 86400000;
    return days <= 31;
  }

  /**
   * Retourne la couleur d'une tranche par son index dans selectedTranches.
   * Utilisé pour colorier les puces (color dots) des checkboxes dans le template.
   */
  getTrancheColor(index: number): string {
    return this.SERIES_COLORS[index % this.SERIES_COLORS.length];
  }

  // ─── Constructeur ─────────────────────────────────────────────────────────

  constructor(
    private route: ActivatedRoute,
    private datasetService: DatasetService,
    private router: Router,
    private translate: TranslateService
  ) {
    // Abonnement aux changements de langue : quand l'utilisateur bascule FR/EN,
    // on re-génère les options du graphique (titres, labels) sans recharger les
    // données depuis le JSON (les séries sont déjà en cache dans totalSeries /
    // tranchesData).
    this.subs.add(this.translate.onLangChange.subscribe(() => {
      if (this.isTotalMode) this.chargerProductionTotale();
      else if (this.tranchesData.length > 0) this.afficherDonneesTranches();
    }));
  }

  // ─── Cycle de vie Angular ─────────────────────────────────────────────────

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.chartSub?.unsubscribe();
  }

  /**
   * Initialisation du composant :
   *   1. Lecture des query params pour restaurer l'état (URL partageable).
   *   2. Chargement de la liste des centrales (populate la liste déroulante).
   *   3. Si une centrale est dans l'URL, chargement de ses tranches.
   *   4. Chargement des limites de date (qui déclenchera ensuite le graphique).
   */
  ngOnInit(): void {
    const qp = this.route.snapshot.queryParams;

    // Restauration de la centrale depuis l'URL
    this.selectedCentrale = qp['centrale'] || '';

    // Restauration des tranches depuis l'URL : ?tranche=T1,T2 → ['T1', 'T2']
    const trancheParam    = qp['tranche'] || '';
    this.selectedTranches = trancheParam
      ? trancheParam.split(',').map((t: string) => t.trim()).filter(Boolean)
      : [];

    // Restauration de la plage de dates depuis l'URL
    this.dateFrom = qp['dateFrom'] || '';
    this.dateTo   = qp['dateTo']   || '';

    // Cas particulier : si on arrive depuis la carte avec ?date=YYYY-MM-DD
    // (sans plage explicite), on centre une fenêtre de ±30 jours autour de
    // cette date pour afficher le contexte autour du jour sélectionné.
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

    // loadDateLimits() charge les bornes puis déclenche le premier graphique
    this.loadDateLimits();
  }

  // ─── Bornes de données ────────────────────────────────────────────────────

  /**
   * Charge les dates min et max disponibles dans les données, puis
   * ajuste dateFrom / dateTo si elles sont hors plage.
   * En dernier lieu, déclenche le chargement du graphique
   * (tranches ou total selon l'état courant).
   */
  private loadDateLimits(): void {
    this.isLoading = true;
    this.subs.add(
      this.datasetService.getEventDateRange().subscribe(range => {
        this.minDate = range.min;
        this.maxDate = range.max;
        if (this.dateFrom && this.dateFrom < this.minDate) this.dateFrom = this.minDate;
        if (this.dateTo   && this.dateTo   > this.maxDate) this.dateTo   = this.maxDate;
        this.isLoading = false;
        this.selectedTranches.length > 0 ? this.chargerDonneesTranches() : this.chargerProductionTotale();
      })
    );
  }

  // ─── Mode total (parc France entier) ─────────────────────────────────────

  /**
   * Charge la puissance disponible agrégée de tout le parc français
   * sur la période sélectionnée.
   *
   * Algorithme :
   *   - Récupère tous les enregistrements (aucun filtre tranche/centrale)
   *     sur la période (clause WHERE sur les dates).
   *   - Agrège par timestamp (Map<timestamp, sommePuissance>) pour avoir
   *     un seul point par instant (somme de toutes les tranches).
   *   - Trie par timestamp croissant → série temporelle prête pour Highcharts.
   */
  chargerProductionTotale(): void {
    this.isTotalMode    = true;
    this.isChartLoading = true;
    this.chartSub?.unsubscribe(); // annule le chargement précédent si en cours

    const from = this.dateFrom || this.minDate;
    const to   = this.dateTo   || this.maxDate;
    this.chartSub = this.datasetService.getTotalProductionSeries(from, to).subscribe({
      next: ({ series, totalNominal }) => {
        this.totalSeries  = series;
        this.totalNominal = totalNominal;
        this.afficherProductionTotale(series);
        setTimeout(() => { this.isChartLoading = false; }, 0);
      },
      error: () => { this.isChartLoading = false; }
    });
  }

  /**
   * Construit et applique les options Highcharts pour le graphique de
   * production totale (area chart monochrome orange).
   * Les textes (titre, sous-titre, labels) sont traduits dynamiquement
   * via translate.instant() pour respecter la langue active.
   */
  private afficherProductionTotale(series: [number, number][]): void {
    const chartTitle    = this.translate.instant('HISTOGRAM.TOTAL_CHART_TITLE');
    const chartSubtitle = this.translate.instant('HISTOGRAM.TOTAL_CHART_SUBTITLE');
    const yAxisTitle    = this.translate.instant('HISTOGRAM.Y_AXIS_TITLE');
    const seriesName    = this.translate.instant('HISTOGRAM.TOTAL_SERIES_NAME');
    const nominalLabel  = this.translate.instant('HISTOGRAM.NOMINAL_LABEL');

    const nominalPlotLine: Highcharts.YAxisPlotLinesOptions[] = this.totalNominal > 0 ? [{
      value:     this.totalNominal,
      color:     '#12356D',
      dashStyle: 'Dash',
      width:     1.5,
      label: {
        text:  `${nominalLabel}: ${Math.round(this.totalNominal).toLocaleString()} MW`,
        align: 'right',
        style: { color: '#12356D', fontSize: '11px' }
      }
    }] : [];

    this.chartOptions = {
      chart: { zooming: { type: 'x' }, backgroundColor: '#FFFFFF' },
      title:    { text: chartTitle,    style: { color: '#003366', fontWeight: 'bold' } },
      subtitle: { text: chartSubtitle, style: { color: '#003366' } },
      xAxis: { type: 'datetime', labels: { style: { color: '#003366' } } },
      yAxis: {
        title:     { text: yAxisTitle, style: { color: '#003366' } },
        labels:    { style: { color: '#003366' } },
        min:       0,
        plotLines: nominalPlotLine
      },
      legend: { enabled: false },
      plotOptions: {
        area: {
          marker:    { radius: 2 },
          lineWidth: 2,
          color:     '#FF7300',
          fillColor: {
            linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
            stops: [[0, 'rgba(255,115,0,0.5)'], [1, 'rgba(255,115,0,0.05)']]
          },
          threshold: 0
        }
      },
      series: [{ type: 'area', name: seriesName, data: series }],
      tooltip: {
        xDateFormat:  '%e %B %Y %H:%M',
        shared:       true,
        useHTML:      true,
        headerFormat: '<small>{point.key}</small><br/>',
        pointFormat:  '● {series.name}: <b>{point.y:.0f} MW</b><br/>'
      }
    };
    this.updateChart = true;
  }

  // ─── Mode multi-tranches ──────────────────────────────────────────────────

  /**
   * Charge les données horaires pour toutes les tranches sélectionnées
   * en une seule requête (filtre { tranche: selectedTranches }).
   *
   * Algorithme :
   *   - Récupère tous les enregistrements dont la tranche est dans selectedTranches.
   *   - Groupe par tranche dans une Map<nomTranche, [[timestamp, puissance], ...]>.
   *   - Construit tranchesData en respectant l'ordre de selectedTranches
   *     (pour que les couleurs soient cohérentes avec les cases à cocher).
   *   - Trie chaque série par timestamp croissant.
   */
  chargerDonneesTranches(): void {
    this.isTotalMode    = false;
    this.isChartLoading = true;
    this.chartSub?.unsubscribe();

    const from2 = this.dateFrom || this.minDate;
    const to2   = this.dateTo   || this.maxDate;
    this.chartSub = this.datasetService.getTimeSeriesForTranches(this.selectedTranches, from2, to2).subscribe({
      next: (tranchesData) => {
        this.tranchesData = tranchesData;
        this.afficherDonneesTranches();
        setTimeout(() => { this.isChartLoading = false; }, 0);
      },
      error: () => { this.isChartLoading = false; }
    });
  }

  /**
   * Construit les options Highcharts pour l'affichage mono ou multi-tranches.
   *
   * Mode 1 tranche → area chart (même style que le total, couleur orange).
   * Mode N tranches → N séries de type 'line', chacune avec sa propre couleur
   *                   de SERIES_COLORS, légende activée pour identifier les tranches.
   */
  private afficherDonneesTranches(): void {
    if (this.tranchesData.length === 0) return;

    const isSingle = this.tranchesData.length === 1;

    const chartTitle = isSingle
      ? this.translate.instant('HISTOGRAM.CHART_TITLE')
      : this.translate.instant('HISTOGRAM.COMPARE_TITLE');

    // Sous-titre adaptatif : sur écran tactile (mobile), on indique que
    // le pinch-to-zoom est disponible à la place du zoom par sélection.
    // document.ontouchstart === undefined → appareil non tactile
    const chartSubtitle = document.ontouchstart === undefined
      ? this.translate.instant('HISTOGRAM.CHART_SUBTITLE')
      : this.translate.instant('HISTOGRAM.CHART_SUBTITLE_TOUCH');

    const yAxisTitle = this.translate.instant('HISTOGRAM.Y_AXIS_TITLE');

    // Construction des séries Highcharts
    const nominalLabel = this.translate.instant('HISTOGRAM.NOMINAL_LABEL');

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

    // Série en tirets pour la puissance nominale de chaque tranche
    const nominalSeries: Highcharts.SeriesOptionsType[] = this.tranchesData
      .filter(td => td.nominal > 0 && td.series.length >= 2)
      .map((td, i) => {
        const color = this.SERIES_COLORS[i % this.SERIES_COLORS.length];
        const start = td.series[0][0];
        const end   = td.series[td.series.length - 1][0];
        return {
          type:               'line',
          name:               isSingle ? `${nominalLabel} (${td.nominal} MW)` : `${td.tranche} — ${nominalLabel}`,
          data:               [[start, td.nominal], [end, td.nominal]] as [number, number][],
          color,
          dashStyle:          'Dash',
          lineWidth:          1.5,
          marker:             { enabled: false },
          enableMouseTracking: false,
          showInLegend:       true
        } as Highcharts.SeriesLineOptions;
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
      legend: { enabled: true, itemStyle: { color: '#003366' } },
      series: [...series, ...nominalSeries],
      tooltip: {
        xDateFormat:  '%e %B %Y %H:%M',
        shared:       true,
        useHTML:      true,
        headerFormat: '<small>{point.key}</small><br/>',
        // shared: true → le tooltip affiche toutes les séries sur le même instant
        pointFormat: '<span style="color:{point.color}">●</span> {series.name}: <b>{point.y:.0f} MW</b><br/>'
      }
    };
    this.updateChart = true;
  }

  // ─── Construction de la clause WHERE ─────────────────────────────────────

  /**
   * Construit la clause WHERE à passer à getDatasetAllRecords pour
   * filtrer les enregistrements sur la plage de dates sélectionnée.
   *
   * Format attendu par applyWhere() dans dataset.service.ts :
   *   'date_et_heure_fuseau_horaire_europe_paris>="2025-08-01T00:00:00"
   *    AND date_et_heure_fuseau_horaire_europe_paris<="2025-09-30T23:59:59"'
   *
   * Si aucune borne n'est sélectionnée, retourne '' (pas de filtrage de date).
   */
  private buildWhereCondition(): string {
    const parts: string[] = [];
    if (this.dateFrom) parts.push(`date_et_heure_fuseau_horaire_europe_paris>="${this.dateFrom}T00:00:00"`);
    if (this.dateTo)   parts.push(`date_et_heure_fuseau_horaire_europe_paris<="${this.dateTo}T23:59:59"`);
    return parts.join(' AND ');
  }

  // ─── Chargement des listes (centrales & tranches) ─────────────────────────

  /**
   * Charge la liste de toutes les centrales disponibles depuis
   * donnees_daily.json (plus léger que donnees.json).
   * Déduplique par nom de centrale via un Set pour la liste déroulante.
   */
  private chargerCentrales(): void {
    (this.datasetService as any).getDailyRecords({}).subscribe({
      next: (data: any) => {
        const records: any[] = data.results || data;
        const seen = new Set<string>();
        // On ne garde que le premier enregistrement par centrale (déduplique)
        this.centralesData = records.filter((r: any) => {
          if (!r.centrale || seen.has(r.centrale)) return false;
          seen.add(r.centrale);
          return true;
        });
      },
      error: () => {} // silencieux : la liste restera vide
    });
  }

  /**
   * Charge la liste des tranches pour une centrale donnée.
   * Filtre sur donnees_daily.json (plus léger, granularité suffisante
   * pour les listes de sélection).
   * Déduplique par nom de tranche (T1, T2, etc.).
   */
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

  // ─── Gestionnaires d'événements UI ───────────────────────────────────────

  /**
   * Appelé quand l'utilisateur change la centrale sélectionnée.
   * Réinitialise les tranches et recharge la liste des tranches
   * pour la nouvelle centrale. Si aucune centrale → mode total.
   */
  onCentraleChange(): void {
    this.selectedTranches     = [];
    this.tranchesData         = [];
    this.selectedCentraleData = null;
    if (this.selectedCentrale) {
      this.chargerTranchesPourCentrale(this.selectedCentrale);
    } else {
      // Plus de centrale sélectionnée → retour au graphique total France
      this.chargerProductionTotale();
    }
    this.updateUrlParams();
  }

  /**
   * Appelé quand l'utilisateur coche ou décoche une tranche.
   * Met à jour selectedTranches par immutabilité (spread) pour déclencher
   * la détection de changements Angular proprement.
   * Recharge le graphique avec la nouvelle sélection.
   */
  onTrancheToggle(tranche: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      // Ajout : crée un nouveau tableau (immutabilité → change detection)
      this.selectedTranches = [...this.selectedTranches, tranche];
    } else {
      // Suppression
      this.selectedTranches = this.selectedTranches.filter(t => t !== tranche);
    }

    if (this.selectedTranches.length > 0) {
      this.chargerDonneesTranches();
    } else {
      // Plus aucune tranche cochée → retour au total
      this.chargerProductionTotale();
    }
    this.updateUrlParams();
  }

  /**
   * Appelé quand l'utilisateur modifie dateFrom ou dateTo.
   * Validation simple : dateFrom ne peut pas dépasser dateTo.
   */
  onDateChange(): void {
    if (this.dateFrom && this.dateTo && this.dateFrom > this.dateTo) {
      this.dateTo = this.dateFrom; // aligne dateTo sur dateFrom
    }
    this.selectedTranches.length > 0 ? this.chargerDonneesTranches() : this.chargerProductionTotale();
    this.updateUrlParams();
  }

  /** Remet les bornes de date à vide (pleine période) et recharge. */
  resetToFullPeriod(): void {
    this.dateFrom = '';
    this.dateTo   = '';
    this.selectedTranches.length > 0 ? this.chargerDonneesTranches() : this.chargerProductionTotale();
    this.updateUrlParams();
  }

  /**
   * Met à jour les query params de l'URL pour refléter l'état courant.
   * null → supprime le param de l'URL (URL plus propre quand inutilisé).
   * queryParamsHandling: 'merge' conserve les éventuels autres params déjà présents.
   */
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

  // ─── Export CSV ──────────────────────────────────────────────────────────

  /**
   * Exporte les données actuellement affichées dans le graphique en CSV.
   * Trois comportements selon le mode :
   *
   *   1. Mode total → 2 colonnes : Date, Puissance totale France (MW).
   *   2. Mode 1 tranche → 2 colonnes : Date, Puissance de la tranche (MW).
   *   3. Mode N tranches → N+1 colonnes : Date + une colonne par tranche.
   *      Les timestamps sont unifiés (union des timestamps de toutes les séries)
   *      et triés. Les valeurs manquantes sont laissées vides.
   *
   * Le fichier est généré côté client (Blob + URL.createObjectURL) sans
   * aucun appel serveur. Le BOM UTF-8 ('﻿') en début de fichier garantit
   * que Excel détecte correctement l'encodage UTF-8 sur Windows.
   */
  exportCSV(): void {
    if (this.isTotalMode) {
      // Mode total : une ligne par timestamp
      const lines = ['Date,Puissance disponible (MW)'];
      for (const [ts, mw] of this.totalSeries) {
        lines.push(`${new Date(ts).toISOString().split('T')[0]},${mw}`);
      }
      this.downloadCSV(lines.join('\n'), 'disponibilite_totale_france.csv');

    } else if (this.tranchesData.length === 1) {
      // Mode 1 tranche : une ligne par timestamp
      const lines = ['Date,Puissance disponible (MW)'];
      for (const [ts, mw] of this.tranchesData[0].series) {
        lines.push(`${new Date(ts).toISOString().split('T')[0]},${mw}`);
      }
      this.downloadCSV(lines.join('\n'), `disponibilite_${this.tranchesData[0].tranche}.csv`);

    } else if (this.tranchesData.length > 1) {
      // Mode comparaison : union des timestamps → matrice
      const allTs = new Set<number>();
      for (const td of this.tranchesData) td.series.forEach(([ts]) => allTs.add(ts));
      const sortedTs = [...allTs].sort((a, b) => a - b);

      // En-tête : Date, T1, T2, ...
      const header = ['Date', ...this.tranchesData.map(td => td.tranche)].join(',');
      const lines = [header];

      for (const ts of sortedTs) {
        const dateStr = new Date(ts).toISOString().split('T')[0];
        // Pour chaque tranche, chercher la valeur à ce timestamp (ou '' si absente)
        const vals = this.tranchesData.map(td => {
          const pt = td.series.find(([t]) => t === ts);
          return pt !== undefined ? pt[1] : '';
        });
        lines.push([dateStr, ...vals].join(','));
      }
      this.downloadCSV(lines.join('\n'), 'disponibilite_comparaison.csv');
    }
  }

  /**
   * Crée un lien de téléchargement fictif, clique dessus programmatiquement,
   * puis libère l'URL objet (URL.revokeObjectURL) pour éviter les fuites mémoire.
   *
   * '﻿' (U+FEFF) : BOM UTF-8 ajouté en tête du fichier pour assurer
   * la compatibilité avec Excel sur Windows (sans lui Excel interprète
   * souvent les fichiers CSV UTF-8 en Latin-1).
   */
  private downloadCSV(content: string, filename: string): void {
    const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url); // libère la mémoire après le téléchargement
  }
}
