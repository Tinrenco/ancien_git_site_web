// ============================================================
// centrale.component.ts
// Panneau de détail d'une centrale nucléaire.
//
// Rôle :
//   Ce composant est affiché à droite de la carte (ou en bottom sheet
//   sur mobile) quand l'utilisateur clique sur un marqueur.
//   Il affiche la liste des tranches de la centrale avec leur puissance
//   disponible à l'instant sélectionné, et permet de naviguer vers le
//   graphique historique d'une tranche spécifique.
//
// Communication avec le parent (MapComponent) :
//   - @Input() selectedDate / selectedHour : instant actuellement affiché.
//   - @Input() centralesData               : liste complète des centrales
//                                            (transmise au graphique via state).
//   - @Output() closePanel                 : notifie le parent de fermer le panneau.
//
// Synchronisation par query params :
//   ngOnInit s'abonne aux queryParams de l'URL (centrale, date, hour).
//   Quand MapComponent met à jour l'URL (sélection centrale, changement de
//   date/heure), ce composant se met à jour automatiquement sans échange
//   de données direct entre composants (découplage fort).
// ============================================================

import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Subscription } from 'rxjs';
import { Dispo } from '../app.component.models';
import { CommonModule } from '@angular/common';
import { DatasetService } from '../srvices/dataset.service';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import localeEn from '@angular/common/locales/en';

// Enregistrement des locales FR et EN pour les pipes Angular
// (DatePipe, DecimalPipe, CurrencyPipe...). Sans cet enregistrement,
// toLocaleDateString() et les pipes Angular utilisent uniquement
// la locale 'en-US' par défaut.
registerLocaleData(localeFr, 'fr');
registerLocaleData(localeEn, 'en');

@Component({
  selector: 'app-centrale',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './centrale.component.html',
  styleUrl: './centrale.component.scss'
})
export class CentraleComponent implements OnInit, OnDestroy {

  // ─── Entrées depuis le parent ─────────────────────────────────────────────

  // Heure sélectionnée (0–23) pour filtrer les données de disponibilité.
  @Input() selectedHour!: number;

  // Date sélectionnée au format YYYY-MM-DD.
  @Input() selectedDate!: string;

  // Liste complète des centrales, passée au graphique lors de la navigation
  // vers /histogram (via router.navigate state).
  @Input() centralesData: Dispo[] = [];

  // ─── Sortie vers le parent ────────────────────────────────────────────────

  // Émis quand l'utilisateur clique sur "Fermer". MapComponent referme
  // le panneau et recentre la carte sur la France entière.
  @Output() closePanel = new EventEmitter<void>();

  // ─── État interne ─────────────────────────────────────────────────────────

  // Nom de la centrale en cours d'affichage (lu depuis les query params).
  centraleName: string = '';

  // Données des tranches de la centrale pour l'instant sélectionné.
  // null = données pas encore chargées.
  additionalData: Dispo[] | null = null;

  // Contrôle l'animation d'entrée/sortie du panneau.
  // false = panneau masqué (avant ouverture ou après fermeture).
  isVisible: boolean = false;

  // Abonnements RxJS, annulés proprement dans ngOnDestroy.
  private subs = new Subscription();

  constructor(
    private datasetService: DatasetService,
    private router: Router,
    public translate: TranslateService,   // public : utilisé dans le template via translate.currentLang
    private route: ActivatedRoute
  ) {}

  // ─── Cycle de vie Angular ─────────────────────────────────────────────────

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  /**
   * Abonnement aux query params de l'URL.
   * Quand MapComponent met à jour ?centrale=X&date=Y&hour=Z, ce composant
   * reçoit immédiatement les nouvelles valeurs et recharge les données.
   *
   * Avantage de cette approche vs @Input : le composant reste synchronisé
   * même si l'URL change d'un autre endroit (ex: bouton précédent du navigateur).
   */
  ngOnInit() {
    this.subs.add(this.route.queryParams.subscribe(params => {
      this.centraleName = params['centrale'] || '';
      this.selectedDate = params['date']     || '';
      this.selectedHour = parseInt(params['hour'] || '12', 10);

      if (this.centraleName) {
        this.isVisible = true;      // déclenche l'animation d'entrée
        this.fetchAdditionalData(); // charge les données des tranches
      }
    }));
  }

  // ─── Construction des filtres ─────────────────────────────────────────────

  /**
   * Construit le dictionnaire de refinements pour filtrer les données
   * sur l'instant sélectionné (date + heure).
   * Utilisé dans fetchAdditionalData().
   */
  private getRefinements(): Record<string, string[]> {
    const hour = this.selectedHour.toString().padStart(2, '0');
    return {
      date_et_heure_fuseau_horaire_europe_paris: [this.selectedDate || new Date().toISOString().split('T')[0]],
      heure_fuseau_horaire_europe_paris: [hour]
    };
  }

  // ─── Navigation ───────────────────────────────────────────────────────────

  /**
   * Navigue vers la page histogramme en présélectionnant la tranche cliquée.
   *
   * Deux mécanismes de passage de données :
   *   1. Query params : centrale, tranche, date → persistés dans l'URL
   *      (permettent de partager le lien et de restaurer l'état).
   *   2. Router state : selectedCentraleData + centralesData → transmis
   *      en mémoire (non persisté dans l'URL, évite une URL trop longue).
   */
  goToHistogram(tranche: string): void {
    if (this.additionalData) {
      this.router.navigate(['/histogram'], {
        queryParams: {
          centrale: this.centraleName,
          tranche:  tranche,
          date:     this.selectedDate
        },
        state: {
          selectedCentraleData: {
            centrale: this.centraleName,
            tranches: this.additionalData
          },
          centralesData: this.centralesData
        }
      });
    }
  }

  // ─── Chargement des données ───────────────────────────────────────────────

  /**
   * Charge la liste des tranches de la centrale sélectionnée pour
   * l'instant sélectionné (date + heure).
   *
   * Filtres appliqués :
   *   - Refinements : date et heure exactes.
   *   - Clause WHERE : centrale = 'NOM' (égalité stricte).
   *   - Tri par nom de tranche (ASC) : T1 avant T2 avant T3...
   *
   * Le cast "(this.datasetService as any)" contourne la vérification
   * TypeScript sur le nombre d'arguments, car la signature publique
   * du service a été simplifiée pour le JSON local vs l'API d'origine
   * qui avait plus de paramètres.
   */
  fetchAdditionalData(): void {
    if (!this.centraleName) return;

    const refinements = this.getRefinements();

    (this.datasetService as any).getDatasetAllRecords(
      refinements,
      ['centrale', 'tranche', 'point_gps_modifie_pour_afficher_la_carte_opendata', 'puissance_disponible'],
      `centrale = '${this.centraleName}'`, // filtre sur le nom de la centrale
      'tranche ASC'                         // tri alphabétique des tranches
    ).subscribe({
      next: (data: any) => {
        // Adaptation format : API EDF → { results: [] } / JSON local → []
        this.additionalData = data.results || data;
        this.isVisible = true;
      },
      error: (error: any) => {
        console.error('Erreur lors de la récupération des données :', error);
        this.additionalData = null;
      }
    });
  }

  // ─── Fermeture du panneau ────────────────────────────────────────────────

  /**
   * Masque le panneau avec une animation (300 ms), puis émet closePanel
   * pour que MapComponent recentre la carte et mette à jour son état.
   *
   * Le délai de 300 ms correspond à la durée de la transition CSS
   * de fermeture définie dans centrale.component.scss.
   */
  close(): void {
    this.isVisible = false;
    setTimeout(() => {
      this.closePanel.emit();
    }, 300);
  }

  // ─── Calculs de puissance ────────────────────────────────────────────────

  /**
   * Calcule la puissance totale disponible de la centrale
   * (somme de toutes ses tranches à l'instant sélectionné).
   * Retourne 0 si les données ne sont pas encore chargées.
   */
  calculateTotalPower(): number {
    if (!this.additionalData) return 0;
    return this.additionalData.reduce((total, item) => total + item.puissance_disponible, 0);
  }

  /**
   * Calcule le pourcentage de puissance d'une tranche par rapport
   * à la tranche la plus puissante de la centrale.
   *
   * Utilisé pour afficher les barres de progression dans le panneau.
   * Exemple : si T1 = 900 MW et T2 = 1200 MW,
   *   T1 → (900/1200)*100 = 75%,  T2 → 100%.
   *
   * Note : on compare à la valeur max (pas à la puissance nominale)
   * pour que la barre la plus haute soit toujours à 100%,
   * rendant la comparaison visuelle entre tranches plus lisible.
   */
  calculatePowerPercentage(power: number): number {
    if (!this.additionalData || !this.additionalData.length) return 0;
    const maxPower = Math.max(...this.additionalData.map(item => item.puissance_disponible));
    return maxPower === 0 ? 0 : (power / maxPower) * 100;
  }

  // ─── Formatage ────────────────────────────────────────────────────────────

  /** Formate une date ISO en "12 janv. 2025" (locale française). */
  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('fr-FR', {
      day:   '2-digit',
      month: 'short',
      year:  'numeric'
    });
  }

  /** Formate une heure entière en "08:00", "14:00", etc. */
  formatHour(hour: number): string {
    return hour.toString().padStart(2, '0') + ':00';
  }
}
