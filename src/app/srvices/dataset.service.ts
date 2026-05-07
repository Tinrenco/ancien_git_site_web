import { Injectable, inject } from '@angular/core';
import{ HttpClient, HttpErrorResponse, HttpParams} from '@angular/common/http';
import { Observable } from 'rxjs';
import { DataSets, DateLimits } from '../app.component.models';

const baseUrl = 'https://opendata.edf.fr/api/explore/v2.1/catalog/datasets/disponibilite-du-parc-nucleaire-d-edf-sa-present-passe-et-previsionnel'
@Injectable({
  providedIn: 'root'
})
export class DatasetService {
  http = inject(HttpClient)
getDatasetAllRecords( refinements: Record<string, string[]>={}, select: string[]=[], where: string='', orderBy: string=''): Observable<DataSets> {
  let params = new HttpParams()
    .set('limit', '100')
    /* .set('select','heure_fuseau_horaire_europe_paris') */
  // Ajouter les refinements dynamiquement
    // Ajouter les champs à sélectionner
    if (select.length > 0) {
      params = params.set('select', select.join(',')); // Concatène les champs avec des virgules
    }
    if (where) {
      params = params.set('where', where)
    }
    if (orderBy.length > 0){
      params = params.set('order_by', orderBy)
    }
  Object.entries(refinements).forEach(([key, value]) => {
    params = params.append('refine', `${key}:${value}`);
  });
  return this.http.get<DataSets>(`${baseUrl}/records`, { params });
}
  getCentrale(refinements: Record<string, string[]>={}){
    let params = new HttpParams()
    .set('limit', '100')
    /* .set('select','heure_fuseau_horaire_europe_paris') */
  // Ajouter les refinements dynamiquement
  Object.entries(refinements).forEach(([key, value]) => {
    params = params.append('refine', `${key}:${value}`);
  });
  return this.http.get<DataSets>(`${baseUrl}/records`, { params });
  }
  getDatasetExportFormats(dataset_id: string): Observable<any>{
    return this.http.get(`${baseUrl}/datasets/${dataset_id}/exports`)
  }
  getExportDataset(dataset_id: string, format: string): Observable<any>{
    return this.http.get(`${baseUrl}/datasets/${dataset_id}/export/${format}`)
  }
  getExportDatasetCSV(dataset_id: string): Observable<any>{
    return this.http.get(`${baseUrl}/datasets/${dataset_id}/export/csv`)
  } 
  getExportDatasetGPX(dataset_id: string, format: string): Observable<any>{
    return this.http.get(`${baseUrl}/datasets/${dataset_id}/export/gpx`)
  }
  getDatasetFacets(dataset_id: string): Observable <any>{
    return this.http.get(`${baseUrl}/datasets/${dataset_id}/facets`)
  }
  getDatasetAttachements(dataset_id: string): Observable <any>{
    return this.http.get(`${baseUrl}/datasets/${dataset_id}/attachements`)
  }
  getDatasetReocrd(dataset_id: string, record_id: string): Observable <any>{
    return this.http.get(`${baseUrl}/datasets/${dataset_id}/records/${record_id}`)
  }
  private baseUrl = 'https://opendata.edf.fr/api/explore/v2.1/catalog/datasets';
  private datasetId = 'disponibilite-du-parc-nucleaire-d-edf-sa-present-passe-et-previsionnel';

  // ... autres méthodes existantes ...

  getDateLimits(): Observable<DateLimits> {
    const url = `${this.baseUrl}/${this.datasetId}/records`;
    const params = {
      select: 'min(date_et_heure_fuseau_horaire_europe_paris),max(date_et_heure_fuseau_horaire_europe_paris)',
      limit: '1'
    };

    return this.http.get<DateLimits>(url, { params });
  }
}

