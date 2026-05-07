import { Component, OnInit } from '@angular/core';
import { CourseCardComponent } from '../course-card/course-card.component';
import { DataSets, Dispo, ICourse, courses } from '../app.component.models';
import { CommonModule } from '@angular/common';
import { CatalogService} from '../srvices/catalog.service';
import { DatasetService } from '../srvices/dataset.service';

@Component({
  selector: 'app-course-list',
  standalone: true,
  imports: [CourseCardComponent, CommonModule],
  templateUrl: './course-list.component.html',
  styleUrl: './course-list.component.scss'
})
export class CourseListComponent implements OnInit {
  courses: ICourse[] = courses;
  datasets: DataSets = { total_count: 0, results: [] };
  dataset: Dispo[] = [];
  title = 'hello';

  constructor(private catalogService: CatalogService, private datasetService: DatasetService) {}

  getRefinementsForNow(): Record<string, string[]> {
    const now = new Date();

    const date = now.toISOString().slice(0, 10).replace(/-/g, '/'); // Format "YYYY/MM/DD"
    const hour = now.getHours().toString().padStart(2, '0'); // Format "HH"

    return {
      date_et_heure_fuseau_horaire_europe_paris: [date],
      heure_fuseau_horaire_europe_paris: [hour]
    };
  }

  onCourseClicked(course: ICourse): void {
    console.log('courseclicked ', course.description);
  }
  
  ngOnInit(): void {
    // MODIFICATION ICI : on force le type avec (as any)
    (this.datasetService as any).getDatasetAllRecords(
      this.getRefinementsForNow(), 
      ["centrale","tranche","point_gps_modifie_pour_afficher_la_carte_opendata","puissance_disponible"],
      "tranche like '%1'"
    ).subscribe({
      // MODIFICATION ICI : data: any
      next: (data: any) => {
        // On s'adapte au format JSON local ou API
        this.dataset = data.results || data; 
        
        // On recrée l'objet pour qu'il respecte le format attendu par ton HTML
        this.datasets = {
          total_count: this.dataset.length,
          results: this.dataset
        };

        console.log('datasets', this.datasets);
        console.log('dataset results', this.dataset);
      },
      error: (error: any) => {
        console.error('Erreur dans course-list:', error);
      }
    });
  }
}