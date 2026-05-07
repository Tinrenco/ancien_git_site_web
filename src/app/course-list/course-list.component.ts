import { Component } from '@angular/core';
import { CourseCardComponent } from '../course-card/course-card.component';
import { DataSetResult, DataSets, Dispo, ICourse, courses } from '../app.component.models';
import { CommonModule } from '@angular/common';
import { CatalogService} from '../srvices/catalog.service';
import { DatasetService } from '../srvices/dataset.service';

@Component({
  selector: 'app-course-list',
  standalone: true,
  imports: [CourseCardComponent,CommonModule],
  templateUrl: './course-list.component.html',
  styleUrl: './course-list.component.scss'
})
export class CourseListComponent {
  courses: ICourse[] = courses;
  /* datasets: Array<any> = []; */
  datasets: DataSets = {total_count: 0, results:[]};
  dataset : Dispo[] = [];
  title='hello';
  getRefinementsForNow(): Record<string, string[]> {
    const now = new Date();

    const date = now.toISOString().slice(0, 10).replace(/-/g, '/'); // Format "YYYY/MM/DD"
    const hour = now.getHours().toString().padStart(2, '0'); // Format "HH"

    return {
      date_et_heure_fuseau_horaire_europe_paris: [date],
      heure_fuseau_horaire_europe_paris: [hour]
    };
  };
  onCourseClicked(course:ICourse): void{
    console.log('courseclicked ',course.description);
  }
    //mathod 1 to call data from service
    constructor(private catalogService: CatalogService, private datasetService: DatasetService){};
    ngOnInit(): void {
      // Récupération des données avec les refinements
      this.datasetService.getDatasetAllRecords(
        this.getRefinementsForNow(), ["centrale","tranche","point_gps_modifie_pour_afficher_la_carte_opendata","puissance_disponible"],"tranche like '%1'").subscribe((data: DataSets) => {
        this.datasets = data; // Affecter directement l'objet complet
        this.dataset = data.results; // Extraire les résultats
        console.log('datasets', this.datasets);
        console.log('dataset results', this.dataset);
      });
    }
    /* ngOnInit(): void {
      this.catalogService.getDatasets().subscribe(datasets => {
        this.datasets = Object.values(datasets);
        console.log('datasets ',this.datasets)
      });
    }   */
}
