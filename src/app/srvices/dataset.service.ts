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
import { Observable, forkJoin, of } from 'rxjs';
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

  // Jours couverts par chaque source (pour choisir la bonne)
  private readonly RECENT_DAYS = 62;
  private readonly DAILY_DAYS  = 242;
  readonly HIST_START_YEAR = 2022;

  // Cache des fichiers annuels chargés à la demande
  private yearCache = new Map<number, Observable<any[]>>();

  // ─── Observables de cache ───────────────────────────────────────────────────
  //
  // shareReplay(1) est l'opérateur clé ici :
  //   - Au premier abonnement, le HttpClient émet une requête HTTP GET.
  //   - shareReplay(1) mémorise la dernière valeur émise (le tableau JSON).
  //   - Tous les abonnements suivants (autres composants, autres méthodes)
  //     reçoivent immédiatement cette valeur mémorisée SANS déclencher
  //     une nouvelle requête réseau.
  //   - Le fichier JSON n'est donc téléchargé qu'une seule fois pendant
  //     toute la durée de vie de l'application, même si dix composants
  //     appellent getDailyRecords() en parallèle.
  private allData$: Observable<any[]>;    // cache pour donnees.json (horaire)
  private dailyData$: Observable<any[]>; // cache pour donnees_daily.json (journalier)

  constructor(private http: HttpClient) {
    // Les deux requêtes HTTP sont lancées dès l'instanciation du service
    // (au chargement de l'appli). Le résultat sera disponible dans le cache
    // avant même que les composants commencent à s'abonner.
    this.allData$  = this.http.get<any[]>(this.baseUrl).pipe(shareReplay(1));
    this.dailyData$ = this.http.get<any[]>(this.dailyUrl).pipe(shareReplay(1));
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

  // ─── Données historiques ────────────────────────────────────────────────────

  /** Charge le fichier annuel donnees_YYYY.json en le mettant en cache. */
  getYearData(year: number): Observable<any[]> {
    if (!this.yearCache.has(year)) {
      this.yearCache.set(year,
        this.http.get<any[]>(`assets/donnees_${year}.json`).pipe(
          shareReplay(1),
          catchError(() => of([]))
        )
      );
    }
    return this.yearCache.get(year)!;
  }

  /** Vrai si la date est couverte par donnees.json (données horaires). */
  isRecentDate(date: string): boolean {
    return (Date.now() - new Date(date).getTime()) / 86400000 <= this.RECENT_DAYS;
  }

  /**
   * Méthode unifiée pour la carte et le panneau centrale.
   * Choisit automatiquement la bonne source selon l'ancienneté de la date :
   *  - récente  (< 62j)  → donnees.json,       heure exacte
   *  - moyenne  (< 242j) → donnees_daily.json,  midi
   *  - historique        → donnees_YYYY.json,   midi
   */
  getRecordsForDate(
    date: string,
    hour: number,
    refinements?: Record<string, string[]>,
    where?: string,
    orderBy?: string
  ): Observable<any[]> {
    const daysBack  = (Date.now() - new Date(date).getTime()) / 86400000;
    const source$   = daysBack <= this.RECENT_DAYS ? this.allData$
                    : daysBack <= this.DAILY_DAYS  ? this.dailyData$
                    : this.getYearData(new Date(date).getFullYear());
    const actualHour = daysBack <= this.RECENT_DAYS ? hour : 12;

    return source$.pipe(map((records: any[]) => {
      let f = records.filter((r: any) =>
        String(r.date_et_heure_fuseau_horaire_europe_paris ?? '').startsWith(date) &&
        Number(r.heure_fuseau_horaire_europe_paris) === actualHour
      );
      if (refinements) {
        for (const [k, vs] of Object.entries(refinements)) {
          if (k === 'date_et_heure_fuseau_horaire_europe_paris') continue;
          if (k === 'heure_fuseau_horaire_europe_paris') continue;
          if (!vs?.length) continue;
          f = f.filter((r: any) => vs.some(v => String(r[k] ?? '') === String(v)));
        }
      }
      if (where?.trim()) f = this.applyWhere(f, where);
      if (orderBy) {
        const field = orderBy.replace(/\s+(asc|desc)$/i, '').trim();
        const desc  = /desc$/i.test(orderBy);
        f = [...f].sort((a: any, b: any) => {
          if (a[field] < b[field]) return desc ? 1 : -1;
          if (a[field] > b[field]) return desc ? -1 : 1;
          return 0;
        });
      }
      return f;
    }));
  }

  /**
   * Méthode pour l'histogramme : combine les fichiers annuels nécessaires
   * quand la plage demandée dépasse donnees_daily.json.
   */
  getMultiYearDailyRecords(
    refinements?: Record<string, string[]>,
    where?: string
  ): Observable<any[]> {
    const fromMatch = where?.match(/date_et_heure_fuseau_horaire_europe_paris>="(\d{4}-\d{2}-\d{2})/);
    const dateFrom  = fromMatch?.[1];
    if (!dateFrom) return this.getDailyRecords(refinements, where);

    const dailyCutoff = new Date(Date.now() - this.DAILY_DAYS * 86400000);
    if (new Date(dateFrom) >= dailyCutoff) return this.getDailyRecords(refinements, where);

    const toMatch  = where?.match(/date_et_heure_fuseau_horaire_europe_paris<="(\d{4}-\d{2}-\d{2})/);
    const dateTo   = toMatch?.[1] || new Date().toISOString().split('T')[0];
    const yearFrom = new Date(dateFrom).getFullYear();
    const yearTo   = new Date(dateTo).getFullYear();

    const sources: Observable<any[]>[] = [];
    for (let y = yearFrom; y <= yearTo; y++) {
      if (new Date(y, 11, 31) < dailyCutoff) {
        sources.push(this.getYearData(y));
      } else {
        sources.push(this.dailyData$);
        break;
      }
    }
    if (sources.length === 0) return this.getDailyRecords(refinements, where);

    return forkJoin(sources).pipe(
      map((arrays: any[][]) => ([] as any[]).concat(...arrays)),
      map((records: any[]) => {
        let f = records;
        if (refinements) {
          for (const [k, vs] of Object.entries(refinements)) {
            if (!vs?.length) continue;
            f = f.filter((r: any) => vs.some(v => String(r[k] ?? '') === String(v)));
          }
        }
        if (where?.trim()) f = this.applyWhere(f, where);
        return f;
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
