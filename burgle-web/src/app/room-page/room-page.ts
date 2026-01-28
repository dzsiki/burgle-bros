import { Component, inject, HostListener, ChangeDetectorRef } from '@angular/core';
import {AsyncPipe, NgOptimizedImage} from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { RoomService, Room, GameState, getRoomDisplayName } from '../services/room';
import { loadPlayerName } from '../services/player-storage';
import { Router } from '@angular/router';
import { generateGame } from '../services/game-generator';
import {tap, take, firstValueFrom} from 'rxjs';

@Component({
  selector: 'app-room-page',
  standalone: true,
  imports: [AsyncPipe, NgOptimizedImage],
  template: `
    @if (room$ | async; as room) {
      <div class="header-bar">
        <div class="header-left">
          <div class="room-info">
            <h1>{{ getRoomDisplayName(roomId) }}</h1>
            <div class="status-badge" [class]="room.phase">
              {{ room.phase === 'lobby' ? 'Várakozás' : 'Játék' }}
              @if (isSpectator(room)) {
                (Megfigyelő)
              }
            </div>
          </div>

          <div class="room-details">
            <div class="detail-item seed-item">
              <span class="label">Seed:</span>
              @if (room.phase === 'lobby') {
                <input class="seed-input" [value]="room.seed" (change)="updateSeed($event)"/>
              } @else {
                <span class="value">{{ room.seed }}</span>
              }
            </div>

            <div class="detail-item players-item">
              <span class="label">Játékosok:</span>
              <div class="player-chips">
                @for (p of room.players; track p) {
                  <div class="player-chip" [class.is-me]="p === playerName">
                    <span class="player-icon">{{ p[0].toUpperCase() }}</span>
                    {{ p }}
                  </div>
                }
              </div>
            </div>
          </div>
        </div>

        <div class="header-actions">
          <button class="btn btn-outline"
                  (click)="leave()"
                  [disabled]="room.phase !== 'lobby' && !isSpectator(room)"
                  [title]="room.phase !== 'lobby' && !isSpectator(room) ? 'Játék közben nem lehet kilépni' : ''"
          >← Kilépés
          </button>

          @if (room.phase !== 'lobby' || isSpectator(room)) {
            <button class="btn btn-outline" (click)="router.navigate(['/'])">Főoldal</button>
          }

          @if (room.phase === 'play' && !isSpectator(room)) {
            <button class="btn btn-danger" (click)="reset(roomId)">Reset</button>
          }
        </div>
      </div>

      <div class="main-content">
        @if (room.phase === 'lobby') {
          <div class="lobby-start">
            <button class="btn btn-primary btn-large" (click)="start(room)">Játék indítása</button>
          </div>
        } @else if (room.phase === 'play') {
          <div class="game-layout">
            <div class="side-panel-left"></div>
            <div class="game-area">
              @if (room.game) {
                <div class="floor-navigation">
                  <button class="nav-btn" [disabled]="activeFloorIdx === 0" (click)="changeFloor(-1)">◀</button>
                  <div class="floor-indicator">{{ activeFloorIdx + 1 }}. szint</div>
                  <button class="nav-btn" [disabled]="activeFloorIdx === 2" (click)="changeFloor(1)">▶</button>
                </div>

                <div class="floors-container">
                  @let floor = room.game.floors[activeFloorIdx];
                  <div class="floor">
                    <div class="grid">
                      @for (tile of floor.tiles; track $index; let tIdx = $index) {
                        <div class="tile"
                             [class.revealed]="tile.revealed"
                             [class.clickable]="canInteract(room, activeFloorIdx, tIdx)"
                             [class.edge-top]="tIdx < 4"
                             [class.edge-bottom]="tIdx >= 12"
                             [class.edge-left]="tIdx % 4 === 0"
                             [class.edge-right]="tIdx % 4 === 3"
                             (click)="handleTileClick(room, activeFloorIdx, tIdx)">

                          <!-- Movement arrows for current tile -->
                          @if (isCurrentPlayerTile(room, activeFloorIdx, tIdx)) {
                            <div class="arrows-container">
                              @if (canMove(room, activeFloorIdx, tIdx, 'up')) {
                                <div class="arrow arrow-up" (click)="handleArrowMove($event, room, 'up')">▲</div>
                              }
                              @if (canMove(room, activeFloorIdx, tIdx, 'right')) {
                                <div class="arrow arrow-right" (click)="handleArrowMove($event, room, 'right')">▶</div>
                              }
                              @if (canMove(room, activeFloorIdx, tIdx, 'bottom')) {
                                <div class="arrow arrow-bottom" (click)="handleArrowMove($event, room, 'bottom')">▼
                                </div>
                              }
                              @if (canMove(room, activeFloorIdx, tIdx, 'left')) {
                                <div class="arrow arrow-left" (click)="handleArrowMove($event, room, 'left')">◀</div>
                              }
                              @if (canMove(room, activeFloorIdx, tIdx, 'floorUp')) {
                                <div class="arrow arrow-floor-up" (click)="handleArrowMove($event, room, 'floorUp')">↑
                                </div>
                              }
                              @if (canMove(room, activeFloorIdx, tIdx, 'floorDown')) {
                                <div class="arrow arrow-floor-down"
                                     (click)="handleArrowMove($event, room, 'floorDown')">
                                  ↓
                                </div>
                              }
                            </div>
                          }

                          @if (activeFloorIdx > 0 && room.game.floors[activeFloorIdx - 1].tiles[tIdx].type === 'Stairs' && tile.revealed) {
                            <div class="down-exit-mark" title="Lejárat az alsó szintről">▼</div>
                          }
                          @if (tile.type === 'Toilet' && tile.revealed) {
                            <div class="tokennumber" title="Token mennyiség">{{ tile.tokens }}</div>
                          }
                          @if (tile.type === 'ComputerFingerprint' && tile.revealed) {
                            <div class="tokennumber" title="Token mennyiség">{{ room.game?.hackFingerprint }}
                              @if (isCurrentPlayerTile(room, activeFloorIdx, tIdx)) {
                                <button (click)="addToken(room,'fingerprint')" class="tokennumber plustoken btn btn-primary">+1</button>
                              }
                            </div>
                          }
                          @if (tile.type === 'ComputerMotion' && tile.revealed) {
                            <div class="tokennumber" title="Token mennyiség">{{ room.game?.hackMotion }}
                              @if (isCurrentPlayerTile(room, activeFloorIdx, tIdx)) {
                                <button (click)="addToken(room,'motion')" class="tokennumber plustoken btn btn-primary">+1</button>
                              }
                            </div>
                          }
                          @if (tile.type === 'ComputerLaser' && tile.revealed) {
                            <div class="tokennumber" title="Token mennyiség">{{ room.game?.hackLaser }}
                              @if (isCurrentPlayerTile(room, activeFloorIdx, tIdx)) {
                                <button (click)="addToken(room,'laser')" class="tokennumber plustoken btn btn-primary">+1</button>
                              }
                            </div>
                          }
                          @if (tile.type === 'Safe' && tile.revealed) {
                            <div class="tokennumber" title="Token mennyiség">{{ tile.tokens }}
                              @if (isCurrentPlayerTile(room, activeFloorIdx, tIdx)) {
                                <button (click)="addToken(room,'safe', activeFloorIdx, tIdx)" class="tokennumber plustoken btn btn-primary">+1</button>
                              }
                            </div>
                          }
                          @if (tile.type === 'Keypad' && tile.revealed) {
                            <div class="tokennumber" title="Locked">
                              {{KeypadOpened(room, activeFloorIdx, tIdx) ? '🟩' : '🔒'}}
                            </div>
                          }

                          <!-- Show image for revealed tiles if matching asset exists; otherwise fall back to text -->
                          @if (tile.revealed) {
                            @let imgUrl = getOrLoadTileImage('room-' + tile.type);
                            @if (imgUrl && imgUrl != '') {
                              <img class="tile-img" [ngSrc]="imgUrl" width="1" height="1" alt="{{ tile.type }}"/>
                            } @else {
                              <span class="tile-type">{{ tile.type }}</span>
                            }
                          } @else {
                            <span class="tile-type">?</span>
                          }

                          <!-- Guard figure if a guard is on this tile -->
                          @if (isGuardOnTile(room, activeFloorIdx, tIdx)) {
                            <div class="guard-figure" title="Őr">🛡️</div>
                          }
                          <!-- Crosshair if this tile is a guard's target -->
                          @if (isGuardTargetTile(room, activeFloorIdx, tIdx)) {
                            <div class="guard-target" title="Őr célpont">🎯</div>
                          }
                          @if (isAlarmOnTile(room, activeFloorIdx, tIdx)) {
                            <div class="guard-target" title="Alarm">🚨</div>
                          }

                          <div class="walls">
                            <div class="wall wall-top" [class.is-real]="tile.walls.top"></div>
                            <div class="wall wall-right" [class.is-real]="tile.walls.right"></div>
                            <div class="wall wall-bottom" [class.is-real]="tile.walls.bottom"></div>
                            <div class="wall wall-left" [class.is-real]="tile.walls.left"></div>
                          </div>
                          <div class="players-on-tile">
                            @for (pName of getPlayersOnTile(room, activeFloorIdx, tIdx); track pName) {
                              <div class="player-pawn" [title]="pName"
                                   [class.is-me]="pName === playerName">{{ pName[0].toUpperCase() }}
                              </div>
                            }
                          </div>
                          @if (tile.revealed) {
                            @if (tile.type !== 'Safe') {
                              <div [class.numberCracked]="tile.cracked" class="tile-number number-on-tile" [title]="tile.number">{{ tile.number }}</div>
                            } @else if (isCurrentPlayerTile(room, activeFloorIdx, tIdx)) {
                              <button (click)="crackSafe(room, activeFloorIdx, tIdx)" class="tokennumber plustoken crackbtn btn btn-primary">🔑</button>
                            }
                          }

                          @if (isGuardPathDir(room, activeFloorIdx, tIdx, 'up')) {
                            <div class="guard-path-bar bar-up"></div>
                          }
                          @if (isGuardPathDir(room, activeFloorIdx, tIdx, 'right')) {
                            <div class="guard-path-bar bar-right"></div>
                          }
                          @if (isGuardPathDir(room, activeFloorIdx, tIdx, 'down')) {
                            <div class="guard-path-bar bar-down"></div>
                          }
                          @if (isGuardPathDir(room, activeFloorIdx, tIdx, 'left')) {
                            <div class="guard-path-bar bar-left"></div>
                          }
                          @if (isGuardReachableThisTurn(room, activeFloorIdx, tIdx)) {
                            <div class="guard-path-dot"></div>
                          }
                        </div>
                      }
                    </div>
                  </div>
                </div>
              } @else {
                <p style="padding: 20px; text-align: center;">Pálya betöltése...</p>
              }
            </div>
            <div class="side-panel-right">
              <div class="hacks panel-top">
                <div>Motion hacks:  {{ room.game?.hackMotion }}</div>
                <div>Laser hacks:   {{ room.game?.hackLaser }}</div>
                <div>Fingerprint hacks: {{ room.game?.hackFingerprint }}</div>


                <div class="dice-container panel-dice">
                  @for (die of diceValues; track $index) {
                    <div class="dice">{{ diceMap[die] }}</div>
                  }
                </div>

              </div>
              <div class="panel-middle">
                <div class="HP">
                  @for (i of [0, 1, 2]; track $index) {
                    @let imgUrl = getOrLoadTileImage((i < (room.game?.healths?.[playerName] ?? 0)) ? 'ghost' : 'ghostdead');
                    @if (imgUrl && imgUrl != '') {
                      <img [ngSrc]="imgUrl"
                           width="1" height="1" class="hp-icon" alt="HP"/>
                    }
                  }
                </div>
                <div class="ap-counter">
                  Action Points: {{ room.game?.currentAP ?? 0 }}
                </div>
              </div>
              <div class="panel-bottom endturnbtn">
                <button class="btn btn-primary endturnbtn"
                        [disabled]="!isMyTurn(room)"
                        (click)="endTurn(room)">
                  End Turn
                </button>
              </div>
            </div>
          </div>
        }
      </div>

      @if (showAPDialog) {
        <div class="ap-dialog-backdrop">
          <div class="ap-dialog">
            <h3>Mennyi Action Pointot használsz?</h3>
            <p>(1 AP → Alarm aktiválódik, 2 AP → biztonságos)</p>

            <div class="ap-dialog-buttons">
              <button class="btn btn-danger" (click)="resolveAPDialog(false)">1 AP</button>
              <button class="btn btn-success" (click)="resolveAPDialog(true)">2 AP</button>
            </div>
          </div>
        </div>
      }


      <style>
        @import './room-page.scss';
      </style>

    } @else {
      <div style="padding: 20px;">Betöltés...</div>
    }
  `,
})
export class RoomPageComponent {
  protected getRoomDisplayName = getRoomDisplayName;
  private route = inject(ActivatedRoute);
  protected router = inject(Router);
  private roomService = inject(RoomService);
  private cdr = inject(ChangeDetectorRef);
  private seed = '';
  private seednum = 0;
  protected diceValues = [0, 0, 0, 0, 0, 0];
  diceMap = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

  roomId = this.route.snapshot.paramMap.get('id')!;

  private currentPhase: 'lobby' | 'play' | 'end' = 'lobby';

  room$ = this.roomService.watchRoom(this.roomId).pipe(
    tap(r => {
      if (r) {
        this.seed = r.seed;
        this.currentPhase = r.phase;
        // Ha most kezdődött a játék és van pozíciónk, ugorjunk oda
        if (r.phase === 'play' && r.game) {
          const myPos = r.game.playerPositions?.[this.playerName ?? ''];
          if (myPos && this.activeFloorIdx === 0 && myPos.floor !== 0) {
            // Ez csak az első betöltéskor/induláskor érdekes, ha nem az 1. szinten vagyunk
            // De mivel alapértelmezettnek az 1. szintet kérték, talán jobb nem ugrálni magától
            // kivéve ha tényleg ott vagyunk.
          }
        }
      }
    })
  );


  // mentett név
  protected activeFloorIdx = 0;

  playerName = loadPlayerName();

  // hogy ne fusson le kétszer
  private alreadyLeft = false;

  // cache for tile images: type -> resolved asset url or null if none found
  private tileImageCache: Record<string, string | null> = {};
  private animatation: boolean = false;

  /**
   * Returns a cached asset URL for a tile type if already found.
   * If not yet known, starts loading candidates and returns null for now.
   */
  protected getOrLoadTileImage(type?: string): string | null {
    if (!type) return null;
    if (this.tileImageCache.hasOwnProperty(type)) return this.tileImageCache[type];

    // mark as loading (temporarily null) and try candidate paths
    this.tileImageCache[type] = null;

    const candidates = [
      `/assets/${type.toLowerCase()}.png`,
    ];

    const tryLoad = (idx: number) => {
      if (idx >= candidates.length) {
        this.tileImageCache[type] = null;
        this.cdr.markForCheck();
        return;
      }
      const url = candidates[idx];
      const img = new Image();
      img.onload = () => {
        this.tileImageCache[type] = url;
        this.cdr.markForCheck();
      };
      img.onerror = () => tryLoad(idx + 1);
      img.src = url;
    };

    tryLoad(0);
    return null;
  }

  protected changeFloor(delta: number) {
    const newIdx = this.activeFloorIdx + delta;
    if (newIdx >= 0 && newIdx < 3) {
      this.activeFloorIdx = newIdx;
    }
  }

  @HostListener('window:keydown', ['$event'])
  async onKeyDown(event: KeyboardEvent) {
    if (this.currentPhase !== 'play') return;

    const key = event.key.toLowerCase();
    const directionMap: { [key: string]: 'up' | 'bottom' | 'left' | 'right' | 'floorUp' | 'floorDown' } = {
      'w': 'up', 's': 'bottom', 'a': 'left', 'd': 'right',
      'arrowup': 'up', 'arrowdown': 'bottom', 'arrowleft': 'left', 'arrowright': 'right',
      'e': 'floorUp', 'q': 'floorDown',
      'pageup': 'floorUp', 'pagedown': 'floorDown'
    };

    if (directionMap[key]) {
      event.preventDefault();
      const room = await firstValueFrom(this.room$?.pipe(take(1)));
      if (room && !this.isSpectator(room) && this.isMyTurn(room)) {
        await this.handleMove(room, directionMap[key]);
        // Mozgás után váltsunk át arra a szintre, ahol a játékos van
        const updatedRoom = await firstValueFrom(this.room$?.pipe(take(1)));
        if (updatedRoom && updatedRoom.game) {
          const myPos = updatedRoom.game.playerPositions?.[this.playerName ?? ''];
          if (myPos && myPos.floor !== this.activeFloorIdx) {
            this.activeFloorIdx = myPos.floor;
          }
        }
      }
    }
  }

  protected isSpectator(room: Room): boolean {
    return !room.players?.includes(this.playerName ?? '');
  }

  async start(room: Room) {
    const game = generateGame(room.seed);

    for (let i = 0; i < this.seed.length; i++) {
      this.seednum = ((this.seednum << 5) - this.seednum) + this.seed.charCodeAt(i);
      this.seednum |= 0;
    }

    game.guardPositions[0].pos = game.guardPositions[0].moves[0]; // kezdőpozíció beállítása
    game.guardPositions[0].target = game.guardPositions[0].moves[1]; // célpozíció beállítása
    game.guardPositions[0].moves = game.guardPositions[0].moves.slice(2); // első két lépés már felhasználva
    game.guardPositions[1].pos = game.guardPositions[1].moves[0]; // kezdőpozíció beállítása
    game.guardPositions[1].target = game.guardPositions[1].moves[1]; // célpozíció beállítása
    game.guardPositions[1].moves = game.guardPositions[1].moves.slice(2); // első két lépés már felhasználva
    game.guardPositions[2].pos = game.guardPositions[2].moves[0]; // kezdőpozíció beállítása
    game.guardPositions[2].target = game.guardPositions[2].moves[1]; // célpozíció beállítása
    game.guardPositions[2].moves = game.guardPositions[2].moves.slice(2); // első két lépés már felhasználva

    game.playerOrder = [...room.players];

    for (const player of room.players) {
      game.healths[player] = 3; // minden játékos 3 HP-val indul
    }

    await this.roomService.startGame(this.roomId, game);
  }

  async updateSeed(event: Event) {
    const input = event.target as HTMLInputElement;
    await this.roomService.updateSeed(this.roomId, input.value);
  }

  async reset(id: string) {
    const ok = confirm('Biztosan alaphelyzetbe állítod a szobát? A jelenlegi játék elveszik.');
    if (!ok) return;

    this.activeFloorIdx = 0;
    const newSeed = Math.random().toString(36).substring(2, 10).toUpperCase();
    await this.roomService.resetRoom(id, newSeed);
  }

  protected getPlayersOnTile(room: Room, fIdx: number, tIdx: number): string[] {
    if (!room.game?.playerPositions) return [];
    return Object.entries(room.game.playerPositions)
      .filter(([, pos]) => pos.floor === fIdx && pos.tileIdx === tIdx)
      .map(([name]) => name);
  }

  protected isCurrentPlayerTile(room: Room, fIdx: number, tIdx: number): boolean {
    if (this.isSpectator(room) || !room.game) return false;
    const myPos = room.game.playerPositions?.[this.playerName ?? ''];
    return !!myPos && myPos.floor === fIdx && myPos.tileIdx === tIdx;
  }

  protected canMove(room: Room, fIdx: number, tIdx: number, dir: 'up' | 'right' | 'bottom' | 'left' | 'floorUp' | 'floorDown'): boolean {
    if (this.isSpectator(room) || !room.game || !this.isMyTurn(room)) return false;

    if (dir === 'floorUp') {
      return fIdx < 2 && room.game.floors[fIdx].tiles[tIdx].type === 'Stairs';
    }
    if (dir === 'floorDown') {
      return fIdx > 0 && (room.game.floors[fIdx - 1].tiles[tIdx].type === 'Stairs' || room.game.floors[fIdx].tiles[tIdx].type === 'Walkway');
    }

    let targetIdx = this.calcTargetIdx(tIdx, dir);

    if (targetIdx === -1) return false;
    return !this.isWallBetween(room, fIdx, tIdx, targetIdx);
  }

  protected canInteract(room: Room, fIdx: number, tIdx: number): boolean {
    if (this.isSpectator(room) || !room.game || !this.isMyTurn(room)) return false;
    const playerPositions = room.game.playerPositions || {};
    const myPos = playerPositions[this.playerName ?? ''];

    // Első lerakás: csak az 1. szint szélén (floor 0, edge tiles)
    if (!myPos) {
      if (fIdx !== 0) return false;
      const x = tIdx % 4;
      const y = Math.floor(tIdx / 4);
      return x === 0 || x === 3 || y === 0 || y === 3;
    }

    if ((myPos.floor != fIdx && myPos.tileIdx != tIdx) && room.game.floors[myPos.floor].tiles[myPos.tileIdx].type === 'ServiceDuct' && room.game.floors[fIdx].tiles[tIdx].type === 'ServiceDuct' && room.game.floors[fIdx].tiles[tIdx].revealed) return true


    // Szinten belüli mozgás/peek
    if (myPos.floor === fIdx) {
      return this.isAdjacent(myPos.floor, myPos.tileIdx, fIdx, tIdx) &&
             !this.isWallBetween(room, myPos.floor, myPos.tileIdx, tIdx);
    }

    // Szintek közötti mozgás/peek (csak ha ugyanaz a koordináta)
    if (tIdx === myPos.tileIdx) {
      // Felmenetel
      if (fIdx === myPos.floor + 1) {
        return room.game.floors[myPos.floor].tiles[myPos.tileIdx].type === 'Stairs' || (room.game.floors[myPos.floor].tiles[myPos.tileIdx].type === 'Atrium' && !room.game.floors[fIdx].tiles[tIdx].revealed);
      }
      // Lemenetel
      if (fIdx === myPos.floor - 1) {
        return room.game.floors[fIdx].tiles[tIdx].type === 'Stairs' || (room.game.floors[myPos.floor].tiles[myPos.tileIdx].type === 'Atrium' && !room.game.floors[fIdx].tiles[tIdx].revealed);
      }
    }

    return false;
  }

  private isAdjacent(f1: number, t1: number, f2: number, t2: number): boolean {
    if (f1 !== f2) return false;
    const x1 = t1 % 4;
    const y1 = Math.floor(t1 / 4);
    const x2 = t2 % 4;
    const y2 = Math.floor(t2 / 4);
    return Math.abs(x1 - x2) + Math.abs(y1 - y2) === 1;
  }

  private isWallBetween(room: Room, f: number, t1: number, t2: number): boolean {
    if (!room.game) return false;
    const x1 = t1 % 4;
    const y1 = Math.floor(t1 / 4);
    const x2 = t2 % 4;
    const y2 = Math.floor(t2 / 4);
    const tile1 = room.game.floors[f].tiles[t1];
    const tile2 = room.game.floors[f].tiles[t2];

    if (tile2.type === 'SecretDoor' && tile2.revealed) return false;

    if (x1 < x2) return (tile1.walls.right || tile2.walls.left);
    if (x1 > x2) return (tile1.walls.left || tile2.walls.right);
    if (y1 < y2) return (tile1.walls.bottom || tile2.walls.top);
    if (y1 > y2) return (tile1.walls.top || tile2.walls.bottom);
    return false;
  }

  async handleTileClick(room: Room, fIdx: number, tIdx: number) {
    if (!this.canInteract(room, fIdx, tIdx)) return;

    const game = JSON.parse(JSON.stringify(room.game));
    if (!game.playerPositions) game.playerPositions = {};
    const name = this.playerName ?? '';
    const myPos = game.playerPositions[name];

    if (!myPos) {
      // Első lerakás
      game.playerPositions[name] = { floor: fIdx, tileIdx: tIdx };
      game.floors[fIdx].tiles[tIdx].revealed = true;
      this.activeFloorIdx = fIdx;
      game.startingPosition = tIdx;
      await this.roomService.setGameState(this.roomId, game);
    } else {
      const tile = game.floors[fIdx].tiles[tIdx];
      if (!tile.revealed) {
        // Ha még nincs felfedve: CSAK FELFEDÉS (Peek)
        if (!await this.useActionPoint(game, 1)) {return;}
        tile.revealed = true;
        await this.roomService.setGameState(this.roomId, game);
      } else {
        // Ha már fel van fedve: MOZGÁS (Move)
        await this.moveToTile(room, fIdx, tIdx);
        this.activeFloorIdx = fIdx;
      }
    }
  }

  async handleArrowMove(event: Event, room: Room, dir: 'up' | 'right' | 'bottom' | 'left' | 'floorUp' | 'floorDown') {
    event.stopPropagation();
    await this.handleMove(room, dir);
  }

  private async handleMove(room: Room, dir: 'up' | 'right' | 'bottom' | 'left' | 'floorUp' | 'floorDown') {
    if (!room.game || !this.isMyTurn(room)) return;
    const name = this.playerName ?? '';
    const myPos = room.game.playerPositions?.[name];
    if (!myPos) return;

    if (dir === 'floorUp' || dir === 'floorDown') {
      if (this.canMove(room, myPos.floor, myPos.tileIdx, dir)) {
        const targetFloor = dir === 'floorUp' ? myPos.floor + 1 : myPos.floor - 1;
        await this.moveToTile(room, targetFloor, myPos.tileIdx);
        this.activeFloorIdx = targetFloor;
      }
      return;
    }

    const tIdx = myPos.tileIdx;
    let targetIdx = this.calcTargetIdx(tIdx, dir);

    if (targetIdx !== -1 && !this.isWallBetween(room, myPos.floor, tIdx, targetIdx)) {
      await this.moveToTile(room, myPos.floor, targetIdx);
    }
  }

  private calcTargetIdx(tIdx: number, dir: 'up' | 'right' | 'bottom' | 'left'): number {
    let targetIdx = -1;
    const x = tIdx % 4;
    const y = Math.floor(tIdx / 4);

    if (dir === 'up' && y > 0) return tIdx - 4;
    if (dir === 'right' && x < 3) return tIdx + 1;
    if (dir === 'bottom' && y < 3) return tIdx + 4;
    if (dir === 'left' && x > 0) return tIdx - 1;

    return targetIdx;
  }


  async rollDice(k: number) {
    this.animatation = true;
    for (let i = 0; i < 10; i++) {
      this.diceValues = [
        ...Array.from({ length: k }, () => Math.floor(Math.random() * 6) + 1),
        ...Array.from({ length: 6 - k }, () => 0)
      ];
      this.cdr.detectChanges();
      await new Promise(res => setTimeout(res, 100));
    }
    this.animatation = false;
    this.cdr.detectChanges();
  }

  triggeredMotions: Array<{fIdx: number, tIdx: number}> = [];
  private async moveToTile(room: Room, fIdx: number, tIdx: number) {
    const game: GameState = JSON.parse(JSON.stringify(room.game));
    const name = this.playerName ?? '';
    let sameFloor = game.playerPositions[name].floor === fIdx;

    if (game.floors[fIdx].tiles[tIdx].type === 'SafetyLock') {
      let occupied = false;
      for (const player in game.playerPositions) {
        if (game.playerPositions[player].floor === fIdx && game.playerPositions[player].tileIdx === tIdx) {
          occupied = true;
          break;
        }
      }
        if (game.guardPositions[fIdx].pos.y * 4 + game.guardPositions[fIdx].pos.x === tIdx) {occupied = true;}


      if (occupied) {
        if (!await this.useActionPoint(game, 1)) {return;}
      } else {
        if (!await this.useActionPoint(game, 3)) {
          if (!game.floors[fIdx].tiles[tIdx].revealed) {
            if (!await this.useActionPoint(game, 1)) {return;}
            game.floors[fIdx].tiles[tIdx].revealed = true;
            await this.roomService.setGameState(this.roomId, game);
            return;
          }
          return;
        }
      }

    } else {
      if (game.floors[fIdx].tiles[tIdx].type === 'Laser') {
        if (!game.floors[fIdx].tiles[tIdx].revealed) {
          if (!await this.useActionPoint(game, 1)) {return;}
          this.triggerAlarm(game, "Laser", fIdx, tIdx);
        } else {
          if (game.currentAP >= 2) {

            if(await this.askActionPoints()){
              if (!await this.useActionPoint(game, 2)) {return;}
            }else {

              if (!await this.useActionPoint(game, 1)) {return;}
              this.triggerAlarm(game, "Laser", fIdx, tIdx);
            }
          } else {
            if (!await this.useActionPoint(game, 1)) {return;}
            this.triggerAlarm(game, "Laser", fIdx, tIdx);
          }
        }
      }else {
          if (!await this.useActionPoint(game, 1)) {return;}
      }
    }

    if(game.floors[fIdx].tiles[tIdx].type === 'Motion') {
      this.triggeredMotions.push({fIdx: fIdx, tIdx: tIdx});
    }

    if (game.floors[game.playerPositions[this.playerName].floor].tiles[game.playerPositions[this.playerName].tileIdx].type === 'Motion'){
      if (this.triggeredMotions.some(motion => motion.fIdx === game.playerPositions[this.playerName].floor && motion.tIdx === game.playerPositions[this.playerName].tileIdx)){
      this.triggerAlarm(game, 'Motion', game.playerPositions[this.playerName].floor, game.playerPositions[this.playerName].tileIdx);
    }}

    if (game.floors[fIdx].tiles[tIdx].type === 'Walkway' && !game.floors[fIdx].tiles[tIdx].revealed && fIdx > 0) {
      game.floors[fIdx].tiles[tIdx].revealed = true;
      fIdx--;
    }

    if (game.floors[fIdx].tiles[tIdx].type === 'Keypad'){
      for (let i = 0; i < game.keypads.length; i++) {
        if(game.keypads[i].fIdx === fIdx && game.keypads[i].tIdx === tIdx){
          if(!game.keypads[i].opened) {
            await this.rollDice(game.keypads[i].tries + 1)
            for (let j = 0; j < game.keypads[i].tries + 1; j++) {
              if (this.diceValues[j] === 6) {
                game.keypads[i].opened = true;
                game.playerPositions[name] = { floor: fIdx, tileIdx: tIdx };
              }
            }
            game.keypads[i].tries++;
          } else {
            game.playerPositions[name] = { floor: fIdx, tileIdx: tIdx };
          }
        }
      }
    }else {
      game.playerPositions[name] = { floor: fIdx, tileIdx: tIdx };
    }

    game.floors[fIdx].tiles[tIdx].revealed = true; // Rálépés felfedi

    // Őrrel való találkozás ellenőrzése
    let guardIdx = game.guardPositions[fIdx].pos.y * 4 + game.guardPositions[fIdx].pos.x;
    if (guardIdx === tIdx && sameFloor) {
      game.healths[name] = (game.healths[name] || 1) - 1;
    }

    if(game.floors[fIdx].tiles[tIdx].type === 'Fingerprint')
    this.triggerAlarm(game, "Fingerprint", fIdx, tIdx);

    await this.roomService.setGameState(this.roomId, game);
  }


  showAPDialog = false;
  private apDialogResolver: ((value: boolean) => void) | null = null;

  askActionPoints(): Promise<boolean> {
    this.showAPDialog = true;
    this.animatation = true;
    return new Promise<boolean>(resolve => {
      this.apDialogResolver = resolve;
    });
  }

  resolveAPDialog(value: boolean) {
    this.showAPDialog = false;
    this.animatation = false;
    if (this.apDialogResolver) {
      this.apDialogResolver(value);
      this.apDialogResolver = null;
    }
  }


  /** Kilépés: törlés a szobából + navigálás */
  async leave(): Promise<void> {
    if (this.alreadyLeft) {

      await this.router.navigate(['/']);
      return;
    }

    // Ha nem lobby fázisban vagyunk, nem töröljük a játékost a listából
    // KIVÉVE ha megfigyelő (de ő nincs is benne a listában, így a removePlayer nem csinál semmit)
    if (this.currentPhase !== 'lobby') {
      await this.router.navigate(['/']);
      return;
    }

    this.alreadyLeft = true;

    // ha nincs név, csak visszanavigálunk
    if (this.playerName?.trim()) {
      try {
        await this.roomService.removePlayer(this.roomId, this.playerName);
      } catch (e) {
        // baráti kör / offline eset: ne álljon meg a navigálás
        console.error('Kilépés közben hiba:', e);
      }
    }

    await this.router.navigate(['/']);
  }

  /** Guard számára: navigálás nélkül csak a cleanup */
  async cleanupOnExit(): Promise<boolean> {
    if (this.alreadyLeft) return true;

    // Csak lobby fázisban törlünk játékost
    if (this.currentPhase !== 'lobby') {
      this.alreadyLeft = true;
      return true;
    }

    this.alreadyLeft = true;

    if (this.playerName?.trim()) {
      try {
        await this.roomService.removePlayer(this.roomId, this.playerName);
      } catch (e) {
        console.error('Cleanup hiba:', e);
      }
    }
    return true;
  }

  protected isGuardOnTile(room: Room, fIdx: number, tIdx: number): boolean {
    return !!room.game?.guardPositions?.some(g => g.floor === fIdx && g.pos.x === tIdx % 4 && g.pos.y === Math.floor(tIdx / 4));
  }

  protected isGuardTargetTile(room: Room, fIdx: number, tIdx: number): boolean {
    return !!room.game?.guardPositions?.some(g => g.floor === fIdx && g.target.x === tIdx % 4 && g.target.y === Math.floor(tIdx / 4));
  }

  protected getGuardPath(room: Room, floorIdx: number, guardIdx: number): number[] {
    const guard = room.game?.guardPositions?.[guardIdx];
    if (!guard || guard.floor !== floorIdx) return [];

    const tiles = room.game?.floors[floorIdx].tiles;
    const start = guard.pos;
    const target = guard.target;

    const startIdx = start.y * 4 + start.x;
    const targetIdx = target.y * 4 + target.x;

    const queue: { idx: number, path: number[] }[] = [{ idx: startIdx, path: [startIdx] }];
    const visited = new Set<number>([startIdx]);

    while (queue.length) {
      const { idx, path } = queue.shift()!;
      if (idx === targetIdx) return path;

      const x = idx % 4, y = Math.floor(idx / 4);
      if (tiles === undefined) return [];
      const neighbors: { idx: number, canGo: boolean }[] = [
        { idx: idx - 4, canGo: y > 0 && !tiles[idx].walls.top },
        { idx: idx + 4, canGo: y < 3 && !tiles[idx].walls.bottom },
        { idx: idx - 1, canGo: x > 0 && !tiles[idx].walls.left },
        { idx: idx + 1, canGo: x < 3 && !tiles[idx].walls.right },
      ];
      for (const n of neighbors) {
        if (n.canGo && !visited.has(n.idx)) {
          visited.add(n.idx);
          queue.push({ idx: n.idx, path: [...path, n.idx] });
        }
      }
    }
    return [];
  }

  protected isGuardReachableThisTurn(room: Room, floorIdx: number, tIdx: number): boolean {
    // For each guard on this floor, check if tIdx is within speed steps along their path
    return !!room.game?.guardPositions?.some((g, i) => {
      if (g.floor !== floorIdx) return false;
      const path = this.getGuardPath(room, floorIdx, i);
      const maxStep = Math.min(g.speed + (room.game?.floors[floorIdx].alarms.length ?? 0), path.length - 1);
      return path.slice(1, maxStep + 1).includes(tIdx);
    });
  }

  protected isGuardPathDir(room: Room, floorIdx: number, tIdx: number, dir: 'up' | 'right' | 'down' | 'left'): boolean {
    if (!room.game) return false;
    const dx = { up: 0, right: 1, down: 0, left: -1 }[dir];
    const dy = { up: -1, right: 0, down: 1, left: 0 }[dir];
    const x = tIdx % 4, y = Math.floor(tIdx / 4);
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || nx > 3 || ny < 0 || ny > 3) return false;
    const nIdx = ny * 4 + nx;

    return !!room.game.guardPositions?.some((g, i) => {
      if (g.floor !== floorIdx) return false;
      const path = this.getGuardPath(room, floorIdx, i);
      for (let j = 0; j < path.length - 1; ++j) {
        if ((path[j] === tIdx && path[j + 1] === nIdx) ||
          (path[j] === nIdx && path[j + 1] === tIdx)) {
          return true;
        }
      }
      return false;
    });
  }

  private async useActionPoint(game: GameState, cost: number) {
    if (game.currentAP < cost) {return false;}
    game.currentAP -= cost;
    return true;
  }

  private generateNewGuardTargets(guard: GameState['guardPositions'][0]) {
    let guardtargets = [];
    for (let i = 0; i < 16; i++) {
      const x = i % 4;
      const y = Math.floor(i / 4);

      guardtargets.push({ x: x, y: y });
    }

    const random = () => {
      const x = Math.sin(this.seednum++) * 10000;
      return x - Math.floor(x);
    };

    const result = [...guardtargets];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    guard.moves = result;
  }

// Moves the guard on the given floor, step-by-step, with 1s delay per step
  private async moveGuardWithDelay(game: GameState, floorIdx: number) {
    const guardIdx = game.guardPositions.findIndex(g => g.floor === floorIdx);
    if (guardIdx === -1) return;

    const guard = game.guardPositions[guardIdx];
    let path = this.getGuardPath({ game } as Room, floorIdx, guardIdx);

    for (let i = 1; i <= guard.speed + game.floors[floorIdx].alarms.length; i++) {
      const nextIdx = path[1];
      path = path.splice(1);
      if (path.length === 1) {

        if(game.floors[floorIdx].alarms.includes(nextIdx)){
          game.floors[floorIdx].alarms = game.floors[floorIdx].alarms.filter(a => a !== nextIdx);
        }

        if (game.floors[floorIdx].alarms.length >0) {
          this.checkClosestAlarm(game, guard, floorIdx, guardIdx);
        }else if (guard.target.x == guard.moves[0].x && guard.target.y == guard.moves[0].y) {
          if (guard.moves.length > 1) {
          guard.target = guard.moves[1];
          guard.moves[1] = guard.moves[0];}
          else {
            this.generateNewGuardTargets(guard);
            if (guard.target.x == guard.moves[0].x && guard.target.y == guard.moves[0].y) {
              guard.target = guard.moves[1];
              guard.moves[1] = guard.moves[0];
            }else {
              guard.target = guard.moves[0];
            }
          }
        } else {
          guard.target = guard.moves[0];
        }

        guard.moves = guard.moves.slice(1);

        if (guard.moves.length === 0) {
          guard.speed++; // növeljük a sebességet, ha elfogytak a lépések
          this.generateNewGuardTargets(guard);
        }
      }

      guard.pos = { x: nextIdx % 4, y: Math.floor(nextIdx / 4) };

      for (const player of game.playerPositions ? Object.keys(game.playerPositions) : []) {
        if (game.playerPositions[player].floor === floorIdx && game.playerPositions[player].tileIdx === nextIdx) {
          if (game.floors[floorIdx].tiles[nextIdx].type === 'Toilet' && game.floors[floorIdx].tiles[nextIdx].tokens>0) {
            game.floors[floorIdx].tiles[nextIdx].tokens --;
          }else {
            game.healths[player] = (game.healths[player] || 1) - 1;}
        }

        if (game.playerPositions[player].floor !== floorIdx && game.playerPositions[player].tileIdx === nextIdx && game.floors[game.playerPositions[player].floor].tiles[game.playerPositions[player].tileIdx].type === 'Atrium') {
          game.healths[player] = (game.healths[player] || 1) - 1;}

        if(game.floors[game.playerPositions[player].floor].tiles[game.playerPositions[player].tileIdx].type === 'Lobby'){
          if (this.isAdjacent(game.playerPositions[player].floor, game.playerPositions[player].tileIdx, floorIdx, nextIdx)) {

              const x1 = game.playerPositions[player].tileIdx % 4;
              const y1 = Math.floor(game.playerPositions[player].tileIdx / 4);
              const x2 = nextIdx % 4;
              const y2 = Math.floor(nextIdx / 4);
              const tile1 = game.floors[floorIdx].tiles[game.playerPositions[player].tileIdx];
              const tile2 = game.floors[floorIdx].tiles[nextIdx];

              if (!(((x1 < x2) && (tile1.walls.right || tile2.walls.left)) || ((x1 > x2) && (tile1.walls.left || tile2.walls.right))
                || ((y1 < y2) && (tile1.walls.bottom || tile2.walls.top)) || ((y1 > y2) && (tile1.walls.top || tile2.walls.bottom)))
              ) {
                game.healths[player] = (game.healths[player] || 1) - 1;
            }
          }
        }
      }

      await this.roomService.setGameState(this.roomId, JSON.parse(JSON.stringify(game)));
      await new Promise(res => setTimeout(res, 2000/guard.speed)); // delay based on speed
      path = this.getGuardPath({ game } as Room, floorIdx, guardIdx);
    }
  }

  protected isMyTurn(room: Room): boolean {
    return room.game?.playerOrder?.[room.game.currentPlayerIdx] === this.playerName && !this.animatation;
  }

  async endTurn(room: Room) {
    this.diceValues = [0,0,0,0,0,0];
    if (!room.game || !this.isMyTurn(room)) return;
    const game: GameState = JSON.parse(JSON.stringify(room.game));

    let nextplayerIdx = (game.currentPlayerIdx + 1) % game.playerOrder.length;

    // Move guard on the floor where the previous player ended their turn
    const prevPlayerPos = game.playerPositions[game.playerOrder[game.currentPlayerIdx]];

    if(game.floors[prevPlayerPos.floor].tiles[prevPlayerPos.tileIdx].type === 'Thermo'){
      this.triggerAlarm(game, "Thermo", prevPlayerPos.floor, prevPlayerPos.tileIdx);
    }

    if (prevPlayerPos) {
      game.currentPlayerIdx = -1;
      await this.moveGuardWithDelay(game, prevPlayerPos.floor);
    }

    for (let i = 0; i < game.keypads.length; i++) {
      game.keypads[i].tries = 0;
    }
    this.triggeredMotions = [];

    game.currentPlayerIdx = nextplayerIdx;
    game.currentAP = 4;

    if (game.playerPositions[game.playerOrder[game.currentPlayerIdx]] === undefined && game.startingPosition !== null) {
      game.playerPositions[game.playerOrder[game.currentPlayerIdx]] = { floor: 0, tileIdx: game.startingPosition};
    }
    await this.roomService.setGameState(this.roomId, game);
  }

  async addToken(room: Room, roomType: string, fIdx: number = -1, tIdx: number = -1) {
    if (!room.game || !this.isMyTurn(room)) return;
    const game: GameState = JSON.parse(JSON.stringify(room.game));
    if (roomType !== 'safe') {
      if (await this.useActionPoint(game, 1)) {
        if (roomType === 'fingerprint') {
          game.hackFingerprint += 1;
        } else if (roomType === 'motion') {
          game.hackMotion += 1;
        } else if (roomType === 'laser') {
          game.hackLaser += 1;
        }
      }
    }
    else {
      if (game.floors[fIdx].tiles[tIdx].tokens < 6 && !game.floors[fIdx].safeOpened) {
        if (await this.useActionPoint(game, 2)) {
          game.floors[fIdx].tiles[tIdx].tokens += 1;
        }
      }
    }
    await this.roomService.setGameState(this.roomId, game);
  }

  triggerAlarm(game: GameState, roomType: 'Camera' | 'Laser' | 'Motion' | 'Fingerprint' | 'Thermo', fIdx: number, tIdx: number) {
    const guardIdx = game.guardPositions.findIndex(g => g.floor === fIdx);
    const guard = game.guardPositions[guardIdx];

    if (tIdx === guard.pos.y * 4 + guard.pos.x || game.floors[fIdx].alarms.includes(tIdx)) {
      return; // Ha az őr már ott van, ne csináljon semmit
    }

    if (roomType === 'Fingerprint') {
      if (game.hackFingerprint > 0){
        game.hackFingerprint -= 1;
      return}
      else {
        game.floors[fIdx].alarms.push(tIdx);
      }
    }
    if (roomType === 'Motion') {
      if (game.hackMotion > 0){
        game.hackMotion -= 1;return}
      else {
        game.floors[fIdx].alarms.push(tIdx);
      }
    }
    if (roomType === 'Laser') {
      if (game.hackLaser > 0){
        game.hackLaser -= 1;return}
      else {
        game.floors[fIdx].alarms.push(tIdx);
      }
    }
    if (roomType === 'Camera' || roomType === 'Thermo') {
      game.floors[fIdx].alarms.push(tIdx);
    }

    this.checkClosestAlarm(game, guard, fIdx, guardIdx);

  }

  checkClosestAlarm(game: GameState, guard: GameState['guardPositions'][0], fIdx: number, guardIdx: number) {
    let closestAlarm = Infinity;
    let shortestPath = Infinity
    for (let i = 0; i < game.floors[fIdx].alarms.length; i++) {
    guard.target.x = game.floors[fIdx].alarms[i] % 4;
    guard.target.y = Math.floor(game.floors[fIdx].alarms[i] / 4);
    let path = this.getGuardPath({ game } as Room, fIdx, guardIdx);
    if (path.length < shortestPath){
      shortestPath = path.length;
      closestAlarm = game.floors[fIdx].alarms[i];
    }
  }

  guard.target.x = closestAlarm % 4;
  guard.target.y = Math.floor(closestAlarm / 4);
}

  protected isAlarmOnTile(room: Room, activeFloorIdx: number, tIdx: number) {
    if (!room.game) return false;
    return room.game.floors[activeFloorIdx].alarms.includes(tIdx);
  }

  protected KeypadOpened(room: Room, activeFloorIdx: number, tIdx: number) {
    for (let i = 0; i < (room.game?.keypads.length ?? 0); i++) {
      if (room.game?.keypads[i].fIdx === activeFloorIdx && room.game?.keypads[i].tIdx === tIdx) {
        return room.game?.keypads[i].opened;
      }
    }
    return false;
  }

  async crackSafe(room: Room, activeFloorIdx: number, tIdx: number) {
    if(!room.game || room.game.floors[activeFloorIdx].tiles[tIdx].tokens === 0 || room.game.floors[activeFloorIdx].safeOpened) return;
    if(!await this.useActionPoint(room.game, 1)) return;

    await this.rollDice(room.game.floors[activeFloorIdx].tiles[tIdx].tokens);

    const row = Math.floor(tIdx / 4)
    const col = tIdx % 4;

    const cracks: boolean[] = [];

    for (let c = 0; c < 4; c++) {
      if (row * 4 + c === tIdx) continue;
      if (this.diceValues.includes(room.game.floors[activeFloorIdx].tiles[row * 4 + c].number) && room.game.floors[activeFloorIdx].tiles[row * 4 + c].revealed) {
        room.game.floors[activeFloorIdx].tiles[row * 4 + c].cracked = true;
        this.cdr.detectChanges();
      }
      cracks.push(room.game.floors[activeFloorIdx].tiles[row * 4 + c].cracked)
    }

    for (let r = 0; r < 4; r++) {
      if (r * 4 + col === tIdx) continue;
      if (this.diceValues.includes(room.game.floors[activeFloorIdx].tiles[r * 4 + col].number) && room.game.floors[activeFloorIdx].tiles[r * 4 + col].revealed) {
        room.game.floors[activeFloorIdx].tiles[r * 4 + col].cracked = true;
        this.cdr.detectChanges();
      }
      cracks.push(room.game.floors[activeFloorIdx].tiles[r * 4 + col].cracked)
    }

    if (!cracks.includes(false)) {
      console.log('Safe cracked!');
    }

    await this.roomService.setGameState(this.roomId, room.game);
  }
}
