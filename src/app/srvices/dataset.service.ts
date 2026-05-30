// ============================================================
// dataset.service.ts
// Service Angular central pour l'accès aux données de disponibilité
// du parc nucléaire EDF.
//
// Rôle principal :
//   - Charger les deux fichiers JSON statiques (donnees.json et
//     donnees_daily.json) une seule fois au démarrage, puis partager
//     le résultat entre tous les composants via shareReplay(1).
//   - Exposer des méthodes de filtrage (par champ, par clause WHERE)
//     et de tri appliqués côté client, sans requête supplémentaire
//     au serveur.
//
// Pourquoi des fichiers JSON statiques ?
//   L'API temps-réel d'EDF nécessite une clé d'accès. En attendant
//   de l'obtenir, toutes les données sont pré-calculées par convert.py
//   et stockées dans assets/. Le service simule exactement la même
//   interface qu'un vrai appel API : les composants n'ont pas besoin
//   d'être modifiés quand on passera à l'API réelle.
// ============================================================

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, combineLatest, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';

// @Injectable({ providedIn: 'root' }) : Angular instancie ce service
// une seule fois pour toute l'application (singleton). Tous les
// composants qui l'injectent partagent donc la même instance et
// bénéficient du cache shareReplay.
@Injectable({
  providedIn: 'root'
})
export class DatasetService {

  // ─── URLs des fichiers de données ──────────────────────────────────────────

  // donnees.json  : enregistrements horaires sur ~2 mois.
  //   Utilisé par les graphiques (histogram) qui nécessitent une
  //   granularité fine (1 point par heure).
  private baseUrl  = 'assets/donnees.json';
  private dailyUrl = 'assets/donnees_daily.json';

  // Chargés une seule fois au démarrage, résultats mis en cache par shareReplay(1)
  private allData$:      Observable<any[]>;   // données horaires ~2 mois (carte récente)
  private dailyData$:    Observable<any[]>;   // données journalières ~8 mois (histogramme)
  private events$:       Observable<any[]>;   // événements bruts (events.json)
  private units$:        Observable<any[]>;   // réacteurs + GPS (units.json)
  private indexedEvents$: Observable<Map<string, {b:number, e:number, a:number}[]>>;

  constructor(private http: HttpClient) {
    this.allData$   = this.http.get<any[]>(this.baseUrl).pipe(shareReplay(1));
    this.dailyData$ = this.http.get<any[]>(this.dailyUrl).pipe(shareReplay(1));
    this.events$    = this.http.get<any[]>('assets/events.json').pipe(shareReplay(1), catchError(() => of([])));
    this.units$     = this.http.get<any[]>('assets/units.json').pipe(shareReplay(1),  catchError(() => of([])));

    // Pré-indexation des événements par unité : Map<nomUnité, [{b, e, a}]>
    // Calculé une seule fois (shareReplay), évite de re-parcourir 15 000 lignes à chaque requête
    this.indexedEvents$ = this.events$.pipe(
      map(evs => {
        const idx = new Map<string, {b:number, e:number, a:number}[]>();
        for (const ev of evs) {
          if (!idx.has(ev.u)) idx.set(ev.u, []);
          idx.get(ev.u)!.push({ b: new Date(ev.b).getTime(), e: new Date(ev.e).getTime(), a: ev.a });
        }
        return idx;
      }),
      shareReplay(1)
    );
  }

  // ─── API publique : données journalières ────────────────────────────────────

  /**
   * Retourne les enregistrements journaliers (donnees_daily.json).
   * Chaque enregistrement correspond à un relevé à midi pour une tranche donnée.
   *
   * Utilisation typique :
   *   - Carte : disponibilité par centrale/tranche à une date précise.
   *   - Listes déroulantes : noms des centrales et tranches disponibles.
   *
   * @param refinements  Filtres d'égalité { champ: [valeurs autorisées] }.
   *                     Ex : { nom_centrale: ['BUGEY'], tranche: ['T1'] }
   * @param where        Clause WHERE SQL simplifiée (voir applyWhere).
   *                     Ex : 'date_et_heure_fuseau_horaire_europe_paris>="2025-01-01"'
   * @returns Observable<any[]> : flux émettant le tableau filtré.
   */
  getDailyRecords(refinements?: Record<string, string[]>, where?: string): Observable<any[]> {
    return this.dailyData$.pipe(
      map((records: any[]) => {
        let filtered = records;

        // Étape 1 – Filtrage par refinements (égalité stricte sur chaque champ).
        // Pour chaque clé du dictionnaire, on ne garde que les lignes dont la
        // valeur du champ correspond à l'une des valeurs autorisées.
        if (refinements) {
          for (const [key, values] of Object.entries(refinements)) {
            if (!values || values.length === 0) continue; // filtre vide → on ignore
            filtered = filtered.filter(record =>
              // values.some() : au moins une valeur correspond (logique OU)
              values.some((v: string) => String(record[key] ?? '') === String(v))
            );
          }
        }

        // Étape 2 – Filtrage par clause WHERE (comparaisons, LIKE, etc.)
        if (where && where.trim()) {
          filtered = this.applyWhere(filtered, where);
        }

        return filtered;
      })
    );
  }

  // ─── API publique : données brutes (compatibilité) ──────────────────────────

  /** Retourne le flux brut de donnees.json sans aucun filtrage. */
  getDataset(): Observable<any> {
    return this.allData$;
  }

  /**
   * Alias de getDataset(), conservé pour la compatibilité avec
   * d'anciens appels qui passaient des refinements.
   * Le paramètre refinements est ignoré ici ; préférer getDatasetAllRecords
   * pour un filtrage effectif.
   */
  getCentrale(refinements: any = {}): Observable<any> {
    return this.allData$;
  }

  // ─── API publique : données horaires filtrées ───────────────────────────────

  /**
   * Filtre les données horaires (donnees.json) avec tri optionnel.
   * C'est la méthode principale utilisée par le composant histogram
   * pour construire les séries temporelles des graphiques.
   *
   * Différences avec getDailyRecords :
   *   - Lit donnees.json (hourly) au lieu de donnees_daily.json (daily).
   *   - Gère un cas spécial pour le champ date_et_heure_… : comparaison
   *     par préfixe de date (startsWith) pour filtrer par jour entier.
   *   - Gère un cas spécial pour heure_… : comparaison numérique.
   *   - Supporte le tri par champ (orderBy).
   *
   * @param refinements  { champ: [valeurs] } — même logique que getDailyRecords,
   *                     avec les cas spéciaux date/heure ci-dessus.
   * @param _fields      Liste de champs à retourner (ignorée côté client ;
   *                     conservée pour maintenir la même signature qu'un vrai
   *                     appel API REST qui supporterait la projection de colonnes).
   * @param where        Clause WHERE SQL simplifiée (voir applyWhere).
   * @param orderBy      Champ de tri + direction : ex "date_et_heure_… ASC".
   * @returns Observable<any[]> : flux émettant le tableau filtré et trié.
   */
  getDatasetAllRecords(
    refinements?: Record<string, string[]>,
    _fields?: string[],
    where?: string,
    orderBy?: string
  ): Observable<any[]> {
    return this.allData$.pipe(
      map((records: any[]) => {
        let filtered = records;

        // --- Filtrage par refinements ---
        if (refinements) {
          for (const [key, values] of Object.entries(refinements)) {
            if (!values || values.length === 0) continue;
            filtered = filtered.filter(record => {
              const rv = record[key];
              return values.some((v: string) => {
                // Cas spécial 1 – Champ datetime : on compare uniquement
                // le préfixe YYYY-MM-DD pour filtrer toute une journée.
                // Ex : v = "2025-09-01" correspond à "2025-09-01T12:00:00+02:00".
                if (key === 'date_et_heure_fuseau_horaire_europe_paris') {
                  return String(rv).startsWith(v);
                }
                // Cas spécial 2 – Champ heure : comparaison numérique
                // (le JSON stocke des entiers 0–23).
                if (key === 'heure_fuseau_horaire_europe_paris') {
                  return Number(rv) === Number(v);
                }
                // Cas général : égalité de chaînes (ex. nom_centrale, tranche).
                return String(rv) === String(v);
              });
            });
          }
        }

        // --- Filtrage par clause WHERE (LIKE, >=, <=, >, <, =) ---
        if (where && where.trim()) {
          filtered = this.applyWhere(filtered, where);
        }

        // --- Tri ---
        // On extrait le nom du champ en supprimant le suffixe "ASC"/"DESC",
        // puis on trie avec sort() sur une copie du tableau (spread [...])
        // pour ne pas muter le cache shareReplay.
        if (orderBy) {
          const field = orderBy.trim().replace(/\s+(asc|desc)$/i, '').trim();
          const desc  = /desc$/i.test(orderBy.trim()); // true si "DESC"
          filtered = [...filtered].sort((a, b) => {
            const va = a[field];
            const vb = b[field];
            if (va < vb) return desc ? 1 : -1;   // ordre inverse si DESC
            if (va > vb) return desc ? -1 : 1;
            return 0; // égalité
          });
        }

        return filtered;
      })
    );
  }

  // ─── API publique : limites de dates ───────────────────────────────────────

  /**
   * Calcule la date minimale et maximale présentes dans donnees_daily.json.
   * Utilisé par les composants pour initialiser les sélecteurs de date
   * (ne pas proposer de dates hors de la plage disponible).
   *
   * Si donnees_daily.json est absent ou vide, bascule automatiquement sur
   * getDateLimits() (donnees.json) via catchError.
   */
  getDailyDateLimits(): Observable<any> {
    return this.dailyData$.pipe(
      map((records: any[]) => this.computeDateLimits(records)),
      // catchError : si le fichier daily est manquant, on utilise le fallback
      catchError(() => this.getDateLimits())
    );
  }

  /**
   * Calcule la date minimale et maximale présentes dans donnees.json (horaire).
   * Retourne un objet au format { total_count, results: [{ min(…), max(…) }] }
   * qui imite la réponse de l'API EDF Odre, pour faciliter la future migration.
   */
  getDateLimits(): Observable<any> {
    return this.allData$.pipe(map((records: any[]) => this.computeDateLimits(records)));
  }

  /**
   * Calcule min et max du champ datetime sur un tableau d'enregistrements.
   * La comparaison de chaînes ISO 8601 est lexicographiquement correcte
   * (les dates ISO se trient comme des chaînes).
   *
   * Si le tableau est vide, retourne une plage par défaut large
   * (2023-01-01 → 2026-12-31) pour éviter des erreurs dans l'interface.
   */
  private computeDateLimits(records: any[]): any {
    if (!records || records.length === 0) {
      // Valeurs par défaut : plage large, l'interface restera utilisable
      return {
        total_count: 1,
        results: [{
          'min(date_et_heure_fuseau_horaire_europe_paris)': '2023-01-01T00:00:00+00:00',
          'max(date_et_heure_fuseau_horaire_europe_paris)': '2026-12-31T23:00:00+00:00'
        }]
      };
    }

    // Extraction de toutes les dates non-nulles
    const dates: string[] = records
      .map((r: any) => r.date_et_heure_fuseau_horaire_europe_paris)
      .filter(Boolean); // élimine les valeurs null/undefined/''

    // reduce() pour trouver min et max en un seul parcours par appel
    const minDate = dates.reduce((a, b) => (a < b ? a : b));
    const maxDate = dates.reduce((a, b) => (a > b ? a : b));

    // Format imité de la réponse API EDF pour compatibilité future
    return {
      total_count: 1,
      results: [{
        'min(date_et_heure_fuseau_horaire_europe_paris)': minDate,
        'max(date_et_heure_fuseau_horaire_europe_paris)': maxDate
      }]
    };
  }

  // ─── Méthodes basées sur les événements bruts (events.json + units.json) ─────
  //
  // Ces méthodes calculent la disponibilité à la demande depuis les événements
  // d'indisponibilité bruts. Avantages vs fichiers pré-calculés :
  //   - Résolution horaire parfaite pour N'IMPORTE quelle date depuis 2014
  //   - Un seul fichier events.json (~1.2 MB) chargé une seule fois
  //   - Calcul instantané côté navigateur (<5 ms par requête)

  /**
   * Calcule la disponibilité de tous les réacteurs pour une date et heure précise.
   * Utilisé par la carte (marqueurs) et le panneau centrale (détail par tranche).
   *
   * Algorithme : pour chaque réacteur, cherche les événements dont la période
   * couvre le timestamp demandé. Si trouvé → min des puissances disponibles.
   * Si aucun événement → puissance nominale (réacteur à pleine capacité).
   */
  getSnapshotForDateTime(date: string, hour: number): Observable<any[]> {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const ts  = new Date(`${date}T${pad(hour)}:00:00`).getTime();

    return combineLatest([this.indexedEvents$, this.units$]).pipe(
      map(([byUnit, units]) =>
        (units as any[]).map(unit => {
          const evs      = byUnit.get(unit.unit) ?? [];
          const covering = evs.filter(e => e.b <= ts && e.e >= ts);
          const available = covering.length > 0
            ? Math.min(...covering.map(e => e.a))
            : unit.nominal;
          return {
            tranche:   unit.unit,
            centrale:  unit.centrale,
            puissance_disponible: available,
            date_et_heure_fuseau_horaire_europe_paris: `${date}T${pad(hour)}:00:00`,
            heure_fuseau_horaire_europe_paris: hour,
            point_gps_modifie_pour_afficher_la_carte_opendata: unit.gps
          };
        })
      )
    );
  }

  /**
   * Calcule une série temporelle (un point par jour à midi) pour une liste de tranches.
   * Utilisé par le graphique historique de l'histogramme.
   */
  getTimeSeriesForTranches(
    tranches: string[],
    dateFrom: string,
    dateTo: string
  ): Observable<{tranche: string; series: [number, number][]}[]> {
    return combineLatest([this.indexedEvents$, this.units$]).pipe(
      map(([byUnit, units]) =>
        tranches.map(name => {
          const unit    = (units as any[]).find(u => u.unit === name);
          const nominal = unit?.nominal ?? 0;
          const evs     = byUnit.get(name) ?? [];
          const series: [number, number][] = [];

          const cur = new Date(`${dateFrom}T12:00:00`);
          const end = new Date(`${dateTo}T12:00:00`);
          while (cur <= end) {
            const ts       = cur.getTime();
            const covering = evs.filter(e => e.b <= ts && e.e >= ts);
            series.push([ts, covering.length > 0 ? Math.min(...covering.map(e => e.a)) : nominal]);
            cur.setDate(cur.getDate() + 1);
          }
          return { tranche: name, series };
        })
      )
    );
  }

  /**
   * Calcule la production totale France (somme de tous les réacteurs) jour par jour.
   * Utilisé par le mode "total" de l'histogramme.
   */
  getTotalProductionSeries(dateFrom: string, dateTo: string): Observable<[number, number][]> {
    return combineLatest([this.indexedEvents$, this.units$]).pipe(
      map(([byUnit, units]) => {
        const series: [number, number][] = [];
        const cur = new Date(`${dateFrom}T12:00:00`);
        const end = new Date(`${dateTo}T12:00:00`);
        while (cur <= end) {
          const ts = cur.getTime();
          let total = 0;
          for (const unit of (units as any[])) {
            const evs      = byUnit.get(unit.unit) ?? [];
            const covering = evs.filter(e => e.b <= ts && e.e >= ts);
            total += covering.length > 0 ? Math.min(...covering.map(e => e.a)) : unit.nominal;
          }
          series.push([ts, total]);
          cur.setDate(cur.getDate() + 1);
        }
        return series;
      })
    );
  }

  /** Liste de tous les réacteurs connus (pour les listes déroulantes). */
  getUnits(): Observable<any[]> {
    return this.units$;
  }

  /** Plage de dates couverte par les événements (pour les sélecteurs de date). */
  getEventDateRange(): Observable<{min: string; max: string}> {
    return this.events$.pipe(
      map(evs => {
        const today = new Date().toISOString().split('T')[0];
        if (!evs.length) return { min: '2014-01-01', max: today };
        const min = evs.map(e => e.b).reduce((a, b) => a < b ? a : b).substring(0, 10);
        return { min, max: today };
      })
    );
  }

  // ─── Méthodes secondaires (stubs de compatibilité) ─────────────────────────
  //
  // Ces méthodes correspondent à des endpoints de l'API EDF Odre
  // (formats d'export, facettes, pièces jointes...) qui ne sont pas
  // encore implémentées. Elles retournent le flux brut allData$ pour
  // que le code appelant ne plante pas, même si le résultat n'est pas
  // structuré comme prévu par l'API réelle.

  getDatasetExportFormats(dataset_id?: string): Observable<any> {
    return this.allData$;
  }

  getExportDataset(dataset_id?: string, format?: string): Observable<any> {
    return this.allData$;
  }

  getExportDatasetCSV(dataset_id?: string): Observable<any> {
    return this.allData$;
  }

  getExportDatasetGPX(dataset_id?: string, format?: string): Observable<any> {
    return this.allData$;
  }

  getDatasetFacets(dataset_id?: string): Observable<any> {
    return this.allData$;
  }

  getDatasetAttachements(dataset_id?: string): Observable<any> {
    return this.allData$;
  }

  // ─── Helpers de filtrage privés ─────────────────────────────────────────────

  /**
   * Découpe une clause WHERE en conditions unitaires séparées par AND,
   * puis applique chacune sur chaque enregistrement.
   * Toutes les conditions doivent être vraies (logique ET) pour qu'un
   * enregistrement soit conservé.
   *
   * Exemple : 'nom_centrale like "%BUGEY%" AND tranche="T1"'
   *   → deux conditions, les deux doivent être satisfaites.
   */
  private applyWhere(records: any[], where: string): any[] {
    // Découpage sur le mot-clé AND (insensible à la casse)
    const conditions = where.split(/\s+AND\s+/i).map(c => c.trim());
    // filter() + every() : on ne garde que les lignes qui passent TOUTES les conditions
    return records.filter(record =>
      conditions.every(cond => this.evalCondition(record, cond))
    );
  }

  /**
   * Évalue une condition unitaire sur un enregistrement.
   * Supporte les opérateurs SQL courants dans l'ordre suivant :
   *   1. LIKE   : field like '%pattern%'  → regex avec % = .* et _ = .
   *   2. >=     : field>="valeur"         → comparaison date ou chaîne
   *   3. <=     : field<="valeur"
   *   4. >      : field>"valeur"
   *   5. <      : field<"valeur"
   *   6. =      : field = 'valeur'        → égalité stricte de chaîne
   *   (default) : true  → condition non reconnue, on ne filtre pas
   *
   * Pour les comparaisons >=, <=, >, < : on essaie d'abord de parser
   * les deux opérandes en Date (pour les champs datetime). Si l'une
   * des deux n'est pas une date valide, on compare les chaînes brutes.
   */
  private evalCondition(record: any, condition: string): boolean {

    // ── 1. LIKE ──────────────────────────────────────────────────────────────
    // Syntaxe : field like '%pattern%'
    // Conversion du pattern SQL en expression régulière :
    //   % → .*  (n'importe quelle séquence de caractères)
    //   _ → .   (n'importe quel caractère unique)
    const likeMatch = condition.match(/^(\w+)\s+like\s+'(.+)'$/i);
    if (likeMatch) {
      const [, field, pattern] = likeMatch;
      const value    = String(record[field] ?? '');
      const regexStr = '^' + pattern.replace(/%/g, '.*').replace(/_/g, '.') + '$';
      return new RegExp(regexStr, 'i').test(value); // insensible à la casse
    }

    // ── 2. >= (supérieur ou égal) ─────────────────────────────────────────────
    // Syntaxe : field>="2025-01-01T00:00:00"
    // On compare d'abord en tant que Date, sinon en tant que chaîne.
    const gteMatch = condition.match(/^(\w+)>="(.+)"$/);
    if (gteMatch) {
      const [, field, threshold] = gteMatch;
      const recDate = new Date(record[field]);
      const thrDate = new Date(threshold);
      return !isNaN(recDate.getTime()) && !isNaN(thrDate.getTime())
        ? recDate >= thrDate
        : String(record[field] ?? '') >= threshold;
    }

    // ── 3. <= (inférieur ou égal) ─────────────────────────────────────────────
    const lteMatch = condition.match(/^(\w+)<="(.+)"$/);
    if (lteMatch) {
      const [, field, threshold] = lteMatch;
      const recDate = new Date(record[field]);
      const thrDate = new Date(threshold);
      return !isNaN(recDate.getTime()) && !isNaN(thrDate.getTime())
        ? recDate <= thrDate
        : String(record[field] ?? '') <= threshold;
    }

    // ── 4. > (strictement supérieur) ─────────────────────────────────────────
    const gtMatch = condition.match(/^(\w+)>"(.+)"$/);
    if (gtMatch) {
      const [, field, threshold] = gtMatch;
      const recDate = new Date(record[field]);
      const thrDate = new Date(threshold);
      return !isNaN(recDate.getTime()) && !isNaN(thrDate.getTime())
        ? recDate > thrDate
        : String(record[field] ?? '') > threshold;
    }

    // ── 5. < (strictement inférieur) ─────────────────────────────────────────
    const ltMatch = condition.match(/^(\w+)<"(.+)"$/);
    if (ltMatch) {
      const [, field, threshold] = ltMatch;
      const recDate = new Date(record[field]);
      const thrDate = new Date(threshold);
      return !isNaN(recDate.getTime()) && !isNaN(thrDate.getTime())
        ? recDate < thrDate
        : String(record[field] ?? '') < threshold;
    }

    // ── 6. = (égalité) ───────────────────────────────────────────────────────
    // Syntaxe : field = 'valeur'
    const eqMatch = condition.match(/^(\w+)\s*=\s*'(.+)'$/);
    if (eqMatch) {
      const [, field, value] = eqMatch;
      return String(record[field] ?? '') === value;
    }

    // ── Défaut : condition non reconnue → on ne filtre pas ───────────────────
    return true;
  }
}
