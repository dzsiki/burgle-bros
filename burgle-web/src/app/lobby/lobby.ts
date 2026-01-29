
import { Component, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RoomService, Room, getRoomDisplayName } from '../services/room';
import { loadPlayerName, savePlayerName } from '../services/player-storage';
import { Router } from '@angular/router';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [AsyncPipe, FormsModule],
  template: `
    <div class="lobby-container">
      <header class="lobby-header">
        <div class="brand">
          <span class="logo">🎲</span>
          <h1>Burgle Bros</h1>
        </div>
        @if (savedName) {
          <div class="user-info">
            <span class="welcome">Szia, <strong>{{ savedName }}</strong>!</span>
            <button class="btn btn-text" (click)="clearName()">Kilépés</button>
          </div>
        }
      </header>

      <main class="lobby-content">
        @if (!savedName) {
          <div class="setup-card">
            <h2>Üdvözlünk a Burgle Bros-ban!</h2>
            <p>A kezdéshez kérlek add meg a nevedet, amit a többiek látni fognak.</p>

            <div class="input-group">
              <input [(ngModel)]="playerName" placeholder="Hogy hívnak?" (keyup.enter)="playerName.trim() && saveName()" />
              <button class="btn btn-primary" (click)="saveName()" [disabled]="!playerName.trim()">
                Mentés és belépés
              </button>
            </div>
          </div>
        } @else {
          <div class="rooms-section">
            <div class="section-header">
              <h2>Elérhető szobák</h2>
              <span class="badge badge-outline">{{ (rooms$ | async)?.length || 0 }} aktív</span>
            </div>

            <div class="rooms-grid">
              @if (rooms$ | async; as rooms) {
                @for (r of rooms; track r.id) {
                  <div class="room-card" [class.is-playing]="r.phase !== 'lobby'">
                    <div class="room-card-header">
                      <div class="room-title">
                        <h3>{{ getRoomDisplayName(r.id) }}</h3>
                      </div>
                      <div class="status-badge" [class]="r.phase">
                        {{ r.phase === 'lobby' ? 'Várakozás' : 'Játék' }}
                      </div>
                    </div>

                    <div class="room-card-body">
                      <div class="player-count">
                         <strong>Játékosok:</strong> {{ r.players.length }}/10
                      </div>

                      <div class="player-chips">
                        @for (p of r.players; track p) {
                          <div class="player-chip" [class.is-me]="p === savedName">
                            <span class="player-icon">{{ p[0].toUpperCase() }}</span>
                            <span class="player-name">{{ p }}</span>
                            @if (r.phase === 'lobby') {
                              <button class="remove-btn" (click)="remove(r.id, p)" [title]="p === savedName ? 'Kilépés' : 'Eltávolítás'">×</button>
                            }
                          </div>
                        }
                        @if (r.players.length === 0) {
                          <span class="empty-msg">Még nincs játékos.</span>
                        }
                      </div>
                    </div>

                    <div class="room-card-actions">
                      <button class="btn btn-full"
                        [class.btn-primary]="r.phase === 'lobby'"
                        [class.btn-outline]="r.phase !== 'lobby'"
                        (click)="join(r)"
                        [disabled]="r.players.length >= 10 && r.phase === 'lobby'">
                        {{ r.phase === 'lobby' ? 'Csatlakozás' : 'Megtekintés' }}
                      </button>
                    </div>
                  </div>
                } @empty {
                   <div class="empty-state">
                     <p>Nincs szoba a rendszerben.</p>
                   </div>
                }
              } @else {
                <div class="loading-state">Szobák betöltése...</div>
              }
            </div>
          </div>
        }
      </main>
    </div>

    <style>
      :host {
        display: block;
        height: 100vh;
        min-height: 100dvh;
        background-color: #f7fafc;
        font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        color: #2d3748;
        overflow-y: auto;
      }

      .lobby-container {
        max-width: 1000px;
        margin: 0 auto;
        padding: 2rem 1rem;
      }

      .lobby-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 3rem;
      }

      .lobby-content {
        overflow:auto;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 1rem;
      }

      .logo { font-size: 2.5rem; }
      .brand h1 { margin: 0; font-size: 1.8rem; font-weight: 800; color: #1a202c; letter-spacing: -0.025em; }

      .user-info {
        display: flex;
        align-items: center;
        gap: 1rem;
        background: white;
        padding: 0.5rem 1rem;
        border-radius: 9999px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      }

      .welcome { font-size: 0.9rem; }

      .setup-card {
        background: white;
        padding: 3rem;
        border-radius: 1rem;
        box-shadow: 0 4px 6px rgba(0,0,0,0.05), 0 10px 15px rgba(0,0,0,0.1);
        text-align: center;
        max-width: 500px;
        margin: 4rem auto;
      }

      .setup-card h2 { margin-top: 0; margin-bottom: 1rem; color: #1a202c; }
      .setup-card p { color: #718096; margin-bottom: 2rem; }

      .input-group {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      .input-group input {
        padding: 0.8rem 1rem;
        border: 2px solid #e2e8f0;
        border-radius: 0.5rem;
        font-size: 1rem;
        transition: border-color 0.2s;
      }

      .input-group input:focus {
        outline: none;
        border-color: #4299e1;
      }

      .rooms-section {
        display: flex;
        flex-direction: column;
        gap: 2rem;
      }

      .section-header {
        display: flex;
        align-items: center;
        gap: 1rem;
      }

      .section-header h2 { margin: 0; font-size: 1.5rem; }

      .badge {
        padding: 0.25rem 0.75rem;
        border-radius: 9999px;
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
      }

      .badge-outline {
        border: 1px solid #cbd5e0;
        color: #718096;
      }

      .rooms-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 1.5rem;
      }

      .room-card {
        background: white;
        border-radius: 0.75rem;
        box-shadow: 0 4px 6px rgba(0,0,0,0.05);
        display: flex;
        flex-direction: column;
        transition: transform 0.2s, box-shadow 0.2s;
        border: 1px solid #edf2f7;
      }

      .room-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 10px 15px rgba(0,0,0,0.1);
      }

      .room-card-header {
        padding: 1.25rem;
        border-bottom: 1px solid #edf2f7;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      }

      .room-title h3 { margin: 0; font-size: 1.1rem; color: #1a202c; }
      .room-id { font-size: 0.7rem; color: #a0aec0; font-family: monospace; }

      .status-badge {
        padding: 0.25rem 0.6rem;
        border-radius: 4px;
        font-size: 0.7rem;
        font-weight: 700;
      }

      .status-badge.lobby { background: #ebf8ff; color: #2b6cb0; }
      .status-badge.play { background: #f0fff4; color: #2f855a; }

      .room-card-body {
        padding: 1.25rem;
        flex: 1;
      }

      .player-count { font-size: 0.85rem; margin-bottom: 0.75rem; color: #4a5568; }

      .player-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }

      .player-chip {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        background: #f7fafc;
        border: 1px solid #e2e8f0;
        padding: 0.2rem 0.5rem;
        border-radius: 6px;
        font-size: 0.8rem;
      }

      .player-chip.is-me {
        background: #ebf8ff;
        border-color: #bee3f8;
        color: #2b6cb0;
      }

      .player-icon {
        width: 20px;
        height: 20px;
        background: white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.7rem;
        font-weight: 800;
        box-shadow: 0 1px 2px rgba(0,0,0,0.1);
      }

      .remove-btn {
        background: none;
        border: none;
        color: #a0aec0;
        cursor: pointer;
        font-size: 1.1rem;
        line-height: 1;
        padding: 0 0.2rem;
        transition: color 0.2s;
      }

      .remove-btn:hover { color: #e53e3e; }

      .room-card-actions {
        padding: 1.25rem;
        padding-top: 0;
      }

      .btn {
        padding: 0.6rem 1.2rem;
        border-radius: 0.5rem;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s;
        border: none;
        font-size: 0.9rem;
      }

      .btn-primary { background: #4299e1; color: white; }
      .btn-primary:hover:not(:disabled) { background: #3182ce; }
      .btn-outline { background: white; border: 2px solid #e2e8f0; color: #4a5568; }
      .btn-outline:hover:not(:disabled) { border-color: #cbd5e0; background: #f7fafc; }
      .btn-text { background: transparent; color: #a0aec0; font-weight: 600; padding: 0.25rem 0.5rem; }
      .btn-text:hover { color: #e53e3e; }
      .btn-full { width: 100%; }
      .btn:disabled { opacity: 0.5; cursor: not-allowed; }

      .empty-state, .loading-state {
        grid-column: 1 / -1;
        text-align: center;
        padding: 4rem;
        background: white;
        border-radius: 1rem;
        color: #718096;
        border: 2px dashed #e2e8f0;
      }

      .empty-msg { font-size: 0.85rem; color: #a0aec0; font-style: italic; }
    </style>
  `,
})
export class LobbyComponent {
  protected getRoomDisplayName = getRoomDisplayName;
  private roomService = inject(RoomService);

  playerName = '';
  savedName = '';
  rooms$ = this.roomService.listRooms(); // csak akkor renderelődik, ha savedName van

  constructor() {
    // induláskor betöltjük a mentett nevet
    this.savedName = loadPlayerName();
    this.playerName = this.savedName; // kényelmi: inputba is beírjuk
  }

  saveName() {
    const clean = (this.playerName ?? '').trim();
    if (!clean) return;
    savePlayerName(clean);
    this.savedName = clean;
  }

  clearName() {
    // localStorage törlés
    localStorage.removeItem('burgle_player_name');
    // cookie törlés
    document.cookie = `burgle_player_name=; Max-Age=0; Path=/; SameSite=Lax`;

    this.savedName = '';
    this.playerName = '';
  }


  private router = inject(Router);

  async join(room: Room & { id: string }) {
    if (room.phase === 'lobby') {
      await this.roomService.joinRoom(room.id, this.savedName);
    }
    await this.router.navigate(['/room', room.id]);
  }



  async remove(roomId: string, name: string) {
    // opcionális: egy kis védelem, nehogy véletlen katt legyen
    const ok = confirm(`Biztos törlöd: ${name}?`);
    if (!ok) return;

    await this.roomService.removePlayer(roomId, name);
  }

}
