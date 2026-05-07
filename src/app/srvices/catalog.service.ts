import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { DataSets } from '../app.component.models';

const baseUrl = 'assets/donnees.json';

@Injectable({
  providedIn: 'root'
})
export class CatalogService {
  http = inject(HttpClient);

  getDatasets(): Observable<DataSets> {
    return this.http.get<DataSets>(`${baseUrl}/datasets`);
  }

  getExportFormats(): Observable<any> {
    return this.http.get<any>(`${baseUrl}/exports`);
  }

  getExportCatalogByFormat(format: string): Observable<any> {
    return this.http.get<any>(`${baseUrl}/${format}`);
  }
  
  getDatasetInformation(dataset_id: string): Observable<any>{
    return this.http.get<any>(`${baseUrl}/datasets/${dataset_id}`);
  }
}