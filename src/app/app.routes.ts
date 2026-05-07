import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { MapComponent } from './map/map.component';
import { HistogramComponent } from './histogram/histogram.component';
import { NucleaireInfoComponent } from './nucleaire-info/nucleaire-info.component';
import { PageNotFoundComponent } from './page-not-found/page-not-found.component';

export const routes: Routes = [
  { path: 'home',          component: HomeComponent },
  { path: 'carte',         component: MapComponent },
  { path: 'histogram',     component: HistogramComponent },
  { path: 'nucleaire-info', component: NucleaireInfoComponent },
  { path: '',              pathMatch: 'full', redirectTo: '/home' },
  { path: '**',            component: PageNotFoundComponent },
];
