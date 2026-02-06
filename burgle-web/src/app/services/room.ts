
import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, collectionData, doc, docData,
  updateDoc, arrayUnion, arrayRemove
} from '@angular/fire/firestore';

import { Observable } from 'rxjs';

export type TileType =
  | 'Safe' | 'Stairs' | 'Atrium' | 'Camera' | 'SafetyLock' | 'Fingerprint' | 'Lobby' | 'Keypad' | 'Laboratory' |
  'Laser' | 'Toilet' | 'Motion' | 'Scanner' | 'SecretDoor' | 'ServiceDuct' | 'Thermo' | 'Walkway' | 'ComputerLaser' |
  'ComputerFingerprint' | 'ComputerMotion' | 'Disabled';

export interface Tile {
  type: TileType;
  revealed: boolean;
  walls: {
    top: boolean;
    right: boolean;
    bottom: boolean;
    left: boolean;
  };
  tokens: number; // pl. alarm, hack, etc.
  number: number; // 1-6
  cracked: boolean;
  stealthtoken: number;
  thermalStairsUp: boolean;
  thermalStairsDown: boolean;
  cat: boolean;
  gold: boolean
}

export interface keypadTile {
  tries: number;
  opened: boolean;
  fIdx: number;
  tIdx: number;
}

export interface Floor {
  tiles: Tile[]; // 1D array (4x4 flattened)
  alarms: number[];
  safeOpened: boolean;
}

export interface GameState {
  floors: Floor[];
  guardPositions: { floor: number; pos: { x: number; y: number }; target: { x: number; y: number }; speed: number, moves: { x: number; y: number }[]; donut: boolean }[];
  playerPositions: { [playerName: string]: { floor: number; tileIdx: number } };
  playerOrder: string[]; // ordered list of player names
  currentPlayerIdx: number; // whose turn
  currentAP: number;
  startingPosition: number | null;
  healths: Record<string, number>;
  hackMotion: number;
  hackFingerprint: number;
  hackLaser: number;
  keypads: keypadTile[];
  tools: string[];
  events: string[];
  loots: string[];
  inventory: { [playerName: string]: { loot: string[], tool: string[]} };
  emp: string
}

export type Room = {
  name: string;
  phase: 'lobby' | 'play' | 'end';
  seed: string;
  players: string[];
  game?: GameState;
};

export const ROOM_NAME_MAP: Record<string, string> = {
  'Room1': 'Siemens Iroda',
  'Room2': 'Hadkiegészítő és Toborzó Iroda',
  'Room3': 'Le Louvre',
  'Room4': 'Aranyraktár',
  'Room5': 'Kaszinó'
};

export function getRoomDisplayName(id: string): string {
  return ROOM_NAME_MAP[id] || id;
}

@Injectable({ providedIn: 'root' })
export class RoomService {
  private fs = inject(Firestore);

  listRooms(): Observable<(Room & { id: string })[]> {
    const colRef = collection(this.fs, 'Rooms'); // <-- nagy R
    return collectionData(colRef, { idField: 'id' }) as any;
  }

  watchRoom(roomId: string): Observable<Room> {
    const ref = doc(this.fs, `Rooms/${roomId}`); // <-- nagy R
    return docData(ref) as Observable<Room>;
  }

  async joinRoom(roomId: string, playerName: string) {
    const clean = (playerName ?? '').trim();
    if (!clean) return;

    const ref = doc(this.fs, `Rooms/${roomId}`);
    await updateDoc(ref, {
      players: arrayUnion(clean),
      updatedAt: Date.now(),
    });
  }


  async removePlayer(roomId: string, playerName: string) {
    const clean = (playerName ?? '').trim();
    if (!clean) return;

    const ref = doc(this.fs, `Rooms/${roomId}`);
    await updateDoc(ref, {
      players: arrayRemove(clean),
      updatedAt: Date.now(),
    });
  }

  async startGame(roomId: string, game: GameState) {
    const ref = doc(this.fs, `Rooms/${roomId}`);
    await updateDoc(ref, {
      phase: 'play',
      game: game,
      updatedAt: Date.now(),
    });
  }

  async updateSeed(roomId: string, seed: string) {
    const ref = doc(this.fs, `Rooms/${roomId}`);
    await updateDoc(ref, {
      seed: seed,
      updatedAt: Date.now(),
    });
  }

  async resetRoom(roomId: string, newSeed: string) {
    const ref = doc(this.fs, `Rooms/${roomId}`);
    await updateDoc(ref, {
      phase: 'lobby',
      seed: newSeed,
      game: null,
      updatedAt: Date.now(),
    });
  }

  async setGameState(roomId: string, game: GameState) {
    const ref = doc(this.fs, `Rooms/${roomId}`);
    await updateDoc(ref, {
      game: game,
      updatedAt: Date.now(),
    });
  }

}
