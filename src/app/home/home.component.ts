import { Component, OnDestroy, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { SearchBarComponent } from '../search-bar/search-bar.component';
import { DatasetService } from '../srvices/dataset.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslateModule, SearchBarComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent implements OnInit, OnDestroy {
  totalPower    = 0;
  activeReactors = 0;
  totalReactors  = 0;
  latestDate     = '';
  statsLoaded    = false;

  private subs = new Subscription();

  constructor(private datasetService: DatasetService) {}

  ngOnInit(): void {
    this.subs.add(
      this.datasetService.getDateLimits().subscribe({
        next: (data: any) => {
          const results   = data.results || data;
          const maxDateRaw = results[0]['max(date_et_heure_fuseau_horaire_europe_paris)'];
          if (!maxDateRaw) return;

          const maxDateObj = new Date(maxDateRaw);
          this.latestDate  = maxDateObj.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
          const dateStr    = maxDateObj.toISOString().split('T')[0];

          this.subs.add(
            (this.datasetService as any).getDatasetAllRecords(
              { date_et_heure_fuseau_horaire_europe_paris: [dateStr], heure_fuseau_horaire_europe_paris: ['12'] }
            ).subscribe({
              next: (records: any[]) => {
                const list = Array.isArray(records) ? records : (records as any).results || [];
                this.totalReactors  = list.length;
                this.activeReactors = list.filter((r: any) => r.puissance_disponible > 0).length;
                this.totalPower     = Math.round(list.reduce((s: number, r: any) => s + (r.puissance_disponible || 0), 0));
                this.statsLoaded    = true;
              }
            })
          );
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }
}
