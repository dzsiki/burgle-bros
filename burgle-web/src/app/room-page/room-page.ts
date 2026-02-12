import {Component, inject, HostListener, ChangeDetectorRef, ViewChild, ElementRef, AfterViewInit} from '@angular/core';
import {AsyncPipe, NgOptimizedImage} from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import {RoomService, Room, GameState, getRoomDisplayName, Tile, Characters} from '../services/room';
import { loadPlayerName } from '../services/player-storage';
import { Router } from '@angular/router';
import {eventList, generateGame, lootList, toolsList} from '../services/game-generator';
import {tap, take, firstValueFrom} from 'rxjs';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';

@Component({
  selector: 'app-room-page',
  standalone: true,
  imports: [AsyncPipe, NgOptimizedImage, DragDropModule],
  template: `
    @if (room$ | async; as room) {
      <!--suppress ALL -->
      <div class="viewport">
      <div class="app-root" #appRoot>
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

            <div class="floorToggle">
            <span class="lbl">2</span>

            <label class="switch">
              <input
                type="checkbox"
                [checked]="(room.floorCount ?? 3) === 3"
                [disabled]="room.phase !== 'lobby'"
                (change)="onFloorCountToggle($event, room)"
              />
              <span class="slider"></span>
            </label>

            <span class="lbl">3</span>
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

          <button class="btn btn-outline" (click)="toggleFullscreen()">
            {{ isFullscreen ? 'Kilépés teljes képernyőből' : 'Teljes képernyő' }}
          </button>

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

        @if (showCharacterDialog && needsCharacter(room)) {
          <div class="modal-backdrop" style="position:fixed; inset:0; background:rgba(0,0,0,.65); display:flex; align-items:center; justify-content:center; z-index:9999;">
            <div class="modal-card" style="background:#111; color:#fff; padding:24px; border-radius:14px; width:min(900px, 92vw); box-shadow:0 10px 40px rgba(0,0,0,.5);">
              <h3 style="margin:0 0 8px;">Válassz karaktert</h3>
              <p style="margin:0 0 16px; opacity:.9;">
                A köröd csak ezután indul – amíg nem választasz, nem tudsz lépni.
              </p>

              <!-- vízszintes, 1 soros, húzható karakter-sáv -->
              <div style=" display:flex;flex-wrap:nowrap;gap:16px;overflow-x:auto;overflow-y:hidden;padding:6px 6px 14px;
                      -webkit-overflow-scrolling:touch;scroll-snap-type:x mandatory;scrollbar-width:thin;">
                @for (c of characterList; track c) {
                  @let imgUrl = getOrLoadTileImage('character-' + c);

                  <button
                    (click)="selectCharacter(room, c)"
                    [disabled]="isCharacterTaken(room, c)"
                    style="
                            flex:0 0 auto;
                            width:300px;
                            padding:14px;
                            border-radius:16px;
                            border:1px solid rgba(255,255,255,.22);
                            background:#1b1b1b;
                            color:#fff;
                            cursor:pointer;
                            display:flex;
                            flex-direction:column;
                            align-items:center;
                            gap:12px;
                            scroll-snap-align:start;
                            transition:transform .08s ease;
      "
                    [style.opacity]="isCharacterTaken(room, c) ? '0.45' : '1'"
                    [style.cursor]="isCharacterTaken(room, c) ? 'not-allowed' : 'pointer'"
                    title="{{ isCharacterTaken(room, c) ? 'Foglalt' : 'Választás' }}"
                  >
                    @if (imgUrl) {
                      <img
                        [ngSrc]="imgUrl"
                        width="190"
                        height="190"
                        style="
            width:275px;
            height:275px;
            border-radius:14px;
            background:#0f0f0f;
            object-fit:contain;
          "
                        alt="character {{c}}"
                      />
                    } @else {
                      <div
                        style="
            width:190px;
            height:190px;
            border-radius:14px;
            background:#0f0f0f;
            display:flex;
            align-items:center;
            justify-content:center;
            opacity:.85;
            font-size:28px;
          "
                      >
                        ?
                      </div>
                    }

                    <div style="text-align:center; line-height:1.1;">
                      @if (isCharacterTaken(room, c)) {
                        <div style="font-weight:500; opacity:.85; margin-top:4px;">(foglalt)</div>
                      }
                    </div>
                  </button>
                }
              </div>
            </div>
          </div>
        }

      <div class="main-content">
        @if (room.phase === 'lobby') {
          <div class="lobby-start">
            <button class="btn btn-primary btn-large" (click)="start(room)">Játék indítása</button>
          </div>
        } @else if (room.phase === 'play') {
          <div class="game-layout">
            <div class="side-panel-left">
              <div class="tools-inner" #toolsInner>
                @for (loot of room.game?.inventory?.[playerName]?.loot?.slice(this.lootToolIndex, 3); track $index) {
                  @let imgUrl = getOrLoadTileImage('loot-' + loot);
                  @if (imgUrl && imgUrl != '') {
                    <img class="square-img" [ngSrc]="imgUrl" [style.--i]="(room.game?.inventory?.[playerName]?.tool?.length ?? 0) + $index" width="1" height="1" alt="{{ loot }}"/>
                  } @else {
                    <span class="tile-type">{{loot}}</span>
                  }
                }
                @for (tool of room.game?.inventory?.[playerName]?.tool?.slice(Math.max(0, this.lootToolIndex - (room.game?.inventory?.[playerName]?.loot?.length ?? 0)), 3 + this.lootToolIndex - (room.game?.inventory?.[playerName]?.loot?.length ?? 0)); track $index) {
                  @let imgUrl = getOrLoadTileImage('tool-' + tool);
                  @if (imgUrl && imgUrl != '') {
                  <img class="square-img"
                       [ngSrc]="imgUrl" width="1" height="1" [style.--i]="$index" alt="{{tool}}" (click)="toolClick(room, tool)">
                  }@else {
                    <span class="tile-type">{{tool}}</span>
                  }
                }
                @if (this.lootToolIndex > 0){
                  <button class="scroll-btn scroll-up" (click)="this.lootToolIndex= Math.max(0, this.lootToolIndex-1)">▲</button>}
                @if (this.lootToolIndex < (room.game?.inventory?.[playerName]?.loot?.length ?? 0) + (room.game?.inventory?.[playerName]?.tool?.length ?? 0) -3) {
                  <button class="scroll-btn scroll-down" (click)="this.lootToolIndex= Math.min((room.game?.inventory?.[playerName]?.loot?.length ?? 0) + (room.game?.inventory?.[playerName]?.tool?.length ?? 0) -3 ,this.lootToolIndex + 1)">▼</button>}
                </div>
            </div>
            <div class="game-area">
              @if (room.game) {
                <div class="floor-navigation">
                  <button class="nav-btn" [disabled]="activeFloorIdx === 0" (click)="changeFloor(-1)">◀</button>
                  <div class="floor-indicator">{{ activeFloorIdx + 1 }}. szint</div>
                  <button class="nav-btn" [disabled]="activeFloorIdx === (floorCount - 1)" (click)="changeFloor(1)">▶</button>
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

                          @if (((activeFloorIdx > 0 && room.game.floors[activeFloorIdx - 1].tiles[tIdx].type === 'Stairs') || tile.thermalStairsDown || tile.type === 'Walkway') && tile.revealed) {
                            <div class="down-exit-mark" title="Lejárat az alsó szintről">▼</div>
                          }
                          @if (((room.game.floors[activeFloorIdx].tiles[tIdx].type === 'Stairs') || tile.thermalStairsUp) && tile.revealed) {
                            <div class="down-exit-mark" title="Feljárat">▲</div>
                          }
                          @if (tile.revealed && tile.stealthtoken > 0) {
                            <div class="stealthtokennumber" title="Stealthtoken mennyiség">{{ tile.stealthtoken }}</div>
                          }
                          @if (tile.type === 'ComputerFingerprint' && tile.revealed) {
                            <div class="tokennumber" title="Token mennyiség">{{ room.game?.hackFingerprint }}
                              @if (isCurrentPlayerTile(room, activeFloorIdx, tIdx)) {
                                <button (click)="addToken(room,'fingerprint')"
                                        class="tokennumber plustoken btn btn-primary">+1
                                </button>
                              }
                            </div>
                          }
                          @if (tile.type === 'ComputerMotion' && tile.revealed) {
                            <div class="tokennumber" title="Token mennyiség">{{ room.game?.hackMotion }}
                              @if (isCurrentPlayerTile(room, activeFloorIdx, tIdx)) {
                                <button (click)="addToken(room,'motion')" class="tokennumber plustoken btn btn-primary">
                                  +1
                                </button>
                              }
                            </div>
                          }
                          @if (tile.type === 'ComputerLaser' && tile.revealed) {
                            <div class="tokennumber" title="Token mennyiség">{{ room.game?.hackLaser }}
                              @if (isCurrentPlayerTile(room, activeFloorIdx, tIdx)) {
                                <button (click)="addToken(room,'laser')" class="tokennumber plustoken btn btn-primary">
                                  +1
                                </button>
                              }
                            </div>
                          }
                          @if (tile.type === 'Safe' && tile.revealed) {
                            <div class="tokennumber" title="Token mennyiség">{{ tile.tokens }}
                              @if (isCurrentPlayerTile(room, activeFloorIdx, tIdx)) {
                                <button (click)="addToken(room,'safe', activeFloorIdx, tIdx)"
                                        class="tokennumber plustoken btn btn-primary">+1
                                </button>
                              }
                            </div>
                          }
                          @if (tile.type === 'Keypad' && tile.revealed) {
                            <div class="tokennumber" title="Locked">
                              {{ KeypadOpened(room, activeFloorIdx, tIdx) ? '🟩' : '🔒' }}
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
                            @if (tile.cat) {
                              <div class="player-pawn" title="Cat">🐱</div>}
                            @if (tile.gold) {
                              <div class="player-pawn" title="Cat">🧈</div>}
                          </div>
                          @if (tile.revealed) {
                            @if (tile.type !== 'Safe') {
                              <div [class.numberCracked]="tile.cracked" class="tile-number number-on-tile"
                                   [title]="tile.number">{{ tile.number }}
                              </div>
                            } @else if (isCurrentPlayerTile(room, activeFloorIdx, tIdx)) {
                              <button (click)="crackSafe(room, activeFloorIdx, tIdx)"
                                      class="tokennumber plustoken crackbtn btn btn-primary">🔑
                              </button>
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

                <div class="stats-row">
                  <span class="label">Motion hacks</span>
                  <span class="value">{{ room.game?.hackMotion }}</span>
                </div>

                <div class="stats-row">
                  <span class="label">Laser hacks</span>
                  <span class="value">{{ room.game?.hackLaser }}</span>
                </div>

                <div class="stats-row">
                  <span class="label">Fingerprint hacks</span>
                  <span class="value">{{ room.game?.hackFingerprint }}</span>
                </div>

                <div class="stats-row"></div>

                <div class="stats-row">
                  <span class="label">Guard speed</span>
                  <span class="value">{{ (room.game?.guardPositions?.[activeFloorIdx]?.speed ?? 0) + (room.game?.floors?.[activeFloorIdx]?.alarms?.length ?? 0) }}</span>
                </div>

                <div class="dice-container panel-dice">
                  @for (die of diceValues; track $index) {
                    <div class="dice">{{ diceMap[die] }}</div>
                  }
                </div>

                <div class="separator">--- Aktív eventek ---</div>

                <div class="stats-row">
                  @if (room.game?.hackHacker === 1) {
                    <span class="label">Hacker token aktív!</span>
                    <span class="value">Felhasználható bármelyik hack tokenként!</span>}
                </div>

                  <div class="stats-row">
                    @if (room.game?.emp !== "") {
                    <span class="label">EMP aktív!</span>
                    <span class="value">Nem működnek a riasztók!</span>}
                  </div>


                  <div class="stats-row">
                    @if (room.game?.timelock !== "") {
                    <span class="label">Time lock aktív!</span>
                    <span class="value">A lépcsők nem használhatóak!</span>}
                  </div>



                  <div class="stats-row">
                    @if (room.game?.cameraloop !== "") {
                    <span class="label">Video loop aktív!</span>
                    <span class="value">Nem működnek a kamerák!</span>}
                  </div>



                  <div class="stats-row">
                    @if (room.game?.gymnastics !== "") {
                    <span class="label">Gymnastics aktív!</span>
                    <span class="value">Walkway használható lépcsőként!</span>}
                  </div>

                <div class="stats-row"></div>

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
                <div class="stats-row">
                  <span class="label">Action Points:</span>
                  <span class="value">{{ room.game?.currentAP ?? 0 }}</span>
                </div>

                <div class="char-heat-wrapper">

                  @let myChar = room.game?.playerCharacter?.[playerName];
                  @if (myChar) {
                    <div class="character-box">
                      @let cUrl = getOrLoadTileImage('character-' + myChar);
                      @if (cUrl) {
                        <img
                          class="character-img"
                          [ngSrc]="cUrl"
                          width="250"
                          height="250"
                          alt="my character {{myChar}}"
                        />
                      }
                      @if (room.game?.juicerToken === 1 && room.game?.playerCharacter?.[playerName] === "JuicerHard") {<div class="juicerAlarm">🚨</div>}
                    </div>
                  }
                  <div class="heatmap-container">
                <div class="heatmap-grid">
                  @for (v of generateHeatmap((room.game?.floors?.[activeFloorIdx]?.tiles ?? [])); track $index) {
                    <div class="heat-cell" [style.background]="colorFromT(v)"
                         [class.border-bottom]="room.game?.floors?.[activeFloorIdx]?.tiles?.[$index]?.walls?.bottom"
                         [class.border-right]="room.game?.floors?.[activeFloorIdx]?.tiles?.[$index]?.walls?.right"
                         [class.border-left]="room.game?.floors?.[activeFloorIdx]?.tiles?.[$index]?.walls?.left"
                         [class.border-top]="room.game?.floors?.[activeFloorIdx]?.tiles?.[$index]?.walls?.top"
                    ></div>
                  }
                </div>
                </div>
                </div>


              </div>
              <div class="panel-bottom endturnbtn">
                <button class="btn btn-primary endturnbtn"
                        [disabled]="!isMyTurn(room) || !canUseCharacterSpell(room)"
                        (click)="useCharacterSpell(room)">
                  Use skill
                </button>
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
        <dialog id="choiceDialog">
          <form method="dialog">
            <div class="dialog-body" >
              <p class="ap-dialog">Mit szeretnél csinálni?</p>
              <select id="choice-select" class="form-select" hidden></select>
              <button id="choice-1" class="btn btn-success" value="1">1</button>
              <button id="choice-2" class="btn btn-success" value="2">2</button>
              <button id="choice-3" class="btn btn-success" value="3">3</button>
              <button id="choice-4" class="btn btn-success" value="4" hidden>4</button>
              <button id="choice-5" class="btn btn-success" value="5" hidden>5</button>
              <button id="choice-6" class="btn btn-success" value="6" hidden>6</button>
              <button id="choice-cancel" class="btn btn-danger" value="Cancel">Mégse</button>
            </div>
          </form>
        </dialog>

        @if (showBlueprintDialog) {
          <div class="overlay">
            <div class="modal">
              <h4>{{ blueprintHeaderText }}</h4>

              <div class="floorTabs">
                <button [class.activeblueprintfloorbtn]="blueprintFloorIdx == 0" (click)="blueprintFloorIdx = 0">1. szint</button>
                <button [class.activeblueprintfloorbtn]="blueprintFloorIdx == 1" (click)="blueprintFloorIdx = 1">2. szint</button>
                @if (room.floorCount === 3) {
                <button [class.activeblueprintfloorbtn]="blueprintFloorIdx == 2" (click)="blueprintFloorIdx = 2">3. szint</button>}
              </div>

              @let floor = room.game?.floors?.[blueprintFloorIdx];
              <div class="blueprintgrid">
                @for (tile of floor?.tiles; track $index; let tIdx = $index) {
                  <button
                    class="cell"
                    (click)="resolveBlueprintTarget(blueprintFloorIdx, tIdx, tile.revealed)"
                    [class.revealed]="tile.revealed"
                    [disabled]="tile.revealed || (blueprintAllowedMask && !blueprintAllowedMask[blueprintFloorIdx]?.[tIdx])"
                    title="{{ tile.revealed ? tile.type : '?' }}"
                    [class.hawkCurrent]="(isCurrentPlayerTile(room, blueprintFloorIdx, tIdx) && blueprintAllowedMask !== null)"
                    [class.bpdisabled]="tile.revealed || (blueprintAllowedMask && !blueprintAllowedMask[blueprintFloorIdx]?.[tIdx])"
                  >
                    <span style="font-size:18px;">@if (tile.revealed) { {{ tile.type }} } @else { ? }</span>
                  </button>
                }
              </div>
            </div>
          </div>
        }

        @if (showCrystalDialog) {
        <div class="overlay">
          <div class="modal">
            <h4>Crystal – események sorrendje</h4>
            <p>Húzd és ejtsd a kártyákat a kívánt sorrendbe (mobilon is).</p>

            <!-- számozás felül -->
            <div class="crystalNumbers">
              @for (i of [1,2,3]; track $index) {
        <div class="crystalNum">{{ i }}.</div>
        }
        </div>

        <!-- kártyák sorban, vízszintes drag&drop -->
        <div class="crystalRow"
             cdkDropList
             [cdkDropListData]="crystalCards"
             cdkDropListOrientation="horizontal"
             (cdkDropListDropped)="dropCrystal($event)">

          @for (c of crystalCards; track $index) {
        <div class="crystalCard" cdkDrag>
          <div class="crystalImgWrap">
            @let imgUrl = getOrLoadTileImage('event-' + c);
            @if (imgUrl && imgUrl != '') {
              <img [ngSrc]="imgUrl" width="1" height="1" alt="{{c}}" />
              } @else {
                <!-- fallback, ha még nincs asset -->
              <div class="crystalFallback">{{ c }}</div>
              }
                </div>
              </div>
                }
              </div>

              <div class="crystalActions">
                <button (click)="confirmCrystalDialog()">Mentés</button>
              </div>
              </div>
              </div>
            }

        @if (showEventDialog) {
          <div class="overlay">
            <div class="modal">
              <h4>Esemény</h4>

              @if (currentEventName) {
                @let imgUrl = getOrLoadTileImage('event-' + currentEventName);

                @if (imgUrl && imgUrl != '') {
                  <img class="eventImg" [ngSrc]="imgUrl" width="1" height="1" alt="{{currentEventName}}">
                } @else {
                  <div class="eventFallback">
                    {{ currentEventName }}
                  </div>
                }
              }

              <button class="btn eventOk" (click)="confirmEventDialog()">OK</button>
            </div>
          </div>
        }


            <style>
        @import './room-page.scss';
      </style>
      </div>
      </div>
    } @else {
      <div style="padding: 20px;">Betöltés...</div>
    }
  `,
})

export class RoomPageComponent implements AfterViewInit {
  protected getRoomDisplayName = getRoomDisplayName;
  private route = inject(ActivatedRoute);
  protected router = inject(Router);
  private roomService = inject(RoomService);
  private cdr = inject(ChangeDetectorRef);
  private seed = '';
  private seednum = 0;
  protected diceValues = [0, 0, 0, 0, 0, 0];
  diceMap = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  lootToolIndex = 0;
  floorCount: 2 | 3 = 3

  roomId = this.route.snapshot.paramMap.get('id')!;

  private currentPhase: 'lobby' | 'play' | 'end' = 'lobby';

  room$ = this.roomService.watchRoom(this.roomId).pipe(
    tap(r => {
      if (r) {
        this.seed = r.seed;
        this.currentPhase = r.phase;
        this.floorCount = r.floorCount
        // Ha most kezdődött a játék és van pozíciónk, ugorjunk oda
        if (r.phase === 'play' && r.game) {
          const myPos = r.game.playerPositions?.[this.playerName ?? ''];
          if (myPos && this.activeFloorIdx === 0 && myPos.floor !== 0) {
            // Ez csak az első betöltéskor/induláskor érdekes, ha nem az 1. szinten vagyunk
            // De mivel alapértelmezettnek az 1. szintet kérték, talán jobb nem ugrálni magától
            // kivéve ha tényleg ott vagyunk.
          }
        }

        this.showCharacterDialog = !!(
          r?.phase === 'play' &&
          r.game &&
          !this.isSpectator(r) &&
          this.isMyTurn(r) &&
          this.needsCharacter(r)
        );

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

  @ViewChild('appRoot') appRoot?: ElementRef<HTMLElement>;
  resizeApp() {
    if (!this.appRoot) return;
    const app = this.appRoot.nativeElement;

    const appWidth = 1900;
    const appHeight = 900;

    const scaleX = window.innerWidth / appWidth;
    const scaleY = window.innerHeight / appHeight;

    const scale = Math.min(scaleX, scaleY, 1);

    app.style.transform = `scale(${scale})`;
  }


  isFullscreen = false;

  // Fullscreen állapot figyelése (külön vendor eventek)
  @HostListener('document:fullscreenchange', [])
  @HostListener('document:webkitfullscreenchange', [])
  onFsChange() {
    this.isFullscreen = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
  }

  async toggleFullscreen(target?: HTMLElement) {
    const doc: any = document;
    const elem: any = target ?? document.documentElement;

    // már fullscreen?
    const isFs = !!(doc.fullscreenElement || doc.webkitFullscreenElement);
    try {
      if (!isFs) {
        if (elem.requestFullscreen) {
          await elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) {
          elem.webkitRequestFullscreen(); // iOS/older WebKit (korlátozott)
        }
      } else {
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          doc.webkitExitFullscreen();
        }
      }
      this.resizeApp()
    } catch (e) {
      console.warn('Fullscreen hiba/korlátozás:', e);
    }
  }


@ViewChild('appRoot')
  set appRootSetter(el: ElementRef<HTMLElement> | undefined) {
    if (!el) return;
    this.resizeApp();
  }


    ngAfterViewInit() {
      window.addEventListener('resize', () => this.resizeApp());
  }


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
    if (newIdx >= 0 && newIdx < this.floorCount) {
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

  async onFloorCountToggle(event: Event, room: Room) {
    if (room.phase !== 'lobby') return;
    const checked = (event.target as HTMLInputElement).checked;
    const floorCount: 2 | 3 = checked ? 3 : 2;
    await this.roomService.updateFloorCount(this.roomId, floorCount);
  }

  async start(room: Room) {
    const floorCount = (room.floorCount ?? 3) as 2 | 3;
    const game = generateGame(room.seed, floorCount);

    for (let i = 0; i < this.seed.length; i++) {
      this.seednum = ((this.seednum << 5) - this.seednum) + this.seed.charCodeAt(i);
      this.seednum |= 0;
    }


    for (let i = 0; i < floorCount; i++) {
      game.guardPositions[i].pos = game.guardPositions[i].moves[0];
      game.guardPositions[i].target = game.guardPositions[i].moves[1];
      game.guardPositions[i].moves = game.guardPositions[i].moves.slice(2);
    }

    game.playerOrder = [...room.players];

    for (let i = 0; i < room.players.length; i++) {
        game.inventory[room.players[i]] = {loot: [], tool: []}
    }

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
    if (this.isSpectator(room) || !room.game || !this.isMyTurn(room) || this.needsCharacter(room)) return false;

    if (dir === 'floorUp') {
      return fIdx < this.floorCount - 1
        && (room.game.floors[fIdx].tiles[tIdx].type === 'Stairs' || room.game.floors[fIdx].tiles[tIdx].thermalStairsUp
        || ((room.game.gymnastics !== "" && room.game.floors[fIdx].tiles[tIdx].type === 'Walkway')))
        && room.game.timelock === "";
    }
    if (dir === 'floorDown') {
      return fIdx > 0
        && (room.game.floors[fIdx - 1].tiles[tIdx].type === 'Stairs' || room.game.floors[fIdx].tiles[tIdx].type === 'Walkway' || room.game.floors[fIdx].tiles[tIdx].thermalStairsDown
        ||((room.game.gymnastics !== "" && room.game.floors[fIdx - 1].tiles[tIdx].type === 'Walkway')))
        && room.game.timelock === "";
    }

    let targetIdx = this.calcTargetIdx(tIdx, dir);

    if (targetIdx === -1) return false;
    return !this.isWallBetween(room, fIdx, tIdx, targetIdx);
  }

  protected canInteract(room: Room, fIdx: number, tIdx: number): boolean {
    if (this.isSpectator(room) || !room.game || !this.isMyTurn(room) || this.needsCharacter(room)) return false;
    const playerPositions = room.game.playerPositions || {};
    const myPos = playerPositions[this.playerName ?? ''];

    // Első lerakás: csak az 1. szint szélén (floor 0, edge tiles)
    if (!myPos) {
      if (fIdx !== 0) return false;
      const x = tIdx % 4;
      const y = Math.floor(tIdx / 4);
      return x === 0 || x === 3 || y === 0 || y === 3;
    }

    if ((myPos.floor != fIdx && myPos.tileIdx != tIdx) && room.game.floors[myPos.floor].tiles[myPos.tileIdx].type === 'ServiceDuct' && room.game.floors[fIdx].tiles[tIdx].type === 'ServiceDuct' && room.game.floors[fIdx].tiles[tIdx].revealed && room.game.inventory[this.playerName].loot.indexOf("Painting") === -1) return true


    // Szinten belüli mozgás/peek
    if (myPos.floor === fIdx) {
      return this.isAdjacent(myPos.floor, myPos.tileIdx, fIdx, tIdx) &&
             !this.isWallBetween(room, myPos.floor, myPos.tileIdx, tIdx);
    }

    // Szintek közötti mozgás/peek (csak ha ugyanaz a koordináta)
    if (tIdx === myPos.tileIdx) {
      // Felmenetel
      if (fIdx === myPos.floor + 1) {
        return (
            room.game.floors[myPos.floor].tiles[myPos.tileIdx].type === 'Stairs'
            && (room.game.timelock === "" || !room.game.floors[fIdx].tiles[tIdx].revealed)
          )
          || (room.game.floors[myPos.floor].tiles[myPos.tileIdx].type === 'Atrium' && !room.game.floors[fIdx].tiles[tIdx].revealed)
          || room.game.floors[myPos.floor].tiles[myPos.tileIdx].thermalStairsUp
          || (room.game.gymnastics !== "" && room.game.floors[myPos.floor].tiles[myPos.tileIdx].type === 'Walkway');
      }
      // Lemenetel
      if (fIdx === myPos.floor - 1) {
        return (
          room.game.floors[fIdx].tiles[tIdx].type === 'Stairs'
          && (room.game.timelock === "" || !room.game.floors[fIdx].tiles[tIdx].revealed)
        )
          || (room.game.floors[myPos.floor].tiles[myPos.tileIdx].type === 'Atrium' && !room.game.floors[fIdx].tiles[tIdx].revealed)
          || room.game.floors[myPos.floor].tiles[myPos.tileIdx].thermalStairsDown
          || (room.game.gymnastics !== "" && room.game.floors[fIdx].tiles[tIdx].type === 'Walkway');
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

    if (tile2.type === 'SecretDoor' && tile2.revealed && room.game.inventory[this.playerName].loot.indexOf("Painting") === -1) return false;

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
    k = Math.min(6, k)
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

    let occupiedandgemstone = false;
    for (const player in game.playerPositions) {
      if (game.playerPositions[player].floor === fIdx && game.playerPositions[player].tileIdx === tIdx) {
        occupiedandgemstone = true;
        break;
      }
    }
    occupiedandgemstone = !(occupiedandgemstone && game.inventory[this.playerName].loot.indexOf("Gemstone") !== -1)


    const isAcrobat = room.game?.playerCharacter?.[this.playerName] === 'Acrobat';
    const steppingOntoGuard = game.guardPositions[fIdx].pos.y * 4 + game.guardPositions[fIdx].pos.x === tIdx;

    if (!(isAcrobat && steppingOntoGuard)) {
    if (game.floors[fIdx].tiles[tIdx].type === 'SafetyLock') {
      let occupied = false;
      for (const player in game.playerPositions) {
        if (game.playerPositions[player].floor === fIdx && game.playerPositions[player].tileIdx === tIdx) {
          occupied = true;
          break;
        }
      }
      if (game.guardPositions[fIdx].pos.y * 4 + game.guardPositions[fIdx].pos.x === tIdx) {
        occupied = true;
      }

      if (occupied) {
        if (!await this.useActionPoint(game, occupiedandgemstone ? 1 : 2)) {
          return;
        }
      } else {
        if (!await this.useActionPoint(game, 3)) {
          if (!game.floors[fIdx].tiles[tIdx].revealed) {
            if (!await this.useActionPoint(game, 1)) {
              return;
            }
            game.floors[fIdx].tiles[tIdx].revealed = true;
            await this.roomService.setGameState(this.roomId, game);
            return;
          }
          return;
        }
      }

    } else {
      if (game.floors[fIdx].tiles[tIdx].type === 'Laser') {
        if (!game.floors[fIdx].tiles[tIdx].revealed || (game.inventory[this.playerName].loot.indexOf("Mirror") !== -1)) {
          if (!await this.useActionPoint(game, occupiedandgemstone ? 1 : 2)) {
            return;
          }
          this.triggerAlarm(game, "Laser", fIdx, tIdx);
        } else {
          const guard = game.guardPositions[fIdx];
          if (game.currentAP >= 2 && !(tIdx === guard.pos.y * 4 + guard.pos.x || game.floors[fIdx].alarms.includes(tIdx))) {

            if (await this.askActionPoints()) {
              if (!await this.useActionPoint(game, 2)) {
                return;
              }
            } else {

              if (!await this.useActionPoint(game, occupiedandgemstone ? 1 : 2)) {
                return;
              }
              this.triggerAlarm(game, "Laser", fIdx, tIdx);
            }
          } else {
            if (!await this.useActionPoint(game, occupiedandgemstone ? 1 : 2)) {
              return;
            }
            this.triggerAlarm(game, "Laser", fIdx, tIdx);
          }
        }
      } else {
        if (!await this.useActionPoint(game, occupiedandgemstone ? 1 : 2)) {
          return;
        }
      }
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

    game.floors[fIdx].tiles[tIdx].revealed = true;

    // Őrrel való találkozás ellenőrzése
    let guardIdx = game.guardPositions[fIdx].pos.y * 4 + game.guardPositions[fIdx].pos.x;
    if (guardIdx === tIdx && !this.isInvisible) {
      if (this.alreadyDamaged.indexOf(name) === -1) {
      if (game.floors[fIdx].tiles[tIdx].stealthtoken>0) {
        game.floors[fIdx].tiles[tIdx].stealthtoken --;
      }else {
        game.healths[name] = (game.healths[name] || 1) - 1;}
      this.alreadyDamaged.push(name)
    }}

    if (this.isAdjacent(fIdx, guardIdx, fIdx, tIdx) && (game.floors[fIdx].tiles[tIdx].type === 'Lobby' || game.inventory[this.playerName].loot.indexOf("Tiara") !== -1) && !this.isInvisible){
      if (this.alreadyDamaged.indexOf(name) === -1) {
      if (game.floors[fIdx].tiles[tIdx].stealthtoken>0) {
        game.floors[fIdx].tiles[tIdx].stealthtoken --;
      }else {
        game.healths[name] = (game.healths[name] || 1) - 1;}
      this.alreadyDamaged.push(name)
    }}

    let g1Idx,g2Idx = undefined
    if (fIdx > 0)
      g1Idx = game.guardPositions[fIdx - 1].pos.y * 4 + game.guardPositions[fIdx - 1].pos.x;
    if (fIdx < this.floorCount - 1)
      g2Idx = game.guardPositions[fIdx + 1].pos.y * 4 + game.guardPositions[fIdx + 1].pos.x;

    if ((tIdx === g1Idx || tIdx === g2Idx) && game.floors[fIdx].tiles[tIdx].type === 'Atrium' && !this.isInvisible) {
      if (this.alreadyDamaged.indexOf(name) === -1) {
      if (game.floors[fIdx].tiles[tIdx].stealthtoken>0) {
        game.floors[fIdx].tiles[tIdx].stealthtoken --;
      }else {
        game.healths[name] = (game.healths[name] || 1) - 1;}
      this.alreadyDamaged.push(name)
    }}

    if(game.floors[fIdx].tiles[tIdx].type === 'Fingerprint')
      this.triggerAlarm(game, "Fingerprint", fIdx, tIdx);

    if(game.floors[fIdx].tiles[tIdx].type === 'Thermo' && game.inventory[this.playerName].loot.indexOf("Isotope") !== -1)
      this.triggerAlarm(game, "Thermo", fIdx, tIdx);

    if(game.floors[fIdx].tiles[tIdx].type === 'Camera' && !this.isInvisible)
      this.checkCameras(game,false, fIdx, tIdx);

    if(game.floors[fIdx].tiles[tIdx].type === 'Scanner'){
      if(game.inventory[this.playerName].tool.length > 0 || game.inventory[this.playerName].loot.length > 0){
        this.triggerAlarm(game, 'Scanner', fIdx, tIdx);
      }
    }

    if(game.floors[fIdx].tiles[tIdx].type === 'Laboratory' && !game.floors[fIdx].tiles[tIdx].empty) {
      await this.drawTool(game,this.playerName)
      game.floors[fIdx].tiles[tIdx].empty = true;
    }

    if(game.floors[fIdx].tiles[tIdx].cat){
      game.floors[fIdx].tiles[tIdx].cat = false
      game.inventory[this.playerName].loot.push("Cat")
    }

    if(game.floors[fIdx].tiles[tIdx].gold && game.inventory[this.playerName].loot.indexOf("Gold") === -1){
      game.floors[fIdx].tiles[tIdx].gold = false
      game.inventory[this.playerName].loot.push("Gold")
    }

    await this.roomService.setGameState(this.roomId, game);
    return game
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

  actionCount = 0
  private async useActionPoint(game: GameState, cost: number) {
    if (game.currentAP < cost) {return false;}
    game.currentAP -= cost;
    this.actionCount += 1
    return true;
  }

  random = () => {
    const x = Math.sin(this.seednum++) * 10000;
    return x - Math.floor(x);
  };

  shuffle(inArray:any[]){
    const result = [...inArray];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  private generateNewGuardTargets(guard: GameState['guardPositions'][0]) {
    let guardtargets = [];
    for (let i = 0; i < 16; i++) {
      const x = i % 4;
      const y = Math.floor(i / 4);

      guardtargets.push({ x: x, y: y });
    }

    guard.moves = this.shuffle(guardtargets);
  }

// Moves the guard on the given floor, step-by-step, with 1s delay per step
  alreadyDamaged: string[] = []
  private async moveGuardWithDelay(game: GameState, floorIdx: number) {
    this.animatation = true
    const guardIdx = game.guardPositions.findIndex(g => g.floor === floorIdx);
    if (guardIdx === -1) return;

    const guard = game.guardPositions[guardIdx];

    if ( guard.donut ) {
      guard.donut = false
      await this.roomService.setGameState(this.roomId, JSON.parse(JSON.stringify(game)));
      return
    }

    if(guard.target.x === guard.pos.x && guard.target.y === guard.pos.y) {
      if (game.floors[floorIdx].alarms.length > 0) {
        this.checkClosestAlarm(game, guard, floorIdx, guardIdx);
    } else {
      // 2) Nincs alarm: patrol target a moves-ból
      if (!guard.moves || guard.moves.length === 0) {
        this.generateNewGuardTargets(guard);
      }

      // válassz olyan move-ot, ami NEM az aktuális pozíció
      const next = guard.moves.find(m => m.x !== guard.pos.x || m.y !== guard.pos.y);

      if (next) {
        guard.target = { x: next.x, y: next.y };
      } else {
        // nagyon szélsőséges eset: minden moves elem ugyanoda mutat -> újrakeverés
        this.generateNewGuardTargets(guard);
        let nextnext = guard.moves.find(m => m.x !== guard.pos.x || m.y !== guard.pos.y)
        if (nextnext)
        guard.target = nextnext;
      }
    }

  }

    let path = this.getGuardPath({ game } as Room, floorIdx, guardIdx);

    const gspeed = guard.speed + game.floors[floorIdx].alarms.length + this.espresso
    this.espresso = 0
    for (let i = 1; i <= gspeed; i++) {
        if (!path || path.length < 2) {

          // ha pont alarmon áll, vegyük le (különben ragadhat)
          const curIdx = guard.pos.y * 4 + guard.pos.x;
          if (game.floors[floorIdx].alarms.includes(curIdx)) {
            game.floors[floorIdx].alarms = game.floors[floorIdx].alarms.filter(a => a !== curIdx);
          }

          if (game.floors[floorIdx].alarms.length > 0) {
            this.checkClosestAlarm(game, guard, floorIdx, guardIdx);
          } else {
            if (!guard.moves || guard.moves.length === 0) {
              this.generateNewGuardTargets(guard);
            }
            const next = guard.moves.find(m => m.x !== guard.pos.x || m.y !== guard.pos.y);
            if (next) {
              guard.target = { x: next.x, y: next.y };
            } else {
              this.generateNewGuardTargets(guard);
              guard.target = { x: guard.moves[0].x, y: guard.moves[0].y };
            }
          }

          path = this.getGuardPath({ game } as Room, floorIdx, guardIdx);

          // ha továbbra sincs értelmes lépés, nincs hova menni
          if (!path || path.length < 2) break;
        }

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

      if (game.floors[floorIdx].tiles[nextIdx].type === 'Camera' && game.floors[floorIdx].tiles[nextIdx].revealed) {
        this.checkCameras(game, true, floorIdx, nextIdx);
      }

      for (const player of game.playerPositions ? Object.keys(game.playerPositions) : []) {
        if (game.playerPositions[player].floor === floorIdx && game.playerPositions[player].tileIdx === nextIdx) {
          if (this.alreadyDamaged.indexOf(player) === -1) {
          if (game.floors[floorIdx].tiles[nextIdx].stealthtoken>0) {
            game.floors[floorIdx].tiles[nextIdx].stealthtoken --;
          }else {
            game.healths[player] = (game.healths[player] || 1) - 1;}
          this.alreadyDamaged.push(this.playerName)
        }}

        if ((game.playerPositions[player].floor === floorIdx - 1 || game.playerPositions[player].floor === floorIdx + 1) && game.playerPositions[player].tileIdx === nextIdx && game.floors[game.playerPositions[player].floor].tiles[game.playerPositions[player].tileIdx].type === 'Atrium') {
          if (this.alreadyDamaged.indexOf(player) === -1) {
          if (game.floors[game.playerPositions[player].floor].tiles[game.playerPositions[player].tileIdx].stealthtoken>0) {
            game.floors[game.playerPositions[player].floor].tiles[game.playerPositions[player].tileIdx].stealthtoken --;
          }else {
            game.healths[player] = (game.healths[player] || 1) - 1;}
          this.alreadyDamaged.push(player)
        }}

        if(game.floors[game.playerPositions[player].floor].tiles[game.playerPositions[player].tileIdx].type === 'Lobby' || game.inventory[player].loot.indexOf("Tiara") !== -1){
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
                if (this.alreadyDamaged.indexOf(player) === -1) {
                if (game.floors[game.playerPositions[player].floor].tiles[game.playerPositions[player].tileIdx].stealthtoken>0) {
                  game.floors[game.playerPositions[player].floor].tiles[game.playerPositions[player].tileIdx].stealthtoken --;
                }else {
                  game.healths[player] = (game.healths[player] || 1) - 1;}
                this.alreadyDamaged.push(player)
            }}
          }
        }
      }

      await this.roomService.setGameState(this.roomId, JSON.parse(JSON.stringify(game)));
      await new Promise(res => setTimeout(res, 2000/guard.speed)); // delay based on speed
      path = this.getGuardPath({ game } as Room, floorIdx, guardIdx);
    }

    this.animatation = false
  }

  protected isMyTurn(room: Room): boolean {
    return room.game?.playerOrder?.[room.game.currentPlayerIdx] === this.playerName && !this.animatation;
  }

  async endTurn(room: Room) {
    if (this.needsCharacter(room)) return;
    this.diceValues = [0,0,0,0,0,0];
    this.alreadyDamaged = []
    if (!room.game || !this.isMyTurn(room)) return;
    const game: GameState = JSON.parse(JSON.stringify(room.game));

    this.isInvisible = false

    if (game.inventory[this.playerName].loot.indexOf("Cat") !== -1){
      await this.rollDice(1)
      if (this.diceValues[0] <= 2){
        await this.moveTowardAlarm(game)
      }
    }

    let nextplayerIdx = (game.currentPlayerIdx + 1) % game.playerOrder.length;

    // Move guard on the floor where the previous player ended their turn
    const prevPlayerPos = game.playerPositions[game.playerOrder[game.currentPlayerIdx]];

    if(game.floors[prevPlayerPos.floor].tiles[prevPlayerPos.tileIdx].type === 'Thermo'){
      this.triggerAlarm(game, "Thermo", prevPlayerPos.floor, prevPlayerPos.tileIdx);
    }

    if ( this.actionCount <= 2  || (this.actionCount <= 3 && game.inventory[this.playerName].loot.indexOf("Stamp") !== -1))
      await this.drawEvent(game)

    this.actionCount = 0


    if (game.playerCharacter?.[this.playerName] === 'Acrobat') {
      const guardPos = game.guardPositions[game.playerPositions[this.playerName].floor].pos;
      const guardTileIdx = guardPos.y * 4 + guardPos.x;

      if (game.playerPositions[this.playerName].tileIdx === guardTileIdx) {
        game.healths[this.playerName] = (game.healths[this.playerName] ?? 0) - 1;
      }
    }


    if (prevPlayerPos) {
      game.currentPlayerIdx = -1;
      if (this.shiftchange === 0)
        await this.moveGuardWithDelay(game, prevPlayerPos.floor);
      else
        this.shiftchange = 0
    }

    this.alreadyDamaged = []

    for (let i = 0; i < game.keypads.length; i++) {
      game.keypads[i].tries = 0;
    }
    this.triggeredMotions = [];

    if(this.jumpthegun === 1){
      nextplayerIdx = (nextplayerIdx + 1) % game.playerOrder.length
      this.jumpthegun = 0
    }
    game.currentPlayerIdx = nextplayerIdx;
    game.currentAP = 4;

    if (game.inventory[game.playerOrder[game.currentPlayerIdx]].loot.indexOf("Mirror") !== -1){
      game.currentAP -= 1;
    }
    if (this.headsup === 1){
      game.currentAP += 1;
      this.headsup = 0;
    }

    if (game.inventory[game.playerOrder[game.currentPlayerIdx]].loot.indexOf("Chihuahua") !== -1){
      await this.rollDice(1)
      if (this.diceValues[0] === 6){
        this.triggerAlarm(game,"Chihuahua", game.playerPositions[game.playerOrder[game.currentPlayerIdx]].floor, game.playerPositions[game.playerOrder[game.currentPlayerIdx]].tileIdx)
      }
    }

    if (game.emp === game.playerOrder[game.currentPlayerIdx]){
      game.emp = ""
    }
    if (game.timelock === game.playerOrder[game.currentPlayerIdx]){
      game.timelock = ""
    }
    if (game.cameraloop === game.playerOrder[game.currentPlayerIdx]){
      game.cameraloop = ""
    }
    if (game.gymnastics === game.playerOrder[game.currentPlayerIdx]){
      game.gymnastics = ""
    }

    this.hawkPeeked = false

    if (game.playerPositions[game.playerOrder[game.currentPlayerIdx]] === undefined && game.startingPosition !== null) {
      game.playerPositions[game.playerOrder[game.currentPlayerIdx]] = { floor: 0, tileIdx: game.startingPosition};
    }
    await this.roomService.setGameState(this.roomId, game);
  }

  private async moveTowardAlarm(game: GameState, playerName?: string) {
    const pName = playerName ?? this.playerName ?? '';
    if (!pName) return;
    if (!game?.playerPositions?.[pName]) return;

    const pos = game.playerPositions[pName];
    const floorIdx = pos.floor;

    const floor = game.floors?.[floorIdx];
    if (!floor) return;

    const alarms: number[] = Array.isArray(floor.alarms) ? floor.alarms : [];
    if (alarms.length === 0) return;

    const tiles = floor.tiles;
    const startIdx = pos.tileIdx;

    // Keressük a legrövidebb path-ot bármelyik alarmhoz
    let bestPath: number[] | null = null;

    for (const targetIdx of alarms) {
      const path = this.shortestPathLikeGuard(tiles, startIdx, targetIdx);
      if (!path) continue;

      if (!bestPath || path.length < bestPath.length) {
        bestPath = path;
      }
    }

    // Ha nincs út vagy már ott áll, nincs lépés
    if (!bestPath || bestPath.length < 2) return;

    // 1 lépés a path-on
    const nextIdx = bestPath[1];
    game.floors[floorIdx].tiles[nextIdx].cat = true
    game.inventory[this.playerName].loot.splice(game.inventory[this.playerName].loot.indexOf("Cat"), 1)
    await this.roomService.setGameState(this.roomId, game);
  }

  private shortestPathLikeGuard(tiles: Tile[], startIdx: number, targetIdx: number): number[] | null {
    if (!tiles || tiles.length !== 16) return null;
    if (startIdx === targetIdx) return [startIdx];

    const queue: number[] = [startIdx];
    const visited = new Set<number>([startIdx]);
    const prev = new Map<number, number>(); // child -> parent

    while (queue.length) {
      const idx = queue.shift()!;
      if (idx === targetIdx) break;

      const x = idx % 4;
      const y = Math.floor(idx / 4);

      const neighbors: { n: number; ok: boolean }[] = [
        { n: idx - 4, ok: y > 0 && !tiles[idx].walls.top },
        { n: idx + 4, ok: y < 3 && !tiles[idx].walls.bottom },
        { n: idx - 1, ok: x > 0 && !tiles[idx].walls.left },
        { n: idx + 1, ok: x < 3 && !tiles[idx].walls.right },
      ];

      for (const { n, ok } of neighbors) {
        if (!ok) continue;
        if (visited.has(n)) continue;
        visited.add(n);
        prev.set(n, idx);
        queue.push(n);
      }
    }

    if (!visited.has(targetIdx)) return null;

    // Reconstruct path target -> start
    const path: number[] = [];
    let cur = targetIdx;
    path.push(cur);
    while (cur !== startIdx) {
      const p = prev.get(cur);
      if (p === undefined) return null; // safety
      cur = p;
      path.push(cur);
    }
    path.reverse();
    return path;
  }


  async addToken(room: Room, roomType: string, fIdx: number = -1, tIdx: number = -1) {
    if (!room.game || !this.isMyTurn(room)) return;
    const game: GameState = JSON.parse(JSON.stringify(room.game));
    if (roomType !== 'safe') {

        if (roomType === 'fingerprint' && game.hackFingerprint < 6) {
          if (await this.useActionPoint(game, 1))
          game.hackFingerprint += 1;
        } else if (roomType === 'motion' && game.hackMotion < 6) {
          if (await this.useActionPoint(game, 1))
          game.hackMotion += 1;
        } else if (roomType === 'laser' && game.hackLaser < 6) {
          if (await this.useActionPoint(game, 1))
          game.hackLaser += 1;
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

  triggerAlarm(game: GameState, roomType: 'Camera' | 'Laser' | 'Motion' | 'Fingerprint' | 'Thermo' | 'Scanner' | 'Thermal' | 'Dynamite' | "Chihuahua" | "Shoplifting" | "Juicer", fIdx: number, tIdx: number) {
    const guardIdx = game.guardPositions.findIndex(g => g.floor === fIdx);
    const guard = game.guardPositions[guardIdx];

    if (tIdx === guard.pos.y * 4 + guard.pos.x || game.floors[fIdx].alarms.includes(tIdx) || game.emp !== "") {
      return; // Ha az őr már ott van, ne csináljon semmit
    }

    let hackerOnTile = false
    for (let i = 0; i < Object.keys(game.playerPositions).length; i++) {
      if (game.playerPositions[game.playerOrder[i]].floor === fIdx && game.playerPositions[game.playerOrder[i]].tileIdx === tIdx && game.playerCharacter[game.playerOrder[i]] === "Hacker"){
        hackerOnTile = true}
    }

    if (roomType === 'Fingerprint' && !(game.playerCharacter[this.playerName] === "Hacker") && !hackerOnTile) {
      if (game.hackHacker > 0){
        game.hackHacker = 0
        return
      }

      if (game.hackFingerprint > 0){
        game.hackFingerprint -= 1;
      return}
      else {
        game.floors[fIdx].alarms.push(tIdx);
      }
    }
    if (roomType === 'Motion' && !(game.playerCharacter[this.playerName] === "Hacker") && !hackerOnTile) {
      if (game.hackHacker > 0){
        game.hackHacker = 0
        return
      }

      if (game.hackMotion > 0){
        game.hackMotion -= 1;return}
      else {
        game.floors[fIdx].alarms.push(tIdx);
      }
    }
    if (roomType === 'Laser' && !(game.playerCharacter[this.playerName] === "Hacker") && !hackerOnTile) {
      if (game.inventory[this.playerName].loot.indexOf("Mirror") !== -1)
        return

      if (game.hackHacker > 0){
        game.hackHacker = 0
        return
      }

      if (game.hackLaser > 0){
        game.hackLaser -= 1;return}
      else {
        game.floors[fIdx].alarms.push(tIdx);
      }
    }
    if ((roomType === 'Camera' && game.cameraloop === "") || roomType === 'Thermo' || roomType === 'Scanner' || roomType === "Thermal" || roomType === "Dynamite" || roomType === "Chihuahua" || roomType === "Shoplifting" || roomType === "Juicer") {
      game.floors[fIdx].alarms.push(tIdx);
    }

    this.checkClosestAlarm(game, guard, fIdx, guardIdx);

  }

  checkClosestAlarm(game: GameState, guard: GameState['guardPositions'][0], fIdx: number, guardIdx: number) {
    if (game.floors[fIdx].alarms.length === 0){return;}

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

  async crackSafe(room: Room, activeFloorIdx: number, tIdx: number, fixDices: number[] = []) {
    if(!room.game || (room.game.floors[activeFloorIdx].tiles[tIdx].tokens === 0 && fixDices.length === 0 ) || room.game.floors[activeFloorIdx].safeOpened) return;

    let keycardingame = false
    let playerwithkeycard = ""
    for (let i = 0; i < room.game.playerOrder.length; i++) {
      if (room.game.inventory[room.game.playerOrder[i]].loot.indexOf("Keycard") !== -1){
        keycardingame = true
        playerwithkeycard = room.game.playerOrder[i]
        break
      }
    }

    if(keycardingame){
      if(room.game.playerPositions[playerwithkeycard].floor !== activeFloorIdx || room.game.playerPositions[playerwithkeycard].tileIdx !== tIdx){
        return
      }
    }

    if (fixDices.length === 0)
      if(!await this.useActionPoint(room.game, 1)) return;

    if(fixDices.length ===   0)
      await this.rollDice(room.game.floors[activeFloorIdx].tiles[tIdx].tokens);
    else
      this.diceValues = fixDices

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
      room.game.floors[activeFloorIdx].safeOpened = true;
      await this.drawLoot(room.game, this.playerName)
    }

    await this.roomService.setGameState(this.roomId, room.game);
  }

  checkCameras(game: GameState, isGuard: boolean, pFloor: number, pTile: number) {
    if (!game) return;

    if (isGuard) {
      for (let i = 0; i < Object.keys(game.playerPositions).length; i++) {
        pFloor = game.playerPositions[game.playerOrder[i]].floor;
        pTile = game.playerPositions[game.playerOrder[i]].tileIdx;
        if (game.floors[pFloor].tiles[pTile].type === 'Camera') {
          this.triggerAlarm(game, "Camera", pFloor, pTile);
        }
      }
    } else {
      for (let i = 0; i < game.guardPositions.length; i++) {
        let gFloor = game.guardPositions[i].floor;
        let gTile = game.guardPositions[i].pos.y * 4 + game.guardPositions[i].pos.x;
        if (game.floors[gFloor].tiles[gTile].type === 'Camera') {
          this.triggerAlarm(game, "Camera", pFloor, pTile);
        }
      }
    }
  }


  protected generateHeatmap(tiles: Tile[]): number[] {
    if (!tiles || tiles.length !== 16) return [];

    const result: number[] = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];

    for (let start = 0; start < 16; start++) {
      let distances = this.bfsDistanceFrom(start, tiles);

      for (let i = 0; i < distances.length; i++) {
        if (distances[i] !== Infinity && distances[i] > 0) {
          result[i] += 1 / distances[i];
        }
      }
    }
    let maxheat = Math.max(...result);
    let minheat = Math.min(...result);

    for (let i = 0; i < result.length; i++) {
      result[i] = (result[i] - minheat) / (maxheat - minheat);
    }
    return result;
  }


  protected bfsDistanceFrom(startIdx: number, tiles: Tile[]): number[] {
    const distances = new Array(16).fill(Infinity);
    distances[startIdx] = 0;

    const queue: number[] = [startIdx];

    while (queue.length) {
      const idx = queue.shift()!;
      const x = idx % 4;
      const y = Math.floor(idx / 4);

      const neighbors = [];

      // Fent
      if (y > 0 && !tiles[idx].walls.top && !tiles[idx - 4].walls.bottom) {
        neighbors.push(idx - 4);
      }
      // Lent
      if (y < 3 && !tiles[idx].walls.bottom && !tiles[idx + 4].walls.top) {
        neighbors.push(idx + 4);
      }
      // Bal
      if (x > 0 && !tiles[idx].walls.left && !tiles[idx - 1].walls.right) {
        neighbors.push(idx - 1);
      }
      // Jobb
      if (x < 3 && !tiles[idx].walls.right && !tiles[idx + 1].walls.left) {
        neighbors.push(idx + 1);
      }

      for (const n of neighbors) {
        if (distances[n] === Infinity) {
          distances[n] = distances[idx] + 1;
          queue.push(n);
        }
      }
    }

    return distances;
  }


  colorFromT(t: number): string {
    const r = Math.floor(255 * t);        // 0→0, 1→255
    const b = Math.floor(255 * (1 - t));  // 0→255, 1→0
    return `rgb(${r}, 0, ${b})`;
  }

  async drawTool(game: GameState, player: string){
    if (!game) return;

    game.inventory[player].tool.push(game.tools[0])
    game.tools = game.tools.splice(1);

    if(game.tools.length === 0){
      game.tools = this.shuffle([...toolsList])
    }
    await this.roomService.setGameState(this.roomId, game);
  }

  async drawLoot(game: GameState, player: string){
    if (!game) return;

    game.inventory[player].loot.push(game.loots[0])

    if (game.loots[0] === "Goblet"){
      game.healths[player] = (game.healths[player] || 1) - 1;
    }
    if (game.loots[0] === "Gold"){
      game.floors[game.playerPositions[player].floor].tiles[game.playerPositions[player].tileIdx].gold = true
    }

    game.loots = game.loots.splice(1);

    if(game.loots.length === 0){
      game.loots = this.shuffle([...lootList])
    }
    await this.roomService.setGameState(this.roomId, game);
  }

  espresso = 0
  headsup = 0
  jumpthegun = 0
  shiftchange = 0
  async drawEvent(game: GameState){
    if (!game) return;

    let eventName = game.events[0]
    game.events = game.events.splice(1);

    if(game.events.length === 0){
      game.events = this.shuffle([...eventList])
    }

    await this.askEventAcknowledge(eventName)

    if (eventName === "Espresso"){
      this.espresso = 1
    }
    if (eventName === "DayDreaming"){
      this.espresso = -1
    }
    if (eventName === "Reboot"){
      game.hackLaser = 1
      game.hackFingerprint = 1
      game.hackMotion = 1
    }
    if (eventName === "DeadDrop"){
      let rightPlayerIndex = (game.currentPlayerIdx - 1) < 0 ? game.playerOrder.length - 1 : (game.currentPlayerIdx - 1)
      let rightplayerName = game.playerOrder[rightPlayerIndex]

      game.inventory[rightplayerName].loot.push(...game.inventory[this.playerName].loot)
      game.inventory[this.playerName].loot = []
      game.inventory[rightplayerName].tool.push(...game.inventory[this.playerName].tool)
      game.inventory[this.playerName].tool = []
    }
    if (eventName === "BrownOut"){
      for (let i = 0; i < this.floorCount; i++) {
      if (game.floors[i].alarms.length < game.guardPositions[i].moves.length){
        game.guardPositions[i].moves = game.guardPositions[i].moves.slice(Math.min(0,game.floors[i].alarms.length - 1))
      } else {
        let toberemoved = game.floors[i].alarms.length - game.guardPositions[i].moves.length
        this.generateNewGuardTargets(game.guardPositions[i])
        game.guardPositions[i].moves = game.guardPositions[i].moves.slice(toberemoved)
      }
        game.floors[i].alarms = []
      }


    }
    if (eventName === "Shoplifting"){
      for (let i = 0; i < this.floorCount; i++) {
        for (let j = 0; j < 16; j++) {
          if (game.floors[i].tiles[j].type === "Laboratory" && game.floors[i].tiles[j].empty)
            this.triggerAlarm(game, "Shoplifting", i, j)
        }
      }
    }

    if (eventName === "TimeLock") {
      game.timelock = this.playerName
    }
    if (eventName === "ChangeOfPlans") {
      if(game.floors[game.playerPositions[this.playerName].floor].alarms.length === 0){
        game.guardPositions[game.playerPositions[this.playerName].floor].target = game.guardPositions[game.playerPositions[this.playerName].floor].moves[0]
        game.guardPositions[game.playerPositions[this.playerName].floor].moves = game.guardPositions[game.playerPositions[this.playerName].floor].moves.slice(1)
        if(game.guardPositions[game.playerPositions[this.playerName].floor].moves.length === 0){
          this.generateNewGuardTargets(game.guardPositions[game.playerPositions[this.playerName].floor])
        }
      }
    }
    if (eventName === "HeadsUp") {
      this.headsup = 1;
    }
    if (eventName === "VideoLoop") {
      game.cameraloop = this.playerName
    }
    if (eventName === "JumpTheGun") {
      this.jumpthegun = 1
    }
    if (eventName === "Jury-rig") {
      await this.drawTool(game,this.playerName)
    }
    if (eventName === "FreightElevator") {
      game.playerPositions[this.playerName].floor = Math.min(this.floorCount - 1, game.playerPositions[this.playerName].floor + 1)
      game.floors[game.playerPositions[this.playerName].floor].tiles[game.playerPositions[this.playerName].tileIdx].revealed = true
    }
    if (eventName === "WhereIsHe") {
      game.guardPositions[game.playerPositions[this.playerName].floor].pos = game.guardPositions[game.playerPositions[this.playerName].floor].target
      game.guardPositions[game.playerPositions[this.playerName].floor].target = game.guardPositions[game.playerPositions[this.playerName].floor].moves[0]
      game.guardPositions[game.playerPositions[this.playerName].floor].moves = game.guardPositions[game.playerPositions[this.playerName].floor].moves.slice(1)
      if(game.guardPositions[game.playerPositions[this.playerName].floor].moves.length === 0){
        this.generateNewGuardTargets(game.guardPositions[game.playerPositions[this.playerName].floor])
      }
    }
    if (eventName === "LostGrip") {
      game.playerPositions[this.playerName].floor = Math.max(0, game.playerPositions[this.playerName].floor - 1)
      game.floors[game.playerPositions[this.playerName].floor].tiles[game.playerPositions[this.playerName].tileIdx].revealed = true
    }
    if (eventName === "SwitchSigns") {
      let oldtarget = game.guardPositions[game.playerPositions[this.playerName].floor].pos
      game.guardPositions[game.playerPositions[this.playerName].floor].pos = game.guardPositions[game.playerPositions[this.playerName].floor].target
      game.guardPositions[game.playerPositions[this.playerName].floor].target = oldtarget
    }
    if (eventName === "Lampshade") {
      game.healths[this.playerName] = Math.min(3, game.healths[this.playerName] + 1)
    }
    if (eventName === "Crash") {
      if(game.floors[game.playerPositions[this.playerName].floor].alarms.length === 0){
        game.guardPositions[game.playerPositions[this.playerName].floor].target = {x: game.playerPositions[this.playerName].tileIdx % 4, y: Math.floor(game.playerPositions[this.playerName].tileIdx / 4)}
      }
    }
    if (eventName === "KeycodeChange") {
      for (let i = 0; i < game.keypads.length; i++) {
        game.keypads[i].opened = false
      }
    }
    if (eventName === "ShiftChange") {
      this.shiftchange = 1
      this.animatation = true
      if(game.playerPositions[this.playerName].floor !== 0)
        await this.moveGuardWithDelay(game, 0)
      if(game.playerPositions[this.playerName].floor !== 1)
        await this.moveGuardWithDelay(game, 1)
      if(game.playerPositions[this.playerName].floor !== 2 && this.floorCount === 3)
        await this.moveGuardWithDelay(game, 2)
      this.animatation = false
    }
    if (eventName === "ThrowVoice") {

      const dialog = document.getElementById("choiceDialog") as HTMLDialogElement;
      const choice1 = document.getElementById("choice-1") as HTMLDialogElement;
      const choice2 = document.getElementById("choice-2") as HTMLDialogElement;
      const choice3 = document.getElementById("choice-3") as HTMLDialogElement;
      const choice4 = document.getElementById("choice-4") as HTMLDialogElement;
      const closebtn = document.getElementById("choice-cancel") as HTMLDialogElement

      let playerFloor = game.playerPositions[this.playerName].floor
      if (game.floors[playerFloor].alarms.length === 0){
      let guardIdx = game.guardPositions[playerFloor].pos.y * 4 + game.guardPositions[playerFloor].pos.x

      if (!game.floors[playerFloor].tiles[guardIdx].walls.top)
        choice1.innerText = "Up"
      else
        choice1.hidden = true
      if (!game.floors[playerFloor].tiles[guardIdx].walls.right)
          choice2.innerText = "Right"
      else
        choice2.hidden = true
      if (!game.floors[playerFloor].tiles[guardIdx].walls.bottom)
          choice3.innerText = "Down"
      else
        choice3.hidden = true
      if (!game.floors[playerFloor].tiles[guardIdx].walls.left){
          choice4.innerText = "Left"
          choice4.hidden = false}
      else
        choice4.hidden = true

        closebtn.hidden = true

      this.animatation = true

        dialog.addEventListener("cancel", (e) => e.preventDefault(), { once: true });
        dialog.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
          }
        });
        dialog.showModal();
        const choice = await new Promise<string>((resolve) => {
          dialog.addEventListener("close", () => resolve(dialog.returnValue), { once: true });
        });

        if (choice === "1") {
          game.guardPositions[playerFloor].pos.y -= 1
        }
        if (choice === "2") {
          game.guardPositions[playerFloor].pos.x += 1
        }
        if (choice === "3") {
          game.guardPositions[playerFloor].pos.y += 1
        }
        if (choice === "4") {
          game.guardPositions[playerFloor].pos.x -= 1
        }

        this.animatation = false;
        choice1.hidden = false
        choice2.hidden = false
        choice3.hidden = false
        choice4.hidden = true
        closebtn.hidden = false

        await this.roomService.setGameState(this.roomId, game);
      }
    }
    if (eventName === "Peekhole") {
      const dialog = document.getElementById("choiceDialog") as HTMLDialogElement;
      const choice1 = document.getElementById("choice-1") as HTMLDialogElement;
      const choice2 = document.getElementById("choice-2") as HTMLDialogElement;
      const choice3 = document.getElementById("choice-3") as HTMLDialogElement;
      const choice4 = document.getElementById("choice-4") as HTMLDialogElement;
      const choice5 = document.getElementById("choice-5") as HTMLDialogElement;
      const choice6 = document.getElementById("choice-6") as HTMLDialogElement;
      const closebtn = document.getElementById("choice-cancel") as HTMLDialogElement

        if (game.playerPositions[this.playerName].tileIdx > 3 && !game.floors[game.playerPositions[this.playerName].floor].tiles[game.playerPositions[this.playerName].tileIdx - 4].revealed)
          choice1.innerText = "Up"
        else
          choice1.hidden = true
        if (game.playerPositions[this.playerName].tileIdx % 4 !== 3 && !game.floors[game.playerPositions[this.playerName].floor].tiles[game.playerPositions[this.playerName].tileIdx + 1].revealed)
          choice2.innerText = "Right"
        else
          choice2.hidden = true
        if (game.playerPositions[this.playerName].tileIdx < 12 && !game.floors[game.playerPositions[this.playerName].floor].tiles[game.playerPositions[this.playerName].tileIdx + 4].revealed)
          choice3.innerText = "Down"
        else
          choice3.hidden = true
        if (game.playerPositions[this.playerName].tileIdx % 4 !== 0 && !game.floors[game.playerPositions[this.playerName].floor].tiles[game.playerPositions[this.playerName].tileIdx - 1].revealed){
          choice4.innerText = "Left"
          choice4.hidden = false}
        else
          choice4.hidden = true
      if (game.playerPositions[this.playerName].floor < (this.floorCount - 1) && !game.floors[game.playerPositions[this.playerName].floor + 1].tiles[game.playerPositions[this.playerName].tileIdx].revealed)
      {choice5.hidden = false
        choice5.innerText = "Upstairs"}
      else
        choice5.hidden = true
      if (game.playerPositions[this.playerName].floor > 0 && !game.floors[game.playerPositions[this.playerName].floor - 1].tiles[game.playerPositions[this.playerName].tileIdx].revealed)
      {choice6.hidden = false
        choice6.innerText = "Downstairs"}
      else
        choice6.hidden = true

      closebtn.hidden = true

      this.animatation = true

      dialog.addEventListener("cancel", (e) => e.preventDefault(), {});
      dialog.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
        }
      });
      dialog.showModal();
      const choice = await new Promise<string>((resolve) => {
        dialog.addEventListener("close", () => resolve(dialog.returnValue), { once: true });
      });

      if (choice === "1") {
        game.floors[game.playerPositions[this.playerName].floor].tiles[game.playerPositions[this.playerName].tileIdx - 4].revealed = true
      }
      if (choice === "2") {
        game.floors[game.playerPositions[this.playerName].floor].tiles[game.playerPositions[this.playerName].tileIdx + 1].revealed = true
      }
      if (choice === "3") {
        game.floors[game.playerPositions[this.playerName].floor].tiles[game.playerPositions[this.playerName].tileIdx + 4].revealed = true
      }
      if (choice === "4") {
        game.floors[game.playerPositions[this.playerName].floor].tiles[game.playerPositions[this.playerName].tileIdx - 1].revealed = true
      }
      if (choice === "5") {
        game.floors[game.playerPositions[this.playerName].floor + 1].tiles[game.playerPositions[this.playerName].tileIdx].revealed = true
      }
      if (choice === "6") {
        game.floors[game.playerPositions[this.playerName].floor - 1].tiles[game.playerPositions[this.playerName].tileIdx].revealed = true
      }

      this.animatation = false;
      choice1.hidden = false
      choice2.hidden = false
      choice3.hidden = false
      choice4.hidden = true
      choice5.hidden = true
      choice6.hidden = true
      closebtn.hidden = false


      await this.roomService.setGameState(this.roomId, game);
    }
    if (eventName === "GoWithYourGut") {

      const dialog = document.getElementById("choiceDialog") as HTMLDialogElement;
      const choice1 = document.getElementById("choice-1") as HTMLDialogElement;
      const choice2 = document.getElementById("choice-2") as HTMLDialogElement;
      const choice3 = document.getElementById("choice-3") as HTMLDialogElement;
      const choice4 = document.getElementById("choice-4") as HTMLDialogElement;
      const closebtn = document.getElementById("choice-cancel") as HTMLDialogElement


      if (game.playerPositions[this.playerName].tileIdx > 3 && !game.floors[game.playerPositions[this.playerName].floor].tiles[game.playerPositions[this.playerName].tileIdx - 4].revealed)
        choice1.innerText = "Up"
      else
        choice1.hidden = true
      if (game.playerPositions[this.playerName].tileIdx % 4 !== 3 && !game.floors[game.playerPositions[this.playerName].floor].tiles[game.playerPositions[this.playerName].tileIdx + 1].revealed)
        choice2.innerText = "Right"
      else
        choice2.hidden = true
      if (game.playerPositions[this.playerName].tileIdx < 12 && !game.floors[game.playerPositions[this.playerName].floor].tiles[game.playerPositions[this.playerName].tileIdx + 4].revealed)
        choice3.innerText = "Down"
      else
        choice3.hidden = true
      if (game.playerPositions[this.playerName].tileIdx % 4 !== 0 && !game.floors[game.playerPositions[this.playerName].floor].tiles[game.playerPositions[this.playerName].tileIdx - 1].revealed){
        choice4.innerText = "Left"
        choice4.hidden = false}
      else
        choice4.hidden = true

      closebtn.hidden = true

      this.animatation = true

      if (!choice1.hidden || !choice2.hidden || !choice3.hidden || !choice4.hidden){
        dialog.addEventListener("cancel", (e) => e.preventDefault(), { once: true });
        dialog.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') {event.preventDefault();}});
        dialog.showModal();
        const choice = await new Promise<string>((resolve) => {
          dialog.addEventListener("close", () => resolve(dialog.returnValue), { once: true });
        });

        if (choice === "1") {
          game.playerPositions[this.playerName].tileIdx -= 4
        }
        if (choice === "2") {
          game.playerPositions[this.playerName].tileIdx += 1
        }
        if (choice === "3") {
          game.playerPositions[this.playerName].tileIdx += 4
        }
        if (choice === "4") {
          game.playerPositions[this.playerName].tileIdx -= 1
        }
        game.floors[game.playerPositions[this.playerName].floor].tiles[game.playerPositions[this.playerName].tileIdx].revealed = true
      }

      this.animatation = false;
      choice1.hidden = false
      choice2.hidden = false
      choice3.hidden = false
      choice4.hidden = true
      closebtn.hidden = false

      await this.roomService.setGameState(this.roomId, game);

    }
    if (eventName === "BuddySystem") {

      const dialog = document.getElementById("choiceDialog") as HTMLDialogElement;

      const choice1 = document.getElementById("choice-1") as HTMLButtonElement;
      const choice2 = document.getElementById("choice-2") as HTMLButtonElement;
      const choice3 = document.getElementById("choice-3") as HTMLButtonElement;
      const choice4 = document.getElementById("choice-4") as HTMLButtonElement;
      const cancelBtn = document.getElementById("choice-cancel") as HTMLButtonElement;

      const select = document.getElementById("choice-select") as HTMLSelectElement | null;

      if (!select) {
        console.warn("choice-select nincs a DOM-ban.");
      } else {
        // 1) eligible játékosok (akiknek van pozíciójuk, és nem te vagy)
        const myPos = game.playerPositions?.[this.playerName];
        if (!myPos) return;

        const eligible = game.playerOrder
          .filter(p => p !== this.playerName)
          .filter(p => game.playerPositions?.[p] !== undefined);

        if (eligible.length === 0) {
          // nincs kit mozgatni
          return;
        }

        // 2) dropdown feltöltése
        select.innerHTML = "";
        for (const p of eligible) {
          const opt = document.createElement("option");
          opt.value = p;
          opt.textContent = p;
          select.appendChild(opt);
        }
        select.hidden = false;

        choice1.hidden = false;
        choice1.textContent = "OK";
        choice2.hidden = true;
        choice3.hidden = true;
        choice4.hidden = true;
        cancelBtn.hidden = true;

        // 4) lock + kötelező választás (ESC ne zárja)
        this.animatation = true;
        dialog.addEventListener("cancel", (e) => e.preventDefault(), { once: true });
        dialog.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') {event.preventDefault();}});
        dialog.showModal();
        await new Promise<void>((resolve) => {
          dialog.addEventListener("close", () => resolve(), { once: true });
        });

        // 5) kiválasztott player
        const pickedPlayer = select.value;

        const f = myPos.floor;
        const t = myPos.tileIdx;

        game.playerPositions[pickedPlayer] = { floor: f, tileIdx: t };

        // 7) cleanup: állíts vissza mindent
        this.animatation = false;

        select.hidden = true;
        select.innerHTML = "";

        choice1.hidden = false;
        choice2.hidden = false;
        choice3.hidden = false;
        choice4.hidden = true;
        cancelBtn.hidden = false;
      }

        }
    if (eventName === "Squeak") {

      const myPos = game.playerPositions?.[this.playerName];
      if (!myPos) return;

      const floorIdx = myPos.floor;
      const floor = game.floors[floorIdx];
      const guard = game.guardPositions.find(g => g.floor === floorIdx);
      if (!guard) return;

      const startIdx = guard.pos.y * 4 + guard.pos.x;

      // játékosok ezen a szinten
      const playersOnFloor = Object.entries(game.playerPositions)
        .filter(([, pos]) => pos.floor === floorIdx)
        .map(([name, pos]) => ({ name, tileIdx: pos.tileIdx }));

      if (playersOnFloor.length === 0) return;

      // legközelebbi játékos keresése BFS path hosszal
      let bestPath: number[] | null = null;

      for (const p of playersOnFloor) {
        const pPath = this.shortestPathLikeGuard(floor.tiles, startIdx, p.tileIdx);
        if (!pPath) continue;
        if (!bestPath || pPath.length < bestPath.length) bestPath = pPath;
      }

      if (!bestPath || bestPath.length < 2) return;

      const nextIdx = bestPath[1];

      // 1 lépés
      guard.pos = { x: nextIdx % 4, y: Math.floor(nextIdx / 4) };

      // ha játékoson landol: stealthtoken csökkent vagy sebzés (egyszerűsített)
      for (const [pName, pPos] of Object.entries(game.playerPositions)) {
        if (pPos.floor === floorIdx && pPos.tileIdx === nextIdx) {
          if (floor.tiles[nextIdx].stealthtoken > 0) {
            floor.tiles[nextIdx].stealthtoken--;
          } else {
            game.healths[pName] = (game.healths[pName] ?? 0) - 1;
          }
          this.alreadyDamaged.push(pName)
        }
      }
    }
    if (eventName === "Gymnastics") {
      game.gymnastics = this.playerName;
    }

    await this.roomService.setGameState(this.roomId, game);
  }

  // --- Event modal state ---
  showEventDialog = false;
  currentEventName: string | null = null;

  private eventDialogResolver: (() => void) | null = null;

  private askEventAcknowledge(eventName: string): Promise<void> {
    this.currentEventName = eventName;
    this.showEventDialog = true;
    this.animatation = true;
    this.cdr.detectChanges();

    return new Promise(resolve => {
      this.eventDialogResolver = resolve;
    });
  }

  confirmEventDialog() {
    if (!this.eventDialogResolver) return;

    this.showEventDialog = false;
    this.animatation = false;
    this.currentEventName = null;

    this.eventDialogResolver();
    this.eventDialogResolver = null;
  }

  protected readonly Math = Math;

  isInvisible = false
  protected async toolClick(room: Room, tool: string) {
    if (!room.game) return;
    if (this.needsCharacter(room)) return;
    if (this.isSpectator(room) || !this.isMyTurn(room) || room.game.inventory[this.playerName].loot.indexOf("Bust") !== -1) return
    const ok = confirm(`Biztos elhasználod: ${tool}?`);
    if (!ok) return;

    const game = room.game;

    if (tool === "Makeup"){
      for (let i = 0; i < Object.keys(game.playerPositions).length; i++) {
        if (game.playerPositions[game.playerOrder[i]].floor === game.playerPositions[this.playerName].floor && game.playerPositions[game.playerOrder[i]].tileIdx === game.playerPositions[this.playerName].tileIdx){
          game.healths[game.playerOrder[i]] = Math.min(game.healths[game.playerOrder[i]] + 1, 3)
        }
      }
      game.inventory[this.playerName].tool.splice(game.inventory[this.playerName].tool.indexOf(tool), 1)

      await this.roomService.setGameState(this.roomId, room.game);
    }

    if (tool === "Virus") {
      const dialog = document.getElementById("choiceDialog") as HTMLDialogElement;
      const choice1 = document.getElementById("choice-1") as HTMLDialogElement;
      const choice2 = document.getElementById("choice-2") as HTMLDialogElement;
      const choice3 = document.getElementById("choice-3") as HTMLDialogElement;

      for (let i = 0; i < this.floorCount; i++) {
        for (let j = 0; j < 16; j++) {
          if (game.floors[i].tiles[j].type === "ComputerMotion"){
            choice1.hidden = !game.floors[i].tiles[j].revealed
          }
          if (game.floors[i].tiles[j].type === "ComputerLaser"){
            choice2.hidden = !game.floors[i].tiles[j].revealed
          }
          if (game.floors[i].tiles[j].type === "ComputerFingerprint"){
            choice3.hidden = !game.floors[i].tiles[j].revealed
          }
        }
      }

      choice1.innerText = "Motion"
      choice2.innerText = "Laser"
      choice3.innerText = "Fingerprint"
      this.animatation = true
      dialog.addEventListener("cancel", (e) => e.preventDefault(), { once: true });
      dialog.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {event.preventDefault();}});
      dialog.showModal();

      dialog.onclose = async () => {
        if (dialog.returnValue === "1") {game.hackMotion = Math.min(6,game.hackMotion + 3)}
        if (dialog.returnValue === "2") {game.hackLaser = Math.min(6,game.hackLaser + 3)}
        if (dialog.returnValue === "3") {game.hackFingerprint = Math.min(6,game.hackFingerprint + 3)}

        this.animatation = false;
        choice1.hidden = false
        choice2.hidden = false
        choice3.hidden = false


        if (dialog.returnValue !== "Cancel") {game.inventory[this.playerName].tool.splice(game.inventory[this.playerName].tool.indexOf(tool), 1)}
        if (room.game)
        await this.roomService.setGameState(this.roomId, room.game);
      };
    }

    if (tool === "Smoke") {
      const playerPosition = game.playerPositions[this.playerName]
      game.floors[playerPosition.floor].tiles[playerPosition.tileIdx].stealthtoken += 3

      game.inventory[this.playerName].tool.splice(game.inventory[this.playerName].tool.indexOf(tool), 1)
      await this.roomService.setGameState(this.roomId, room.game);
    }

    if (tool === "EMP") {
      game.emp = this.playerName

      for (let i = 0; i < this.floorCount; i++) {
        game.floors[i].alarms = []
      }

      game.inventory[this.playerName].tool.splice(game.inventory[this.playerName].tool.indexOf(tool), 1)
      await this.roomService.setGameState(this.roomId, room.game);
    }

    if (tool === 'Blueprint') {
      const { fIdx, tIdx } = await this.askBlueprintTarget(room);

      game.floors[fIdx].tiles[tIdx].revealed = true;

      this.activeFloorIdx = fIdx;

      const invTools = game.inventory[this.playerName].tool;
      invTools.splice(invTools.indexOf(tool), 1);

      await this.roomService.setGameState(this.roomId, game);
      return;
    }

    if (tool === "Invisible") {
      this.isInvisible = true
      game.currentAP += 1

      game.inventory[this.playerName].tool.splice(game.inventory[this.playerName].tool.indexOf(tool), 1)
      await this.roomService.setGameState(this.roomId, room.game);
    }

    if (tool === "Thermal") {
      if (game.playerPositions[this.playerName].floor === 0){
        game.floors[game.playerPositions[this.playerName].floor].tiles[game.playerPositions[this.playerName].tileIdx].thermalStairsUp = true
        this.triggerAlarm(game, "Thermal",game.playerPositions[this.playerName].floor, game.playerPositions[this.playerName].tileIdx)
        game.inventory[this.playerName].tool.splice(game.inventory[this.playerName].tool.indexOf(tool), 1)
        await this.roomService.setGameState(this.roomId, room.game);
      }
      else if (game.playerPositions[this.playerName].floor === this.floorCount - 1){
        game.floors[game.playerPositions[this.playerName].floor].tiles[game.playerPositions[this.playerName].tileIdx].thermalStairsDown = true
        this.triggerAlarm(game, "Thermal",game.playerPositions[this.playerName].floor, game.playerPositions[this.playerName].tileIdx)
        game.inventory[this.playerName].tool.splice(game.inventory[this.playerName].tool.indexOf(tool), 1)
        await this.roomService.setGameState(this.roomId, room.game);
      } else {
        const dialog = document.getElementById("choiceDialog") as HTMLDialogElement;
        const choice1 = document.getElementById("choice-1") as HTMLDialogElement;
        const choice2 = document.getElementById("choice-2") as HTMLDialogElement;
        const choice3 = document.getElementById("choice-3") as HTMLDialogElement;

        choice1.innerText = "Fel"
        choice2.innerText = "Le"
        choice3.hidden = true
        this.animatation = true
        dialog.addEventListener("cancel", (e) => e.preventDefault(), { once: true });
        dialog.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') {event.preventDefault();}});
        dialog.showModal();

        dialog.onclose = async () => {
          if (dialog.returnValue === "1") {
            this.triggerAlarm(game, "Thermal",game.playerPositions[this.playerName].floor, game.playerPositions[this.playerName].tileIdx)
            game.floors[game.playerPositions[this.playerName].floor].tiles[game.playerPositions[this.playerName].tileIdx].thermalStairsUp = true}
          if (dialog.returnValue === "2") {
            this.triggerAlarm(game, "Thermal",game.playerPositions[this.playerName].floor, game.playerPositions[this.playerName].tileIdx)
            game.floors[game.playerPositions[this.playerName].floor].tiles[game.playerPositions[this.playerName].tileIdx].thermalStairsDown = true}

          this.animatation = false;
          choice1.hidden = false
          choice2.hidden = false
          choice3.hidden = false

          if (dialog.returnValue !== "Cancel") {game.inventory[this.playerName].tool.splice(game.inventory[this.playerName].tool.indexOf(tool), 1)}
          if (room.game)
            await this.roomService.setGameState(this.roomId, room.game);
        };
      }
    }

    if (tool === "Roller") {
      game.currentAP += 2


      game.inventory[this.playerName].tool.splice(game.inventory[this.playerName].tool.indexOf(tool), 1)
      await this.roomService.setGameState(this.roomId, room.game);
    }

    if (tool === "Donut") {
      const dialog = document.getElementById("choiceDialog") as HTMLDialogElement;
      const choice1 = document.getElementById("choice-1") as HTMLDialogElement;
      const choice2 = document.getElementById("choice-2") as HTMLDialogElement;
      const choice3 = document.getElementById("choice-3") as HTMLDialogElement;

      choice1.innerText = "1. Szint"
      choice2.innerText = "2. Szint"
      if (this.floorCount === 3)
        choice3.innerText = "3. Szint"
      else
        choice3.hidden = true
      this.animatation = true
      dialog.addEventListener("cancel", (e) => e.preventDefault(), { once: true });
      dialog.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {event.preventDefault();}});
      dialog.showModal();

      dialog.onclose = async () => {
        if (dialog.returnValue === "1") {
          game.guardPositions[0].donut = true
        }
        if (dialog.returnValue === "2") {
          game.guardPositions[1].donut = true
        }
        if (dialog.returnValue === "3") {
          game.guardPositions[2].donut = true
        }

        this.animatation = false;
        choice1.hidden = false
        choice2.hidden = false
        choice3.hidden = false

        if (dialog.returnValue !== "Cancel") {game.inventory[this.playerName].tool.splice(game.inventory[this.playerName].tool.indexOf(tool), 1)}
        if (room.game)
          await this.roomService.setGameState(this.roomId, room.game);
      };
    }

    if (tool === "Dynamite") {
      let walls = []
      let playerFloor = game.playerPositions[this.playerName].floor
      let playerIdx = game.playerPositions[this.playerName].tileIdx
      if (game.floors[playerFloor].tiles[playerIdx].walls.top && playerIdx > 3)
        walls.push("Top")
      if (game.floors[playerFloor].tiles[playerIdx].walls.right && playerIdx % 4 !== 3)
        walls.push("Right")
      if (game.floors[playerFloor].tiles[playerIdx].walls.bottom && playerIdx < 12)
        walls.push("Bottom")
      if (game.floors[playerFloor].tiles[playerIdx].walls.left && playerIdx % 4 !== 0)
        walls.push("Left")

      if (walls.length === 0)
        return

      const dialog = document.getElementById("choiceDialog") as HTMLDialogElement;
      const choice1 = document.getElementById("choice-1") as HTMLDialogElement;
      const choice2 = document.getElementById("choice-2") as HTMLDialogElement;
      const choice3 = document.getElementById("choice-3") as HTMLDialogElement;

      if (walls.length > 0)
        choice1.innerText = walls[0]
      if (walls.length > 1)
        choice2.innerText = walls[1]
      else
        choice2.hidden = true
      if (walls.length > 2)
        choice3.innerText = walls[2]
      else
        choice3.hidden = true
      this.animatation = true
      dialog.addEventListener("cancel", (e) => e.preventDefault(), { once: true });
      dialog.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {event.preventDefault();}});
      dialog.showModal();

      dialog.onclose = async () => {
        let idx = -1
        if (dialog.returnValue === "1") {
          idx = 0
        }
        if (dialog.returnValue === "2") {
          idx = 1
        }
        if (dialog.returnValue === "3") {
          idx = 2
        }
        if (dialog.returnValue === "Cancel") {
          this.animatation = false;
          choice1.hidden = false
          choice2.hidden = false
          choice3.hidden = false
          return
        }

        if (walls[idx] === "Top"){
          game.floors[playerFloor].tiles[playerIdx].walls.top = false
          game.floors[playerFloor].tiles[playerIdx - 4].walls.bottom = false
        }
        if (walls[idx] === "Bottom"){
          game.floors[playerFloor].tiles[playerIdx].walls.bottom = false
          game.floors[playerFloor].tiles[playerIdx + 4].walls.top = false
        }
        if (walls[idx] === "Right"){
          game.floors[playerFloor].tiles[playerIdx].walls.right = false
          game.floors[playerFloor].tiles[playerIdx + 1].walls.left = false
        }
        if (walls[idx] === "Left"){
          game.floors[playerFloor].tiles[playerIdx].walls.left = false
          game.floors[playerFloor].tiles[playerIdx - 1].walls.right = false
        }

        this.triggerAlarm(game, "Dynamite", playerFloor, playerIdx)

        this.animatation = false;
        choice1.hidden = false
        choice2.hidden = false
        choice3.hidden = false

        if (dialog.returnValue !== "Cancel") {game.inventory[this.playerName].tool.splice(game.inventory[this.playerName].tool.indexOf(tool), 1)}
        if (room.game)
          await this.roomService.setGameState(this.roomId, room.game);
      };
    }

    if (tool === "Crowbar") {
      const dialog = document.getElementById("choiceDialog") as HTMLDialogElement;
      const choice1 = document.getElementById("choice-1") as HTMLDialogElement;
      const choice2 = document.getElementById("choice-2") as HTMLDialogElement;
      const choice3 = document.getElementById("choice-3") as HTMLDialogElement;
      const choice4 = document.getElementById("choice-4") as HTMLDialogElement;

      let playerFloor = game.playerPositions[this.playerName].floor
      let playerIdx = game.playerPositions[this.playerName].tileIdx

      if (playerIdx > 3 && ['Safe', 'Stairs', 'Laboratory', 'Toilet', 'SecretDoor', 'ServiceDuct', 'ComputerLaser', 'ComputerFingerprint', 'ComputerMotion', 'Disabled'].indexOf(game.floors[playerFloor].tiles[playerIdx - 4].type) === -1)
        choice1.innerText = "Up"
      else
        choice1.hidden = true
      if (playerIdx % 4 !== 3 && ['Safe', 'Stairs', 'Laboratory', 'Toilet', 'SecretDoor', 'ServiceDuct', 'ComputerLaser', 'ComputerFingerprint', 'ComputerMotion', 'Disabled'].indexOf(game.floors[playerFloor].tiles[playerIdx + 1].type) === -1)
        choice2.innerText = "Right"
      else
        choice2.hidden = true
      if (playerIdx < 12 && ['Safe', 'Stairs', 'Laboratory', 'Toilet', 'SecretDoor', 'ServiceDuct', 'ComputerLaser', 'ComputerFingerprint', 'ComputerMotion', 'Disabled'].indexOf(game.floors[playerFloor].tiles[playerIdx + 4].type) === -1)
        choice3.innerText = "Down"
      else
        choice3.hidden = true
      if (playerIdx % 4 !== 0 && ['Safe', 'Stairs', 'Laboratory', 'Toilet', 'SecretDoor', 'ServiceDuct', 'ComputerLaser', 'ComputerFingerprint', 'ComputerMotion', 'Disabled'].indexOf(game.floors[playerFloor].tiles[playerIdx - 1].type) === -1)
        {choice4.innerText = "Left"
        choice4.hidden = false}
      else
        choice4.hidden = true


      this.animatation = true
      dialog.addEventListener("cancel", (e) => e.preventDefault(), { once: true });
      dialog.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {event.preventDefault();}});
      dialog.showModal();

      dialog.onclose = async () => {
        if (dialog.returnValue === "1") {
          game.floors[playerFloor].tiles[playerIdx - 4].type = 'Disabled'
        }
        if (dialog.returnValue === "2") {
          game.floors[playerFloor].tiles[playerIdx + 1].type = 'Disabled'
        }
        if (dialog.returnValue === "3") {
          game.floors[playerFloor].tiles[playerIdx + 4].type = 'Disabled'
        }
        if (dialog.returnValue === "4") {
          game.floors[playerFloor].tiles[playerIdx - 1].type = 'Disabled'
        }

        this.animatation = false;
        choice1.hidden = false
        choice2.hidden = false
        choice3.hidden = false
        choice4.hidden = true

        if (dialog.returnValue !== "Cancel") {game.inventory[this.playerName].tool.splice(game.inventory[this.playerName].tool.indexOf(tool), 1)}
        if (room.game)
          await this.roomService.setGameState(this.roomId, room.game);
      };
    }

    if (tool === "Stethoscope") {
      let playerFloor = game.playerPositions[this.playerName].floor
      let playerIdx = game.playerPositions[this.playerName].tileIdx
      if (game.floors[playerFloor].tiles[playerIdx].type !== "Safe")
        return

      const row = Math.floor(playerIdx / 4)
      const col = playerIdx % 4;

      let cracks: any = new Set<number>();

      for (let c = 0; c < 4; c++) {
        if (row * 4 + c === playerIdx) continue;
        if (!room.game.floors[playerFloor].tiles[row * 4 + c].cracked && room.game.floors[playerFloor].tiles[row * 4 + c].revealed)
          cracks.add(room.game.floors[playerFloor].tiles[row * 4 + c].number)
      }

      for (let r = 0; r < 4; r++) {
        if (r * 4 + col === playerIdx) continue;
        if (!room.game.floors[playerFloor].tiles[r * 4 + col].cracked && room.game.floors[playerFloor].tiles[r * 4 + col].revealed)
          cracks.add(room.game.floors[playerFloor].tiles[r * 4 + col].number)
      }

      if (cracks.length === 0) return

      cracks = [...cracks]
      let randNumber = cracks[Math.floor(Math.random() * cracks.length)]
      await this.crackSafe(room, playerFloor, playerIdx, [randNumber, 0, 0, 0, 0, 0])

      game.inventory[this.playerName].tool.splice(game.inventory[this.playerName].tool.indexOf(tool), 1)
      await this.roomService.setGameState(this.roomId, room.game);
    }


    if (tool === "Crystal") {

      const { ordered, remainder } = await this.askCrystalReorder(room);

      // új pakli: rendezett 3 megy a tetejére
      game.events = [...ordered, ...remainder];

      // tool levonása
      game.inventory[this.playerName].tool.splice(
        game.inventory[this.playerName].tool.indexOf(tool),
        1
      );

      await this.roomService.setGameState(this.roomId, room.game);
      return;

    }


  }

  showBlueprintDialog = false;

  private blueprintResolver: ((value: { fIdx: number; tIdx: number }) => void) | null = null;

  blueprintFloorIdx = 0;
  blueprintHeaderText = 'Blueprint – válassz egy mezőt a felfedéshez';
  blueprintAllowedMask: Record<number, boolean[]> | null = null;
  askBlueprintTarget(room: Room, opts?: { allowedMask?: Record<number, boolean[]>, header?: string }): Promise<{ fIdx: number; tIdx: number }> {
    // alapból a játékos szintjére ugrunk, ha van
    const myPos = room.game?.playerPositions?.[this.playerName ?? ''];
    if (myPos) this.blueprintFloorIdx = myPos.floor;


    this.blueprintAllowedMask = opts?.allowedMask ?? null;
    this.blueprintHeaderText = opts?.header ?? 'Blueprint – válassz egy mezőt a felfedéshez';


    this.showBlueprintDialog = true;
    this.animatation = true;

    return new Promise(resolve => {
      this.blueprintResolver = resolve;
    });
  }

  resolveBlueprintTarget(fIdx: number, tIdx: number, revealed: boolean) {
    if (!this.blueprintResolver) return;
    const allowed = !this.blueprintAllowedMask || this.blueprintAllowedMask[fIdx]?.[tIdx];
    if (revealed || !allowed) return;
    const payload = { fIdx, tIdx };

    this.showBlueprintDialog = false;
    this.animatation = false;
    this.blueprintAllowedMask = null;
    this.blueprintResolver(payload);
    this.blueprintResolver = null;

  }

  // --- Crystal dialog state ---
  showCrystalDialog = false;

  crystalCards: string[] = [];

// a pakli maradéka (a top3 után)
  private crystalRemainder: string[] = [];

// promise resolver (nincs cancel ág)
  private crystalResolver: ((value: { ordered: string[]; remainder: string[] }) => void) | null = null;

  askCrystalReorder(room: Room): Promise<{ ordered: string[]; remainder: string[] }> {
    const game = room.game!;
    // working pakli: ha nincs 3 lap, keverünk újat
    let workingDeck = Array.isArray(game.events) ? [...game.events] : [];

    if (workingDeck.length < 3) {
      workingDeck = this.shuffle([...eventList]);
    }

    // top 3
    const drawCount = Math.min(3, workingDeck.length);
    this.crystalCards = workingDeck.slice(0, drawCount);
    this.crystalRemainder = workingDeck.slice(drawCount);

    // UI lock + modal
    this.showCrystalDialog = true;
    this.animatation = true;

    return new Promise(resolve => {
      this.crystalResolver = resolve;
    });
  }

  confirmCrystalDialog() {
    if (!this.crystalResolver) return;

    const ordered = [...this.crystalCards];
    const remainder = [...this.crystalRemainder];

    this.showCrystalDialog = false;
    this.animatation = false;

    this.crystalResolver({ ordered, remainder });
    this.crystalResolver = null;
  }

// vízszintes drag&drop handler
  dropCrystal(event: CdkDragDrop<string[]>) {
    moveItemInArray(this.crystalCards, event.previousIndex, event.currentIndex);
  }

  // --- Character pick state ---
  showCharacterDialog = false;

// Characters lista (ha a Characters export enum/const, ebből szedjük ki)
  protected readonly characterList: string[] = (() => {
    const vals = Object.values(Characters as any);
    // enum esetén jönnek számok is, azokat kiszűrjük
    return vals.filter(v => typeof v === 'string') as string[];
  })();

  protected needsCharacter(room: Room): boolean {
    if (this.isSpectator(room) || !room.game) return false;
    const name = this.playerName ?? '';
    const pc = (room.game as any).playerCharacter ?? {};
    return !pc[name] || pc[name].trim() === '';
  }

  protected isCharacterTaken(room: Room, character: string): boolean {
    const pc = (room.game as any)?.playerCharacter ?? {};
    return Object.entries(pc).some(([p, c]) => p !== (this.playerName ?? '') && (typeof c === 'string') && character.startsWith(c));
  }

  protected async selectCharacter(room: Room, character: string) {
    if (!room.game) return;
    const name = this.playerName ?? '';
    if (!name) return;

    const game: GameState = JSON.parse(JSON.stringify(room.game));
    (game as any).playerCharacter = (game as any).playerCharacter ?? {};
    (game as any).playerCharacter[name] = character;

    this.showCharacterDialog = false;
    await this.roomService.setGameState(this.roomId, game);
  }

  canUseCharacterSpell(room: Room): boolean{
    if(room.game?.playerCharacter[this.playerName] === "AcrobatHard" && room.game.currentAP >= 3 && [5,6,9,10].indexOf(room.game.playerPositions[this.playerName].tileIdx) === -1){
      return true}
    if(room.game?.playerCharacter[this.playerName] === "HackerHard" && room.game.currentAP > 0 && room.game.hackHacker === 0){
      return true}
    if(room.game?.playerCharacter[this.playerName] === "Hawk" && !this.hawkPeeked){
      return true}
    if(room.game?.playerCharacter[this.playerName] === 'HawkHard' && !this.hawkPeeked){
      return true}
    if(room.game?.playerCharacter[this.playerName] === 'Juicer'){
      return true}
    if(room.game?.playerPositions[this.playerName] && room.game?.playerCharacter[this.playerName] === "JuicerHard" && room.game?.floors[room.game.playerPositions[this.playerName].floor].alarms.find(x => x === room.game?.playerPositions[this.playerName].tileIdx) !== undefined && room.game.juicerToken === 0){
      return true}
    if(room.game?.playerPositions[this.playerName] && room.game?.playerCharacter[this.playerName] === "JuicerHard" && room.game.floors[room.game.playerPositions[this.playerName].floor].alarms.find(x => x === room.game?.playerPositions[this.playerName].tileIdx) === undefined && room.game.juicerToken === 1){
      return true}


    return false
  }

  hawkPeeked = false
  protected async useCharacterSpell(room: Room) {
    if (!room.game) return

    const game = room.game;
    let updatedGame= JSON.parse(JSON.stringify(room.game));

    const dialog = document.getElementById("choiceDialog") as HTMLDialogElement;
    const choice1 = document.getElementById("choice-1") as HTMLDialogElement;
    const choice2 = document.getElementById("choice-2") as HTMLDialogElement;
    const choice3 = document.getElementById("choice-3") as HTMLDialogElement;
    const choice4 = document.getElementById("choice-4") as HTMLDialogElement;
    const closebtn = document.getElementById("choice-cancel") as HTMLDialogElement

    if (game.playerCharacter[this.playerName] === "AcrobatHard" && game.currentAP >= 3 && [5,6,9,10].indexOf(game.playerPositions[this.playerName].tileIdx) === -1){
      if (game.playerPositions[this.playerName].floor < room.floorCount - 1)
        choice1.innerText = "Felfelé"
      else
        choice1.hidden = true
      if (game.playerPositions[this.playerName].floor > 0)
        choice2.innerText = "Lefelé"
      else
        choice2.hidden = true

      choice3.hidden = true
      this.animatation = true
      dialog.addEventListener("cancel", (e) => e.preventDefault(), { once: true });
      dialog.addEventListener('keydown', (event) => {if (event.key === 'Escape') {event.preventDefault();}});
      dialog.showModal();
      const choice = await new Promise<string>((resolve) => {
        dialog.addEventListener("close", () => resolve(dialog.returnValue), { once: true });});

      if (choice === "1") {
        updatedGame = await this.moveToTile(room, game.playerPositions[this.playerName].floor + 1, game.playerPositions[this.playerName].tileIdx)
        updatedGame.currentAP = 0
      }
      if (choice === "2") {
        updatedGame = await this.moveToTile(room, game.playerPositions[this.playerName].floor - 1, game.playerPositions[this.playerName].tileIdx)
        updatedGame.currentAP = 0
      }

      this.animatation = false;
      choice1.hidden = false
      choice2.hidden = false
      choice3.hidden = false
      closebtn.hidden = false
    }

    if (game.playerCharacter[this.playerName] === "HackerHard" && game.currentAP > 0 && room.game.hackHacker === 0){
      updatedGame.hackHacker = 1
      updatedGame.currentAP -= 1
    }

    if (game.playerCharacter[this.playerName] === "Hawk" && !this.hawkPeeked){
      let walls = game.floors[game.playerPositions[this.playerName].floor].tiles[game.playerPositions[this.playerName].tileIdx].walls
      if (game.playerPositions[this.playerName].tileIdx > 3 && walls.top && !game.floors[game.playerPositions[this.playerName].floor].tiles[game.playerPositions[this.playerName].tileIdx - 4].revealed)
        choice1.innerText = "Fel"
      else
        choice1.hidden = true
      if (game.playerPositions[this.playerName].tileIdx % 4 !== 3 && walls.right && !game.floors[game.playerPositions[this.playerName].floor].tiles[game.playerPositions[this.playerName].tileIdx + 1].revealed)
        choice2.innerText = "Jobbra"
      else
        choice2.hidden = true
      if (game.playerPositions[this.playerName].tileIdx < 12 && walls.bottom && !game.floors[game.playerPositions[this.playerName].floor].tiles[game.playerPositions[this.playerName].tileIdx + 4].revealed)
        choice3.innerText = "Le"
      else
        choice3.hidden = true
      if (game.playerPositions[this.playerName].tileIdx % 4 !== 0 && walls.left && !game.floors[game.playerPositions[this.playerName].floor].tiles[game.playerPositions[this.playerName].tileIdx - 1].revealed)
      { choice4.hidden = false
        choice4.innerText = "Balra"}
      else
        choice4.hidden = true

      this.animatation = true
      dialog.addEventListener("cancel", (e) => e.preventDefault(), { once: true });
      dialog.addEventListener('keydown', (event) => {if (event.key === 'Escape') {event.preventDefault();}});
      dialog.showModal();
      const choice = await new Promise<string>((resolve) => {
        dialog.addEventListener("close", () => resolve(dialog.returnValue), { once: true });});

      if (choice === "1")
        updatedGame.floors[game.playerPositions[this.playerName].floor].tiles[game.playerPositions[this.playerName].tileIdx - 4].revealed = true
      if (choice === "2")
        updatedGame.floors[game.playerPositions[this.playerName].floor].tiles[game.playerPositions[this.playerName].tileIdx + 1].revealed = true
      if (choice === "3")
        updatedGame.floors[game.playerPositions[this.playerName].floor].tiles[game.playerPositions[this.playerName].tileIdx + 4].revealed = true
      if (choice === "4")
        updatedGame.floors[game.playerPositions[this.playerName].floor].tiles[game.playerPositions[this.playerName].tileIdx - 1].revealed = true

      if (choice !== "Cancel") {this.hawkPeeked = true}
      choice1.hidden = false
      choice2.hidden = false
      choice3.hidden = false
      choice4.hidden = true
      this.animatation = false
    }

    if (game.playerCharacter[this.playerName] === "HawkHard" && !this.hawkPeeked) {
      const f = game.playerPositions[this.playerName].floor;
      const t = game.playerPositions[this.playerName].tileIdx;

      // 1) induló maszk (mindenhol false)
      const mask: Record<number, boolean[]> = {};
      for (let i = 0; i < this.floorCount; i++) mask[i] = Array(16).fill(false);

      // 2) szomszédok az aktuális szinten (falat figyelembe véve), csak unrevealed célok
      const neighbors1: number[] = [];
      const x = t % 4, y = Math.floor(t / 4);
      const pushIfOk = (n: number) => {
        if (n < 0 || n > 15) return;
        if (!this.isWallBetween(room, f, t, n)) neighbors1.push(n);
      };
      if (y > 0) pushIfOk(t - 4);
      if (x < 3) pushIfOk(t + 1);
      if (y < 3) pushIfOk(t + 4);
      if (x > 0) pushIfOk(t - 1);

      // 1-lépés: ha a szomszéd unrevealed, akkor kijelölhető
      for (const n of neighbors1) {
        if (!game.floors[f].tiles[n].revealed) mask[f][n] = true;
      }

      // 3) 2-lépés: csak ha a KÖZTES mező revealed
      for (const mid of neighbors1) {
        if (!game.floors[f].tiles[mid].revealed) continue; // itt a "nem ugorhatsz át unrevealed-en" szabály
        const mx = mid % 4, my = Math.floor(mid / 4);

        const secondNeighbors: number[] = [];
        const push2 = (n: number) => {
          if (n < 0 || n > 15) return;
          if (!this.isWallBetween(room, f, mid, n)) secondNeighbors.push(n);
        };
        if (my > 0) push2(mid - 4);
        if (mx < 3) push2(mid + 1);
        if (my < 3) push2(mid + 4);
        if (mx > 0) push2(mid - 1);

        for (const d of secondNeighbors) {
          if (d === t) continue; // ne lépj vissza önmagadra
          if (!game.floors[f].tiles[d].revealed) mask[f][d] = true;
        }
      }

      // 4) Vertikális peek (azonos index, szomszédos szint) – a mozgásszabállyal egyezően
      if (this.canMove(room, f, t, 'floorUp') && f < this.floorCount - 1) {
        if (!game.floors[f + 1].tiles[t].revealed) mask[f + 1][t] = true;
      }
      if (this.canMove(room, f, t, 'floorDown') && f > 0) {
        if (!game.floors[f - 1].tiles[t].revealed) mask[f - 1][t] = true;
      }

      // 5) Ugyanaz a dialógus, más fejléc + maszk
      const { fIdx, tIdx } = await this.askBlueprintTarget(room, {
        allowedMask: mask,
        header: 'HawkHard – válassz egy elérhető mezőt a benézéshez (max 2 lépés)'
      });

      updatedGame.floors[fIdx].tiles[tIdx].revealed = true;
      this.hawkPeeked = true;
    }

    if (game.playerCharacter[this.playerName] === "Juicer"){
      let walls = game.floors[game.playerPositions[this.playerName].floor].tiles[game.playerPositions[this.playerName].tileIdx].walls
      let gIdx = game.guardPositions[game.playerPositions[this.playerName].floor].pos.y * 4 + game.guardPositions[game.playerPositions[this.playerName].floor].pos.x
      if (game.playerPositions[this.playerName].tileIdx > 3 && !walls.top && game.floors[game.playerPositions[this.playerName].floor].tiles[game.playerPositions[this.playerName].tileIdx - 4].revealed && gIdx !== game.playerPositions[this.playerName].tileIdx - 4)
        choice1.innerText = "Fel"
      else
        choice1.hidden = true
      if (game.playerPositions[this.playerName].tileIdx % 4 !== 3 && !walls.right && game.floors[game.playerPositions[this.playerName].floor].tiles[game.playerPositions[this.playerName].tileIdx + 1].revealed && gIdx !== game.playerPositions[this.playerName].tileIdx +1)
        choice2.innerText = "Jobbra"
      else
        choice2.hidden = true
      if (game.playerPositions[this.playerName].tileIdx < 12 && !walls.bottom && game.floors[game.playerPositions[this.playerName].floor].tiles[game.playerPositions[this.playerName].tileIdx + 4].revealed && gIdx !== game.playerPositions[this.playerName].tileIdx + 4)
        choice3.innerText = "Le"
      else
        choice3.hidden = true
      if (game.playerPositions[this.playerName].tileIdx % 4 !== 0 && !walls.left && game.floors[game.playerPositions[this.playerName].floor].tiles[game.playerPositions[this.playerName].tileIdx - 1].revealed && gIdx !== game.playerPositions[this.playerName].tileIdx - 1)
      { choice4.hidden = false
        choice4.innerText = "Balra"}
      else
        choice4.hidden = true

      this.animatation = true
      dialog.addEventListener("cancel", (e) => e.preventDefault(), { once: true });
      dialog.addEventListener('keydown', (event) => {if (event.key === 'Escape') {event.preventDefault();}});
      dialog.showModal();
      const choice = await new Promise<string>((resolve) => {
        dialog.addEventListener("close", () => resolve(dialog.returnValue), { once: true });});

      if (choice === "1")
        this.triggerAlarm(updatedGame, "Juicer", game.playerPositions[this.playerName].floor, game.playerPositions[this.playerName].tileIdx - 4)
      if (choice === "2")
        this.triggerAlarm(updatedGame, "Juicer", game.playerPositions[this.playerName].floor, game.playerPositions[this.playerName].tileIdx + 1)
      if (choice === "3")
        this.triggerAlarm(updatedGame, "Juicer", game.playerPositions[this.playerName].floor, game.playerPositions[this.playerName].tileIdx + 4)
      if (choice === "4")
        this.triggerAlarm(updatedGame, "Juicer", game.playerPositions[this.playerName].floor, game.playerPositions[this.playerName].tileIdx - 1)

      choice1.hidden = false
      choice2.hidden = false
      choice3.hidden = false
      choice4.hidden = true
      this.animatation = false
    }

    if (game.playerCharacter[this.playerName] === "JuicerHard" && game.floors[game.playerPositions[this.playerName].floor].alarms.find(x => x === game.playerPositions[this.playerName].tileIdx) !== undefined && game.juicerToken === 0){
      updatedGame.floors[updatedGame.playerPositions[this.playerName].floor].alarms = updatedGame.floors[updatedGame.playerPositions[this.playerName].floor].alarms.filter((a:number) => a !== updatedGame.playerPositions[this.playerName].tileIdx);
      if (updatedGame.floors[updatedGame.playerPositions[this.playerName].floor].alarms.length === 0){
        updatedGame.guardPositions[updatedGame.playerPositions[this.playerName].floor].target = updatedGame.guardPositions[updatedGame.playerPositions[this.playerName].floor].moves[0]
        updatedGame.guardPositions[updatedGame.playerPositions[this.playerName].floor].moves = updatedGame.guardPositions[updatedGame.playerPositions[this.playerName].floor].moves.slice(1)
      } else {
        this.checkClosestAlarm(updatedGame, updatedGame.guardPositions[updatedGame.playerPositions[this.playerName].floor], updatedGame.playerPositions[this.playerName].floor, updatedGame.playerPositions[this.playerName].floor)
      }
      updatedGame.juicerToken = 1
    }

    if (game.playerCharacter[this.playerName] === "JuicerHard" && game.floors[game.playerPositions[this.playerName].floor].alarms.find(x => x === game.playerPositions[this.playerName].tileIdx) === undefined && game.juicerToken === 1){
      this.triggerAlarm(updatedGame, "Juicer", game.playerPositions[this.playerName].floor, game.playerPositions[this.playerName].tileIdx)
      updatedGame.juicerToken = 0
    }

    if (updatedGame)
    await this.roomService.setGameState(this.roomId, updatedGame);
  }
}
