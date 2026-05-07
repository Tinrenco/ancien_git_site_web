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
  query = '';
  allCentrales: string[] = [];
  suggestions: string[] = [];
  showDropdown = false;
  selectedIndex = -1;

  constructor(
    private datasetService: DatasetService,
    private router: Router
  ) {}

  ngOnInit(): void {
    (this.datasetService as any).getDailyRecords({}).subscribe({
      next: (data: any[]) => this.extractCentrales(data),
      error: () => {
        this.datasetService.getDataset().subscribe({
          next: (data: any) => this.extractCentrales(Array.isArray(data) ? data : (data.results || []))
        });
      }
    });
  }

  private extractCentrales(records: any[]): void {
    this.allCentrales = [...new Set(
      records.map((r: any) => r.centrale).filter(Boolean)
    )].sort() as string[];
  }

  onInput(): void {
    const q = this.query.trim().toUpperCase();
    this.selectedIndex = -1;
    if (!q) {
      this.suggestions = [];
      this.showDropdown = false;
      return;
    }
    this.suggestions = this.allCentrales.filter(c => c.toUpperCase().includes(q));
    this.showDropdown = this.suggestions.length > 0;
  }

  moveSelection(dir: number): void {
    if (!this.showDropdown) return;
    this.selectedIndex = Math.max(-1, Math.min(this.suggestions.length - 1, this.selectedIndex + dir));
  }

  select(centrale: string): void {
    this.query = centrale;
    this.showDropdown = false;
    this.selectedIndex = -1;
    this.router.navigate(['/carte'], { queryParams: { centrale } });
  }

  onSubmit(): void {
    if (this.selectedIndex >= 0 && this.suggestions[this.selectedIndex]) {
      this.select(this.suggestions[this.selectedIndex]);
    } else if (this.suggestions.length === 1) {
      this.select(this.suggestions[0]);
    } else {
      const exact = this.allCentrales.find(c => c.toUpperCase() === this.query.trim().toUpperCase());
      if (exact) this.select(exact);
    }
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: Event): void {
    if (!(event.target as HTMLElement).closest('.search-box')) {
      this.showDropdown = false;
    }
  }
}
