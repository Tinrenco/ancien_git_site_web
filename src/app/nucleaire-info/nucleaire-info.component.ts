// ============================================================
// nucleaire-info.component.ts
// Composant de la page pédagogique "Le nucléaire".
//
// Rôle :
//   Page statique d'information sur le fonctionnement d'un réacteur
//   nucléaire à eau pressurisée (REP), les circuits de refroidissement,
//   le réseau de transport d'électricité et les chiffres clés du parc
//   nucléaire français.
//
//   Le contenu textuel est entièrement géré par les fichiers de
//   traduction (src/assets/i18n/fr.json et en.json) via le pipe
//   | translate. Ce composant TypeScript ne contient donc aucune
//   logique de données : il se limite à déclarer la liste des étapes
//   (steps) qui est itérée dans le template avec *ngFor.
// ============================================================

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

  /**
   * Liste des 6 étapes du cycle de fonctionnement d'un réacteur REP,
   * utilisée dans le template pour générer les cartes d'étapes via *ngFor.
   *
   * Chaque objet contient :
   *   - number   : numéro d'étape affiché dans le badge circulaire.
   *   - titleKey : clé i18n pour le titre (ex : "Fission nucléaire").
   *   - descKey  : clé i18n pour la description courte de l'étape.
   *
   * Les textes réels sont dans fr.json / en.json sous
   * NUCLEAIRE_INFO.FONCTIONNEMENT.STEP{n}_TITLE et STEP{n}_DESC.
   */
  readonly steps = [
    { number: 1, titleKey: 'NUCLEAIRE_INFO.FONCTIONNEMENT.STEP1_TITLE', descKey: 'NUCLEAIRE_INFO.FONCTIONNEMENT.STEP1_DESC' },
    { number: 2, titleKey: 'NUCLEAIRE_INFO.FONCTIONNEMENT.STEP2_TITLE', descKey: 'NUCLEAIRE_INFO.FONCTIONNEMENT.STEP2_DESC' },
    { number: 3, titleKey: 'NUCLEAIRE_INFO.FONCTIONNEMENT.STEP3_TITLE', descKey: 'NUCLEAIRE_INFO.FONCTIONNEMENT.STEP3_DESC' },
    { number: 4, titleKey: 'NUCLEAIRE_INFO.FONCTIONNEMENT.STEP4_TITLE', descKey: 'NUCLEAIRE_INFO.FONCTIONNEMENT.STEP4_DESC' },
    { number: 5, titleKey: 'NUCLEAIRE_INFO.FONCTIONNEMENT.STEP5_TITLE', descKey: 'NUCLEAIRE_INFO.FONCTIONNEMENT.STEP5_DESC' },
    { number: 6, titleKey: 'NUCLEAIRE_INFO.FONCTIONNEMENT.STEP6_TITLE', descKey: 'NUCLEAIRE_INFO.FONCTIONNEMENT.STEP6_DESC' },
  ];
}
