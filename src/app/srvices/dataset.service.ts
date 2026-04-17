import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class DatasetService {

  private baseUrl = 'assets/donnees.json';

  private dailyUrl = 'assets/donnees_daily.json';

  // Chargement unique du JSON, partagé entre tous les abonnés
  private allData$: Observable<any[]>;
  private dailyData$: Observable<any[]>;

  constructor(private http: HttpClient) {
    this.allData$ = this.http.get<any[]>(this.baseUrl).pipe(shareReplay(1));
    this.dailyData$ = this.http.get<any[]>(this.dailyUrl).pipe(shareReplay(1));
  }

  /** Retourne toutes les données journalières (midi) sur toute la période disponible. */
  getDailyRecords(refinements?: Record<string, string[]>, where?: string): Observable<any[]> {
    return this.dailyData$.pipe(
      map((records: any[]) => {
        let filtered = records;

        if (refinements) {
          for (const [key, values] of Object.entries(refinements)) {
            if (!values || values.length === 0) continue;
            filtered = filtered.filter(record =>
              values.some((v: string) => String(record[key] ?? '') === String(v))
            );
          }
        }

        if (where && where.trim()) {
          filtered = this.applyWhere(filtered, where);
        }

        return filtered;
      })
    );
  }

  getDataset(): Observable<any> {
    return this.allData$;
  }

  getCentrale(refinements: any = {}): Observable<any> {
    return this.allData$;
  }

  /**
   * Filtre les données locales selon :
   * @param refinements  { champ: [valeurs] }  – égalité/préfixe de date
   * @param fields       liste de champs à retourner (ignoré côté client, conservé pour compatibilité)
   * @param where        condition SQL simplifiée : LIKE, =, > et < avec AND
   * @param orderBy      nom du champ + optionnel "ASC"/"DESC"
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
                if (key === 'date_et_heure_fuseau_horaire_europe_paris') {
                  // Comparer uniquement la partie date (YYYY-MM-DD)
                  return String(rv).startsWith(v);
                }
                if (key === 'heure_fuseau_horaire_europe_paris') {
                  return Number(rv) === Number(v);
                }
                return String(rv) === String(v);
              });
            });
          }
        }

        // --- Filtrage par clause WHERE ---
        if (where && where.trim()) {
          filtered = this.applyWhere(filtered, where);
        }

        // --- Tri ---
        if (orderBy) {
          const field = orderBy.trim().replace(/\s+(asc|desc)$/i, '').trim();
          const desc  = /desc$/i.test(orderBy.trim());
          filtered = [...filtered].sort((a, b) => {
            const va = a[field];
            const vb = b[field];
            if (va < vb) return desc ? 1 : -1;
            if (va > vb) return desc ? -1 : 1;
            return 0;
          });
        }

        return filtered;
      })
    );
  }

  /** Dates min/max calculées depuis donnees_daily.json (toute la période).
   *  Fallback sur donnees.json si le fichier daily n'existe pas encore. */
  getDailyDateLimits(): Observable<any> {
    return this.dailyData$.pipe(
      map((records: any[]) => this.computeDateLimits(records)),
      catchError(() => this.getDateLimits())
    );
  }

  /** Calcule les dates min/max à partir des données chargées. */
  getDateLimits(): Observable<any> {
    return this.allData$.pipe(map((records: any[]) => this.computeDateLimits(records)));
  }

  private computeDateLimits(records: any[]): any {
    if (!records || records.length === 0) {
      return {
        total_count: 1,
        results: [{
          'min(date_et_heure_fuseau_horaire_europe_paris)': '2023-01-01T00:00:00+00:00',
          'max(date_et_heure_fuseau_horaire_europe_paris)': '2026-12-31T23:00:00+00:00'
        }]
      };
    }
    const dates: string[] = records
      .map((r: any) => r.date_et_heure_fuseau_horaire_europe_paris)
      .filter(Boolean);
    const minDate = dates.reduce((a, b) => (a < b ? a : b));
    const maxDate = dates.reduce((a, b) => (a > b ? a : b));
    return {
      total_count: 1,
      results: [{
        'min(date_et_heure_fuseau_horaire_europe_paris)': minDate,
        'max(date_et_heure_fuseau_horaire_europe_paris)': maxDate
      }]
    };
  }

  // ─── Méthodes secondaires (compatibilité) ───────────────────────────────────

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

  // ─── Helpers de filtrage ─────────────────────────────────────────────────────

  private applyWhere(records: any[], where: string): any[] {
    const conditions = where.split(/\s+AND\s+/i).map(c => c.trim());
    return records.filter(record =>
      conditions.every(cond => this.evalCondition(record, cond))
    );
  }

  private evalCondition(record: any, condition: string): boolean {
    // LIKE : field like '%pattern%'
    const likeMatch = condition.match(/^(\w+)\s+like\s+'(.+)'$/i);
    if (likeMatch) {
      const [, field, pattern] = likeMatch;
      const value    = String(record[field] ?? '');
      const regexStr = '^' + pattern.replace(/%/g, '.*').replace(/_/g, '.') + '$';
      return new RegExp(regexStr, 'i').test(value);
    }

    // Supérieur à : field>"valeur"
    const gtMatch = condition.match(/^(\w+)>"(.+)"$/);
    if (gtMatch) {
      const [, field, threshold] = gtMatch;
      const recDate = new Date(record[field]);
      const thrDate = new Date(threshold);
      return !isNaN(recDate.getTime()) && !isNaN(thrDate.getTime())
        ? recDate > thrDate
        : String(record[field] ?? '') > threshold;
    }

    // Inférieur à : field<"valeur"
    const ltMatch = condition.match(/^(\w+)<"(.+)"$/);
    if (ltMatch) {
      const [, field, threshold] = ltMatch;
      const recDate = new Date(record[field]);
      const thrDate = new Date(threshold);
      return !isNaN(recDate.getTime()) && !isNaN(thrDate.getTime())
        ? recDate < thrDate
        : String(record[field] ?? '') < threshold;
    }

    // Égalité : field = 'valeur'
    const eqMatch = condition.match(/^(\w+)\s*=\s*'(.+)'$/);
    if (eqMatch) {
      const [, field, value] = eqMatch;
      return String(record[field] ?? '') === value;
    }

    return true;
  }
}
