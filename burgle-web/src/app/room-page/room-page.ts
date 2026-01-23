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
                          @if (tile.type === 'Toilet' && tile.revealed){
                            <div class="tokennumber" title="Token mennyiség">{{tile.tokens}}</div>
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
                            <div class="player-pawn number-on-tile" [title]="tile.number">{{ tile.number }}</div>
                          </div>
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
              <div class="HP">
                @for (i of [0,1,2]; track $index) {
                  @let imgUrl = getOrLoadTileImage((i < (room.game?.healths?.[playerName] ?? 0)) ? 'ghost' : 'ghostdead');
                  @if (imgUrl && imgUrl != '') {
                  <img [ngSrc]="imgUrl"
                       width="1" height="1" class="hp-icon" alt="HP"/>}}
              </div>
              <div class="ap-counter">
                Action Points: {{ room.game?.currentAP ?? 0 }}
              </div>
              <button class="btn btn-primary"
                      [disabled]="!isMyTurn(room)"
                      (click)="endTurn(room)">
                End Turn
              </button>
            </div>
          </div>
        }
      </div>

      <style>
        :host {
          display: flex;
          flex-direction: column;
          height: 100dvh;
          font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          background-color: #f5f7fa;
          color: #2d3748;
          overflow: hidden;
        }

        .header-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.5rem 1.5rem;
          background: white;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
          z-index: 10;
          flex: 0 0 auto;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 2rem;
        }

        .room-info {
          display: flex;
          flex-direction: column;
        }

        .room-info h1 {
          margin: 0;
          font-size: 1.25rem;
          color: #1a202c;
          white-space: nowrap;
        }

        .status-badge {
          display: inline-block;
          padding: 0.1rem 0.5rem;
          border-radius: 9999px;
          font-size: 0.75rem;
          font-weight: 600;
          margin-top: 0.1rem;
          width: fit-content;
        }

        .status-badge.lobby {
          background: #ebf8ff;
          color: #2b6cb0;
        }

        .status-badge.play {
          background: #f0fff4;
          color: #2f855a;
        }

        .header-actions {
          display: flex;
          gap: 0.5rem;
        }

        .room-details {
          display: flex;
          align-items: center;
          gap: 1.5rem;
        }

        .main-content {
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .detail-item {
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }

        .detail-item .label {
          font-weight: 600;
          color: #718096;
          white-space: nowrap;
          font-size: 0.85rem;
        }

        .seed-input {
          padding: 0.2rem 0.5rem;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          font-family: monospace;
          font-size: 0.85rem;
          width: 80px;
        }

        .player-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 0.4rem;
        }

        .player-chip {
          display: flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.15rem 0.5rem;
          background: #edf2f7;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          font-size: 0.8rem;
        }

        .player-chip.is-me {
          border-color: #4299e1;
          background: #ebf8ff;
          color: #2b6cb0;
        }

        .player-icon {
          width: 18px;
          height: 18px;
          background: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 0.65rem;
        }

        .is-me .player-icon {
          background: #4299e1;
          color: white;
        }

        .btn {
          padding: 0.4rem 0.8rem;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
          font-size: 0.85rem;
        }

        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-primary {
          background: #4299e1;
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background: #3182ce;
        }

        .btn-outline {
          background: transparent;
          border: 2px solid #e2e8f0;
          color: #4a5568;
        }

        .btn-outline:hover:not(:disabled) {
          background: #f7fafc;
          border-color: #cbd5e0;
        }

        .btn-danger {
          background: #fff5f5;
          color: #c53030;
          border: 1px solid #feb2b2;
        }

        .btn-danger:hover:not(:disabled) {
          background: #feb2b2;
          color: #9b2c2c;
        }

        .btn-large {
          padding: 0.8rem 1.6rem;
          font-size: 1rem;
        }

        .lobby-start {
          display: flex;
          justify-content: center;
          padding: 3rem;
          flex: 1;
        }

        .game-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          padding: 0.5rem;
        }

        .floor-navigation {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 2rem;
          margin-bottom: 0.5rem;
        }

        .nav-btn {
          background: white;
          border: 2px solid #e2e8f0;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 1.2rem;
          color: #4a5568;
          transition: all 0.2s;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }

        .nav-btn:hover:not(:disabled) {
          background: #edf2f7;
          border-color: #cbd5e0;
          transform: scale(1.05);
        }

        .nav-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .floor-indicator {
          font-size: 1.1rem;
          font-weight: 700;
          color: #2d3748;
          min-width: 100px;
          text-align: center;
        }

        .floors-container {
          flex: 1;
          display: flex;
          flex-direction: column;
          padding: 0;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        .floor {
          width: 100%;
          max-width: min(800px, 98vw, 82vh);
          display: flex;
          flex-direction: column;
          align-items: center;
          flex-shrink: 0;
        }

        .floor h4 {
          display: none;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0;
          background: #0a0e14;
          padding: 12px;
          border-radius: 12px;
          width: 100%;
          aspect-ratio: 1 / 1;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          overflow: hidden;
        }

        .tile {
          background: #4a5568;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: clamp(10px, 3.5vw, 20px);
          position: relative;
          text-align: center;
          transition: all 0.2s;
          color: #edf2f7;
          aspect-ratio: 1 / 1;
          user-select: none;
          border-radius: 0;
        }

        .tile.clickable {
          cursor: pointer;
        }

        .tile.clickable:hover {
          background: #48bb78;
          transform: scale(1.02);
          z-index: 2;
          box-shadow: 0 0 15px rgba(72, 187, 120, 0.4);
        }

        .tile.revealed {
          background: white;
          color: #2d3748;
        }

        .arrows-container {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 15;
        }

        .arrow {
          position: absolute;
          background: #f6e05e;
          color: #744210;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          border-radius: 50%;
          font-size: 14px;
          pointer-events: auto;
          transition: all 0.2s;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          border: 2px solid white;
          z-index: 20;
        }

        .arrow-up {
          top: 4px;
          left: 50%;
          transform: translateX(-50%);
        }

        .arrow-right {
          right: 4px;
          top: 50%;
          transform: translateY(-50%);
        }

        .arrow-bottom {
          bottom: 4px;
          left: 50%;
          transform: translateX(-50%);
        }

        .arrow-left {
          left: 4px;
          top: 50%;
          transform: translateY(-50%);
        }

        .arrow-floor-up {
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: #4299e1;
          color: white;
        }

        .arrow-floor-down {
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: #4299e1;
          color: white;
        }

        .arrow:hover {
          background: #faf089;
          z-index: 25;
        }

        .arrow-up:hover {
          transform: translateX(-50%) scale(1.5);
        }

        .arrow-right:hover {
          transform: translateY(-50%) scale(1.5);
        }

        .arrow-bottom:hover {
          transform: translateX(-50%) scale(1.5);
        }

        .arrow-left:hover {
          transform: translateY(-50%) scale(1.5);
        }

        .arrow-floor-up:hover, .arrow-floor-down:hover {
          background: #3182ce;
          transform: translate(-50%, -50%) scale(1.5);
        }

        .down-exit-mark {
          position: absolute;
          top: 10px;
          right: 10px;
          background: #2d3748;
          color: white;
          width: 20px;
          height: 20px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          z-index: 4;
          opacity: 1;
          border: 1px solid white;
        }
        .tokennumber {
          position: absolute;
          top: 10px;
          left: 10px;
          background: #2d3748;
          color: white;
          width: 20px;
          height: 20px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          z-index: 4;
          opacity: 1;
          border: 1px solid white;
        }

        .wall {
          position: absolute;
          z-index: 100;
          transition: background 0.2s;
          background: transparent;
          border: 2px dotted #1a202c;
        }

        .wall-top {
          top: -1px;
          left: -1px;
          right: -1px;
          height: 0;
        }

        .wall-bottom {
          bottom: -1px;
          left: -1px;
          right: -1px;
          height: 0;
        }

        .wall-left {
          top: -1px;
          left: -1px;
          bottom: -1px;
          width: 0;
        }

        .wall-right {
          top: -1px;
          right: -1px;
          bottom: -1px;
          width: 0;
        }

        .wall-right.wall.is-real {
          width: 7px;
          background: #1a202c;
        }

        .wall-left.wall.is-real {
          width: 7px;
          background: #1a202c;
        }

        .wall-bottom.wall.is-real {
          height: 7px;
          background: #1a202c;
        }

        .wall-top.wall.is-real {
          height: 7px;
          background: #1a202c;
        }

        /* Force solid walls on the perimeter */
        .tile.edge-top .wall-top,
        .tile.edge-bottom .wall-bottom,
        .tile.edge-left .wall-left,
        .tile.edge-right .wall-right {
          background: #1a202c !important;
        }

        .players-on-tile {
          position: absolute;
          bottom: 4px;
          right: 4px;
          display: flex;
          gap: 2px;
          flex-wrap: wrap;
          justify-content: flex-end;
          pointer-events: none;
        }

        .player-pawn {
          width: 24px;
          height: 24px;
          background: #607085;
          color: white;
          border-radius: 50%;
          font-size: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid white;
          font-weight: bold;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          margin: 10px;
          z-index: 11;
        }

        .player-pawn.is-me {
          background: #e53e3e;
          border-color: #f6e05e;
        }

        .player-pawn.number-on-tile {
          background: darkslategray;
          border-color: slategray;
        }

        /* Tile images should fill the tile while allowing overlays (arrows, pawns) on top */
        .tile-img {
          position: absolute;
          inset: 0;
          top: 10px;
          left: 10px;
          width: calc(100% - 20px);
          height: calc(100% - 20px);
          object-fit: cover;
          z-index: 1;
        }

        .tile-type {
          position: relative;
          z-index: 2;
        }

        .guard-figure, .guard-target {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 2.2rem;
          z-index: 10;
          pointer-events: none;
          user-select: none;
        }

        .guard-target {
          color: #e53e3e;
          text-shadow: 0 0 6px #fff, 0 0 2px #e53e3e;
        }

        .guard-figure {
          color: #2b6cb0;
          text-shadow: 0 0 6px #fff, 0 0 2px #2b6cb0;
        }

        .guard-path-bar {
          position: absolute;
          background: #e14297;
          opacity: 0.85;
          z-index: 8;
          pointer-events: none;
        }

        .guard-path-dot {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 18px;
          height: 18px;
          background: #d32020;
          border: 3px solid #e14297;
          border-radius: 50%;
          transform: translate(-50%, -50%);
          z-index: 11;
          box-shadow: 0 0 6px #d32020, 0 0 6px #e14297;
          pointer-events: none;
        }

        .bar-up {
          top: 0;
          left: 50%;
          width: 8px;
          height: 50%;
          transform: translateX(-50%);
        }

        .bar-down {
          bottom: 0;
          left: 50%;
          width: 8px;
          height: 50%;
          transform: translateX(-50%);
        }

        .bar-left {
          left: 0;
          top: 50%;
          width: 50%;
          height: 8px;
          transform: translateY(-50%);
        }

        .bar-right {
          right: 0;
          top: 50%;
          width: 50%;
          height: 8px;
          transform: translateY(-50%);
        }

        .game-layout {
          display: flex;
          flex-direction: row;
          align-items: flex-start;
          width: 100%;
          height: 100%;
        }

        .game-area {
          flex: 1 1 auto;
          min-width: 0;
        }

        .side-panel-right {
          flex: 0 0 220px;
          margin: 1rem 1rem 1rem 1rem;
          align-items: flex-start;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          height: 100%;
          justify-content: center;
        }

        .side-panel-left {
          flex: 0 0 220px;
          margin: 1rem 1rem 1rem 1rem;
          align-items: flex-start;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          height: 100%;
          justify-content: center;
        }

        .ap-counter {
          font-size: 1.1rem;
          font-weight: bold;
          color: #2d3748;
          margin-bottom: 0.5rem;
        }

        .hp-icon {
          width: 50px;
          height: 50px;
        }


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

  private async moveToTile(room: Room, fIdx: number, tIdx: number) {
    const game: GameState = JSON.parse(JSON.stringify(room.game));
    if (!await this.useActionPoint(game, 1)) {return;}
    const name = this.playerName ?? '';
    game.playerPositions[name] = { floor: fIdx, tileIdx: tIdx };
    game.floors[fIdx].tiles[tIdx].revealed = true; // Rálépés felfedi

    // Őrrel való találkozás ellenőrzése
    let guardIdx = game.guardPositions[fIdx].pos.y * 4 + game.guardPositions[fIdx].pos.x;
    if (guardIdx === tIdx) {
      game.healths[name] = (game.healths[name] || 1) - 1;
    }

    await this.roomService.setGameState(this.roomId, game);
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
      const maxStep = Math.min(g.speed, path.length - 1);
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

// Moves the guard on the given floor, step-by-step, with 1s delay per step
  private async moveGuardWithDelay(game: GameState, floorIdx: number) {
    const guardIdx = game.guardPositions.findIndex(g => g.floor === floorIdx);
    if (guardIdx === -1) return;

    const guard = game.guardPositions[guardIdx];
    let path = this.getGuardPath({ game } as Room, floorIdx, guardIdx);

    for (let i = 1; i <= guard.speed; i++) {
      const nextIdx = path[1];
      path = path.splice(1);
      if (path.length === 1) {
        guard.target = guard.moves[0];
        guard.moves = guard.moves.slice(1);
        if (guard.moves.length === 0) {
          guard.speed++; // növeljük a sebességet, ha elfogytak a lépések

          let guardtargets = [];
          for (let i = 0; i < 16; i++) {
            const x = i % 4;
            const y = Math.floor(i / 4);

            guardtargets.push({ x: x, y: y });
          }
          let seedNum = 0;
          for (let i = 0; i < this.seed.length; i++) {
            seedNum = ((seedNum << 5) - seedNum) + this.seed.charCodeAt(i);
            seedNum |= 0;
          }

          const random = () => {
            const x = Math.sin(seedNum++) * 10000;
            return x - Math.floor(x);
          };

          const result = [...guardtargets];
          for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
          }
          guard.moves = result;
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
      }

      await this.roomService.setGameState(this.roomId, JSON.parse(JSON.stringify(game)));
      await new Promise(res => setTimeout(res, 2000/guard.speed)); // delay based on speed
      path = this.getGuardPath({ game } as Room, floorIdx, guardIdx);
    }
  }

  protected isMyTurn(room: Room): boolean {
    return room.game?.playerOrder?.[room.game.currentPlayerIdx] === this.playerName;
  }

  async endTurn(room: Room) {
    if (!room.game || !this.isMyTurn(room)) return;
    const game: GameState = JSON.parse(JSON.stringify(room.game));

    let nextplayerIdx = (game.currentPlayerIdx + 1) % game.playerOrder.length;


    // Move guard on the floor where the previous player ended their turn
    const prevPlayerPos = game.playerPositions[game.playerOrder[game.currentPlayerIdx]];
    if (prevPlayerPos) {
      game.currentPlayerIdx = -1;
      await this.moveGuardWithDelay(game, prevPlayerPos.floor);
    }

    game.currentPlayerIdx = nextplayerIdx;
    game.currentAP = 4;

    if (game.playerPositions[game.playerOrder[game.currentPlayerIdx]] === undefined && game.startingPosition !== null) {
      game.playerPositions[game.playerOrder[game.currentPlayerIdx]] = { floor: 0, tileIdx: game.startingPosition};
    }
    await this.roomService.setGameState(this.roomId, game);
  }

}
