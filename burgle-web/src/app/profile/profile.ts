import { Component, EventEmitter, Input, Output} from '@angular/core';
import {NgOptimizedImage} from '@angular/common';

export type Player = {
  gameCount: number;
  winCount: number;
  inventory: string[];
};

const LOOT_LIST = [
  'Bust', 'Stamp', 'Keycard', 'Cat', 'Gold', 'Goblet', 'Mirror',
  'Painting', 'Isotope', 'Gemstone', 'Tiara', 'Chihuahua'
];

@Component({
  selector: 'app-profile',
  standalone: true,
  template: `
    <div class="modal-overlay" (click)="backdropClick($event)">
      <div class="profile-card" (click)="$event.stopPropagation()">

        <div class="header">
          <h2>Profil: {{ playerName }}</h2>
          <button class="close-btn" (click)="close.emit()">×</button>
        </div>

        <div class="grid">

          <!-- BAL: STAT -->
          @if (player; as p) {
            <section class="panel stats">
              <h3>Játék statisztika</h3>

              <div class="donut-wrap">
                <svg viewBox="0 0 200 200" class="donut">

                  <circle cx="100" cy="100" r="70" class="donut-ring"/>

                  @if (p.gameCount > 0 && p.winCount > 0) {
                    <path
                      class="slice-wins"
                      [attr.d]="describeArc(100,100,70, -90, -90 + winsAngle(p))"/>
                  }

                  @if (p.gameCount > 0 && (p.gameCount - p.winCount) > 0) {
                    <path
                      class="slice-losses"
                      [attr.d]="describeArc(100,100,70, -90 + winsAngle(p), 270)"/>
                  }

                  @if (p.gameCount === 0) {
                    <text x="100" y="100" text-anchor="middle" dominant-baseline="middle"
                          class="empty-text">Nincs adat
                    </text>
                  }

                  <circle cx="100" cy="100" r="50" class="donut-hole"/>
                </svg>

                <div class="legend">
                  <div class="legend-item"><span class="dot wins"></span> Győzelem: <strong>{{ p.winCount }}</strong>
                  </div>
                  <div class="legend-item"><span class="dot losses"></span> Veszteség:
                    <strong>{{ p.gameCount - p.winCount }}</strong></div>
                  <div class="legend-item total">Összes: <strong>{{ p.gameCount }}</strong></div>
                </div>
              </div>
            </section>
          }

          <!-- JOBB: VITRIN -->
          @if (player; as p) {
            <section class="panel vitrin">
              <h3>Loot vitrin</h3>

              <div class="vitrin-grid">
                @for (loot of lootList; track loot) {
                  <div
                    class="vitrin-slot"
                    [class.owned]="p.inventory?.includes(loot)"
                    [class.locked]="!p.inventory?.includes(loot)"
                    [title]="p.inventory?.includes(loot) ? loot : loot + ' (hiányzik)'"
                  >
                    @let imgUrl = lootImg(loot);
                    @if (imgUrl && imgUrl != '') {
                    <img class="loot-img"
                         [ngSrc]="imgUrl"
                         width="1"
                         height="1"
                         [alt]="loot">
                    }
                  </div>
                }
              </div>
            </section>
          }

        </div>
      </div>
    </div>
  `,
  imports: [
    NgOptimizedImage
  ],
  styles: [`
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      display: grid;
      place-items: center;
      z-index: 9999;
      padding: 1rem;
    }

    .profile-card {
      width: 100%;
      max-width: 900px;
      background: white;
      border-radius: 1rem;
      padding: 1rem 1.25rem;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.25);
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: .75rem;
    }

    .header h2 {
      margin: 0;
      font-size: 1.25rem;
      color: #1a202c;
    }

    .close-btn {
      background: #edf2f7;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: .25rem .5rem;
      cursor: pointer;
      font-size: 1.25rem;
    }

    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }

    @media (max-width: 800px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }

    .panel {
      background: #fdfdfd;
      border: 1px solid #edf2f7;
      border-radius: .75rem;
      padding: 1rem;
    }

    .panel h3 {
      margin: 0 0 .6rem 0;
    }

    /* Donut */
    .donut-wrap {
      display: grid;
      justify-items: center;
      gap: .5rem;
    }

    .donut {
      width: 250px;
      height: 250px;
    }

    .donut-ring {
      stroke: #e6eef7;
      stroke-width: 20;
      fill: none;
    }

    .slice-wins {
      stroke: #2f855a;
      stroke-width: 20;
      fill: none;
    }

    .slice-losses {
      stroke: #e53e3e;
      stroke-width: 20;
      fill: none;
    }

    .donut-hole {
      fill: white;
    }

    .empty-text {
      fill: #a0aec0;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: .35rem;
      font-size: .9rem;
    }

    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      display: inline-block;
    }

    .dot.wins {
      background: #2f855a;
    }

    .dot.losses {
      background: #e53e3e;
    }

    /* Vitrin */
    .vitrin-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: .75rem;
      position: relative;
    }

    @media (max-width: 600px) {
      .vitrin-grid {
        grid-template-columns: repeat(3, 1fr);
      }
    }

    .vitrin-slot {
      border: 1px solid #e2e8f0;
      border-radius: .5rem;
      padding: .5rem;
      text-align: center;
      display: grid;
      gap: .35rem;
      transition: transform .15s ease, box-shadow .15s ease;
      z-index: 1;
      position: relative;
    }

    .vitrin-slot.owned {
      border-color: #9ae6b4;
      box-shadow: 0 2px 8px rgba(47, 133, 90, 1);

    }

    .vitrin-slot.locked {
      filter: grayscale(100%);
    }

    .loot-img {
      width: 100px;
      height: 100px;
      object-fit: contain;
      z-index: 1;
    }
    .loot-img:hover {
      scale: 3;
      z-index: 10;
    }

    .vitrin-slot:hover {
      z-index: 1000;
    }

      .loot-name {
      font-size: .85rem;
    }
  `]
})
export class ProfileComponent{

  @Input({ required: true }) player!: Player;
  @Input({ required: true }) playerName!: string;
  @Output() close = new EventEmitter<void>();

  lootList = LOOT_LIST;

  backdropClick(ev: MouseEvent) {
    if (ev.target === ev.currentTarget) {
      this.close.emit();
    }
  }

  winsAngle(p: Player): number {
    if (!p.gameCount) return 0;
    return (p.winCount / p.gameCount) * 360;
  }

  describeArc(cx: number, cy: number, r: number, start: number, end: number): string {
    const s = this.polar(cx, cy, r, end);
    const e = this.polar(cx, cy, r, start);
    const large = end - start <= 180 ? 0 : 1;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y}`;
  }

  polar(cx: number, cy: number, r: number, angle: number) {
    const rad = (angle - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  lootImg(name: string): string {
    const slug = name.toLowerCase();
    return `assets/loot-${slug}.png`;
  }

}
