import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-nucleaire-info',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './nucleaire-info.component.html',
  styleUrl: './nucleaire-info.component.scss'
})
export class NucleaireInfoComponent {
  readonly steps = [
    { number: 1, titleKey: 'NUCLEAIRE_INFO.FONCTIONNEMENT.STEP1_TITLE', descKey: 'NUCLEAIRE_INFO.FONCTIONNEMENT.STEP1_DESC' },
    { number: 2, titleKey: 'NUCLEAIRE_INFO.FONCTIONNEMENT.STEP2_TITLE', descKey: 'NUCLEAIRE_INFO.FONCTIONNEMENT.STEP2_DESC' },
    { number: 3, titleKey: 'NUCLEAIRE_INFO.FONCTIONNEMENT.STEP3_TITLE', descKey: 'NUCLEAIRE_INFO.FONCTIONNEMENT.STEP3_DESC' },
    { number: 4, titleKey: 'NUCLEAIRE_INFO.FONCTIONNEMENT.STEP4_TITLE', descKey: 'NUCLEAIRE_INFO.FONCTIONNEMENT.STEP4_DESC' },
    { number: 5, titleKey: 'NUCLEAIRE_INFO.FONCTIONNEMENT.STEP5_TITLE', descKey: 'NUCLEAIRE_INFO.FONCTIONNEMENT.STEP5_DESC' },
    { number: 6, titleKey: 'NUCLEAIRE_INFO.FONCTIONNEMENT.STEP6_TITLE', descKey: 'NUCLEAIRE_INFO.FONCTIONNEMENT.STEP6_DESC' },
  ];
}
