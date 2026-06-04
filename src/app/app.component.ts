// ============================================================
// app.component.ts
// Composant racine de l'application Angular.
//
// Rôle :
//   - Affiche la barre de navigation (navbar) et le <router-outlet>
//     dans lequel les composants de page sont chargés dynamiquement
//     selon l'URL active.
//   - Gère l'internationalisation (i18n) : détection de la langue
//     du navigateur, bascule FR/EN à la demande de l'utilisateur.
//   - Pilote les modales "À propos" et "Contact" accessibles depuis
//     la navbar.
//   - Met à jour le <title> de la page en fonction de la langue active.
//
// Ce composant est instancié une seule fois (singleton) au démarrage
// et persiste pendant toute la durée de vie de l'application.
// ============================================================

import { Component, HostListener } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HighchartsChartModule } from 'highcharts-angular';
import * as Highcharts from 'highcharts';
import HC_map from 'highcharts/modules/map'; // module cartographique Highcharts
import topology from '@highcharts/map-collection/custom/europe.topo.json'; // contours Europe
import { TranslateService, TranslateModule } from '@ngx-translate/core';
import { Title } from '@angular/platform-browser';

// Initialisation globale du module de carte Highcharts.
// Doit être appelé UNE SEULE FOIS, ici au niveau racine, avant que
// tout composant n'essaie d'afficher un graphique de type 'map'.
HC_map(Highcharts);

@Component({
  selector: 'app-root',     // balise <app-root> dans index.html
  standalone: true,          // pas de NgModule : imports directs ci-dessous
  imports: [
    RouterOutlet,            // <router-outlet> : zone de chargement des pages
    CommonModule,            // *ngIf, *ngFor, pipes standards
    RouterLink,              // [routerLink] sur les liens de navigation
    RouterLinkActive,        // classe CSS active sur le lien de la page courante
    HighchartsChartModule,   // directive <highcharts-chart> pour les graphiques
    TranslateModule,         // pipe | translate pour les traductions
    FormsModule,             // [(ngModel)] pour le formulaire de contact
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {

  // ─── Internationalisation ─────────────────────────────────────────────────

  // Langue actuellement active ('fr' ou 'en'). Liée à l'indicateur
  // dans la navbar pour mettre en avant la langue sélectionnée.
  currentLang: string = 'fr';

  // ─── Highcharts (référence globale) ──────────────────────────────────────

  // La directive <highcharts-chart [Highcharts]="Highcharts"> attend
  // une référence à la bibliothèque Highcharts. On l'expose ici pour
  // la passer en liaison de propriété depuis le template si besoin.
  Highcharts: typeof Highcharts = Highcharts;

  // Options du graphique Highcharts (non utilisées directement dans ce
  // composant, conservées pour éventuels tests dans app.component.html).
  chartOptions: any;

  // Données topographiques de la carte Europe (GeoJSON/TopoJSON).
  // Passées aux composants de carte via liaison de propriété.
  topology: typeof topology = topology;

  // ─── État de la navbar ────────────────────────────────────────────────────

  // Contrôle l'affichage du menu déroulant de sélection de langue.
  isDropdownOpen = false;

  // ─── État des modales ─────────────────────────────────────────────────────

  // showAbout   : affiche/cache la modale "À propos du projet".
  // showContact : affiche/cache la modale "Nous contacter".
  showAbout   = false;
  showLegal   = false;
  showContact = false;

  // Indique si l'email de contact a été ouvert (pour afficher un message
  // de confirmation à l'utilisateur après envoi).
  contactSent = false;

  // Modèle du formulaire de contact, lié à [(ngModel)] dans le template.
  contact = { nom: '', email: '', sujet: '', message: '' };

  constructor(private translate: TranslateService, private titleService: Title) {
    // L'initialisation des traductions est faite dans le constructeur
    // (et non dans ngOnInit) pour que la langue soit prête avant le
    // premier rendu de l'interface.
    this.initializeTranslations();
  }

  // ─── Internationalisation ─────────────────────────────────────────────────

  /**
   * Configure ngx-translate :
   *   1. Déclare les langues supportées (fr, en).
   *   2. Définit le français comme langue de secours si une clé est
   *      absente de la traduction active.
   *   3. Détecte automatiquement la langue du navigateur de l'utilisateur
   *      et l'utilise si elle est supportée, sinon bascule sur le français.
   */
  private initializeTranslations() {
    this.translate.addLangs(['fr', 'en']);
    this.translate.setDefaultLang('fr');

    // getBrowserLang() retourne ex. 'fr', 'en', 'de'...
    // Le regex /fr|en/ filtre uniquement les langues supportées.
    const browserLang = this.translate.getBrowserLang();
    this.translate.use(browserLang?.match(/fr|en/) ? browserLang : 'fr');

    // Synchronise currentLang avec la langue effectivement chargée
    this.currentLang = this.translate.currentLang;
  }

  /**
   * Bascule la langue de l'interface entre 'fr' et 'en'.
   * Appelée depuis la navbar via (click)="switchLanguage('en')".
   * ngx-translate recharge automatiquement le fichier
   * src/assets/i18n/<lang>.json et met à jour tous les pipes | translate.
   */
  switchLanguage(lang: string) {
    this.translate.use(lang);
    this.currentLang = lang;
  }

  // ─── Menu déroulant de langue ─────────────────────────────────────────────

  /**
   * Ouvre ou ferme le dropdown de sélection de langue.
   * stopPropagation() empêche l'événement de remonter jusqu'au document
   * et de déclencher immédiatement closeDropdown() (voir @HostListener).
   */
  toggleDropdown(event: Event) {
    event.stopPropagation();
    this.isDropdownOpen = !this.isDropdownOpen;
  }

  /**
   * Ferme le dropdown si l'utilisateur clique n'importe où dans la page
   * (comportement standard des menus déroulants).
   * @HostListener('document:click') écoute tous les clics sur le document
   * sans avoir à ajouter d'attribut (click) dans le template.
   */
  @HostListener('document:click')
  closeDropdown() {
    this.isDropdownOpen = false;
  }

  // ─── Formulaire de contact ────────────────────────────────────────────────

  /**
   * Ouvre le client mail de l'utilisateur avec un brouillon pré-rempli.
   * On utilise un lien mailto: plutôt qu'un backend pour éviter d'avoir
   * un serveur d'envoi d'emails. L'adresse de destination est encodée
   * en dur dans le code source.
   *
   * Après ouverture, le formulaire est réinitialisé et un message de
   * confirmation (contactSent = true) est affiché à l'utilisateur.
   */
  sendContact() {
    const subject = encodeURIComponent(this.contact.sujet || 'Contact depuis le site EDF');
    const body = encodeURIComponent(
      `Nom : ${this.contact.nom}\nEmail : ${this.contact.email}\n\n${this.contact.message}`
    );
    // window.open avec mailto: déclenche l'ouverture du client mail par défaut
    window.open(`mailto:oamadou095@gmail.com?subject=${subject}&body=${body}`);
    this.contactSent = true;
    // Réinitialisation du modèle pour vider le formulaire après envoi
    this.contact = { nom: '', email: '', sujet: '', message: '' };
  }

  // ─── Cycle de vie Angular ─────────────────────────────────────────────────

  ngOnInit() {
    // Abonnement à l'événement de changement de langue :
    // dès que l'utilisateur bascule FR/EN, le titre de l'onglet
    // est mis à jour dans la langue choisie.
    this.translate.onLangChange.subscribe(() => {
      this.updateTitle();
    });

    // Mise à jour initiale du titre au chargement de la page.
    this.updateTitle();
  }

  /**
   * Lit la clé de traduction 'TITLE' (définie dans fr.json / en.json)
   * et l'applique au <title> du document HTML via Angular Title service.
   * Le title service est préférable à document.title = '...' car il est
   * compatible avec le rendu côté serveur (SSR) si on l'active un jour.
   */
  private updateTitle() {
    this.translate.get('TITLE').subscribe((res: string) => {
      this.titleService.setTitle(res);
    });
  }
}
