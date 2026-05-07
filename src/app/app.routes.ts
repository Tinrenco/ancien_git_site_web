import { Routes } from '@angular/router';
import { CourseCardComponent } from './course-card/course-card.component';
import { AppComponent } from './app.component';
import { MapComponent } from './map/map.component';
import { CourseListComponent } from './course-list/course-list.component';
import { CourseDetailsComponent } from './course-details/course-details.component';
import { HomeComponent } from './home/home.component';
import { AccountComponent } from './account/account.component';
import { LoginComponent } from './account/login/login.component';
import { RegisterComponent } from './account/register/register.component';
import { PageNotFoundComponent } from './page-not-found/page-not-found.component';
import { EdfComponent } from './edf/edf.component';
import { HistogramComponent } from './histogram/histogram.component';
import { InformationComponent } from './information/information.component';
import { NucleaireInfoComponent } from './nucleaire-info/nucleaire-info.component';

export const routes: Routes = [
  {
    path: 'course-card',
    component: CourseCardComponent,
  },
  {
    path: 'information',
    component: InformationComponent
  },
  {
  path: 'histogram',
  component: HistogramComponent
  },
  {
    path: 'home',
    component: HomeComponent, // Redirige vers la page principale
  },
  {
    path: 'course-list',
    component: CourseListComponent,
  },
  {
    path: 'carte',
    component: MapComponent,
  },
  {
    path: 'course',
    component: CourseDetailsComponent,
  },
  {
    path: 'account',
    component: AccountComponent,
    children: [
      { path: 'login', component: LoginComponent },
      { path: 'regitser', component: RegisterComponent },
      { path: '', redirectTo: '/account/login', pathMatch: 'full' },
    ],
  },
  {
    path: 'edf',
    component: EdfComponent
  },
  {
    path: 'nucleaire-info',
    component: NucleaireInfoComponent
  },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: '/home',
  },
  {
    path: '**',
    component: PageNotFoundComponent
  }
];
