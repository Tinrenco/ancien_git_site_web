import { Component } from '@angular/core';
import { MyMapComponent } from '../my-map/my-map.component';
import { TranslateModule } from '@ngx-translate/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-edf',
  standalone: true,
  imports: [MyMapComponent, TranslateModule, RouterLink, RouterLinkActive],
  templateUrl: './edf.component.html',
  styleUrl: './edf.component.scss'
})
export class EdfComponent {

}
