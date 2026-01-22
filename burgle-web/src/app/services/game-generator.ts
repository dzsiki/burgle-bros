
import { GameState, Tile, TileType, Floor } from './room';

const ALL_TILE_TYPES: TileType[] = [
  'Safe', 'Stairs', 'Atrium', 'Camera', 'SafetyLock', 'Fingerprint', 'Lobby', 'Keypad', 'Laboratory',
  'Laser', 'Toilet', 'Motion', 'Scanner', 'SecretDoor', 'ServiceDuct','Thermo','Walkway', 'ComputerLaser',
  'ComputerFingerprint', 'ComputerMotion'
];

const ALL_TILE_3_FlOOR: TileType[] = [
  'ServiceDuct', 'ServiceDuct', 'Laser', 'Laser', 'Laser', 'Thermo', 'Thermo', 'Thermo', 'Fingerprint', 'Fingerprint',
  'Fingerprint', 'ComputerMotion', 'ComputerLaser', 'ComputerFingerprint', 'Camera', 'Camera', "Camera", 'Camera',
  'Toilet', 'Motion', 'Motion', 'Motion', 'Scanner', 'Scanner', 'Scanner', 'Walkway', 'Walkway', 'Walkway',
  'SecretDoor', 'SecretDoor', 'Lobby', 'Lobby', 'Keypad', 'Keypad', 'Keypad', 'Laboratory', 'Laboratory', 'Atrium',
  'Atrium', 'SafetyLock', 'SafetyLock', 'SafetyLock'
]

const ALL_TILE_2_FLOOR: TileType[] = [
  'ServiceDuct', 'ServiceDuct', 'Laser', 'Laser', 'Thermo', 'Thermo', 'Fingerprint', 'Fingerprint', 'ComputerMotion',
  'ComputerLaser', 'ComputerFingerprint', 'Camera', 'Camera', "Camera", 'Toilet', 'Motion', 'Motion', 'Walkway',
  'Walkway', 'SecretDoor', 'SecretDoor', 'Lobby', 'Lobby', 'Keypad', 'Keypad', 'Laboratory', 'SafetyLock', 'SafetyLock'
]

export function generateGame(seed: string): GameState {
  // Egy nagyon egyszerű determinisztikus véletlenszám-generátor a seed alapján
  let seedNum = 0;
  for (let i = 0; i < seed.length; i++) {
    seedNum = ((seedNum << 5) - seedNum) + seed.charCodeAt(i);
    seedNum |= 0;
  }

  const random = () => {
    const x = Math.sin(seedNum++) * 10000;
    return x - Math.floor(x);
  };

  const floors: Floor[] = [];
  let available_rooms = shuffle([...ALL_TILE_3_FlOOR], random);

  // 3 szint (Burgle Bros alap játékban általában 3 szint van)
  for (let f = 0; f < 3; f++) {
    floors.push(generateFloor(random, available_rooms.slice(0,14)));
    available_rooms = available_rooms.slice(14);
  }

  let guardtargets = [];
  for (let i = 0; i < 16; i++) {
    const x = i % 4;
    const y = Math.floor(i / 4);

    guardtargets.push({ x: x, y: y });
  }

  return {
    floors,
    guardPositions: [
      { floor: 0, pos: { x: 0, y: 0 }, target: { x: 0, y: 0 }, speed: 2, moves: shuffle([...guardtargets], random)},
      { floor: 1, pos: { x: 0, y: 0 }, target: { x: 0, y: 0 }, speed: 3, moves: shuffle([...guardtargets], random)},
      { floor: 2, pos: { x: 0, y: 0 }, target: { x: 0, y: 0 }, speed: 4, moves: shuffle([...guardtargets], random)},
    ],
    playerPositions: {}
  };
}

function shuffle<T>(array: T[], random: () => number): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function generateFloor(random: () => number, rooms: TileType[]): Floor {
  const tiles: Tile[] = [];


  rooms.push('Safe', 'Stairs');
  rooms= shuffle(rooms.splice(0, 16), random);


  for (let i = 0; i < 16; i++) {
    const x = i % 4;
    const y = Math.floor(i / 4);
    const type = rooms[i];
    tiles.push({
      type,
      revealed: false,
      walls: {
        top: y === 0,
        right: x === 3,
        bottom: y === 3,
        left: x === 0
      },
      tokens: [],
      number: Math.floor(random() * 6) + 1
    });
  }

  // Falak generálása: pontosan 8 fal szintenként, hogy minden mező elérhető maradjon
  let wallsPlaced = 0;
  const potentialWalls: { i1: number, i2: number, dir: 'right' | 'bottom' }[] = [];

  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const i = y * 4 + x;
      if (x < 3) potentialWalls.push({ i1: i, i2: i + 1, dir: 'right' });
      if (y < 3) potentialWalls.push({ i1: i, i2: i + 4, dir: 'bottom' });
    }
  }

  // Összekeverjük a falhelyszíneket
  const shuffledPotentialWalls = shuffle(potentialWalls, random);

  for (const wall of shuffledPotentialWalls) {
    if (wallsPlaced >= 8) break;

    // Megpróbáljuk berakni a falat
    const { i1, i2, dir } = wall;
    if (dir === 'right') {
      tiles[i1].walls.right = true;
      tiles[i2].walls.left = true;
    } else {
      tiles[i1].walls.bottom = true;
      tiles[i2].walls.top = true;
    }

    // Ellenőrizzük, hogy minden elérhető-e (BFS)
    if (isEverythingAccessible(tiles)) {
      wallsPlaced++;
    } else {
      // Ha nem elérhető valami, visszavesszük a falat
      if (dir === 'right') {
        tiles[i1].walls.right = false;
        tiles[i2].walls.left = false;
      } else {
        tiles[i1].walls.bottom = false;
        tiles[i2].walls.top = false;
      }
    }
  }

  return { tiles };
}

function isEverythingAccessible(tiles: Tile[]): boolean {
  const visited = new Set<number>();
  const queue = [0];
  visited.add(0);

  let head = 0;
  while (head < queue.length) {
    const curr = queue[head++];
    const x = curr % 4;
    const y = Math.floor(curr / 4);

    // Szomszédok: fel, le, balra, jobbra
    const neighbors = [
      { idx: curr - 4, canGo: y > 0 && !tiles[curr].walls.top },
      { idx: curr + 4, canGo: y < 3 && !tiles[curr].walls.bottom },
      { idx: curr - 1, canGo: x > 0 && !tiles[curr].walls.left },
      { idx: curr + 1, canGo: x < 3 && !tiles[curr].walls.right },
    ];

    for (const n of neighbors) {
      if (n.canGo && !visited.has(n.idx)) {
        visited.add(n.idx);
        queue.push(n.idx);
      }
    }
  }

  return visited.size === 16;
}
