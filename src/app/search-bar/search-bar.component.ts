// ============================================================
// search-bar.component.ts
// Barre de recherche de centrale nucléaire avec autocomplétion.
//
// Rôle :
//   Affichée sur la page d'accueil (hero section). Permet à l'utilisateur
//   de taper le nom d'une centrale et de naviguer directement vers la
//   page carte avec cette centrale présélectionnée.
//
// Fonctionnement :
//   1. Au chargement, la liste de toutes les centrales est extraite depuis
//      donnees_daily.json (via getDailyRecords), dédupliquée et triée.
//   2. À chaque frappe (onInput), les noms de centrales correspondant à
//      la saisie sont filtrés et proposés dans un menu déroulant.
//   3. La sélection (clic ou Entrée) navigue vers /carte?centrale=NOM,
//      ce qui déclenche l'auto-sélection de la centrale dans MapComponent.
//
// Navigation clavier :
//   - Flèche Bas / Haut : déplace la sélection dans la liste.
//   - Entrée : valide la suggestion sélectionnée (ou la seule
//     correspondance si une seule existe, ou la correspondance exacte).
//
// Fermeture automatique :
//   @HostListener('document:click') ferme le dropdown si l'utilisateur
//   clique en dehors du composant (comportement standard d'un select).
// ============================================================

import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { Router } from '@angular/router';
import { DatasetService } from '../srvices/dataset.service';

@Component({
  selector: 'app-search-bar',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './search-bar.component.html',
  styleUrl: './search-bar.component.scss'
})
export class SearchBarComponent implements OnInit {

  // ─── État de la barre de recherche ───────────────────────────────────────

  // Texte saisi par l'utilisateur, lié à l'<input> via [(ngModel)].
  query = '';

  // Liste complète des noms de centrales (chargée une seule fois au démarrage).
  allCentrales: string[] = [];

  // Sous-ensemble de allCentrales correspondant à la saisie courante.
  // Affiché dans le menu déroulant.
  suggestions: string[] = [];

  // Contrôle la visibilité du menu déroulant d'autocomplétion.
  showDropdown = false;

  // Index de la suggestion actuellement mise en surbrillance
  // (navigation clavier). -1 = aucune sélection.
  selectedIndex = -1;

  constructor(
    private datasetService: DatasetService,
    private router: Router
  ) {}

  // ─── Cycle de vie Angular ─────────────────────────────────────────────────

  /**
   * Charge la liste des centrales depuis donnees_daily.json.
   * Le fallback sur getDataset() permet de continuer si getDailyRecords
   * échoue (ex : fichier daily absent en développement).
   */
  ngOnInit(): void {
    (this.datasetService as any).getDailyRecords({}).subscribe({
      next: (data: any[]) => this.extractCentrales(data),
      error: () => {
        // Fallback : on essaie le fichier hourly complet (plus lourd)
        this.datasetService.getDataset().subscribe({
          next: (data: any) => this.extractCentrales(Array.isArray(data) ? data : (data.results || []))
        });
      }
    });
  }

  // ─── Extraction et dédupliquage des centrales ─────────────────────────────

  /**
   * Extrait les noms de centrales uniques depuis un tableau d'enregistrements,
   * en éliminant les doublons (Set) et en triant alphabétiquement.
   * filter(Boolean) élimine les entrées null / undefined / ''.
   */
  private extractCentrales(records: any[]): void {
    this.allCentrales = [...new Set(
      records.map((r: any) => r.centrale).filter(Boolean)
    )].sort() as string[];
  }

  // ─── Logique d'autocomplétion ─────────────────────────────────────────────

  /**
   * Appelée à chaque frappe dans l'input.
   * Filtre les centrales dont le nom contient la saisie (insensible à la
   * casse grâce à toUpperCase). Met à jour la liste de suggestions et
   * réinitialise la sélection clavier.
   */
  onInput(): void {
    const q = this.query.trim().toUpperCase();
    this.selectedIndex = -1; // réinitialise la navigation clavier

    if (!q) {
      this.suggestions  = [];
      this.showDropdown = false;
      return;
    }

    // includes() : on cherche le terme n'importe où dans le nom (pas juste en début)
    this.suggestions  = this.allCentrales.filter(c => c.toUpperCase().includes(q));
    this.showDropdown = this.suggestions.length > 0;
  }

  // ─── Navigation clavier ───────────────────────────────────────────────────

  /**
   * Déplace la sélection dans la liste de suggestions.
   * dir = +1 (flèche bas) ou -1 (flèche haut).
   * Math.max/min contraint l'index entre -1 (rien sélectionné)
   * et length-1 (dernière suggestion).
   */
  moveSelection(dir: number): void {
    if (!this.showDropdown) return;
    this.selectedIndex = Math.max(
      -1,
      Math.min(this.suggestions.length - 1, this.selectedIndex + dir)
    );
  }

  // ─── Sélection et navigation ──────────────────────────────────────────────

  /**
   * Sélectionne une centrale et navigue vers la carte.
   * Appelée au clic sur une suggestion ou depuis onSubmit().
   * queryParams: { centrale } → MapComponent lit ce param dans ngOnInit
   * et auto-sélectionne le marqueur correspondant.
   */
  select(centrale: string): void {
    this.query        = centrale;
    this.showDropdown = false;
    this.selectedIndex = -1;
    this.router.navigate(['/home'], { queryParams: { centrale } });
  }

  /**
   * Gère la touche Entrée dans l'input.
   * Priorité :
   *   1. Si une suggestion est mise en surbrillance → on la sélectionne.
   *   2. Si une seule suggestion existe → on la sélectionne directement.
   *   3. Si la saisie correspond exactement à un nom (insensible casse) → on l'utilise.
   *   4. Sinon : rien (l'utilisateur doit préciser sa saisie).
   */
  onSubmit(): void {
    if (this.selectedIndex >= 0 && this.suggestions[this.selectedIndex]) {
      this.select(this.suggestions[this.selectedIndex]);
    } else if (this.suggestions.length === 1) {
      this.select(this.suggestions[0]);
    } else {
      const exact = this.allCentrales.find(
        c => c.toUpperCase() === this.query.trim().toUpperCase()
      );
      if (exact) this.select(exact);
    }
  }

  // ─── Fermeture au clic extérieur ─────────────────────────────────────────

  /**
   * Ferme le dropdown si l'utilisateur clique en dehors du composant.
   * closest('.search-box') remonte l'arbre DOM depuis la cible du clic :
   * si elle ne trouve pas l'ancêtre .search-box, le clic est extérieur.
   */
  @HostListener('document:click', ['$event'])
  onClickOutside(event: Event): void {
    if (!(event.target as HTMLElement).closest('.search-box')) {
      this.showDropdown = false;
    }
  }
}
