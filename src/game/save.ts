const KEY = "nexus-save-v1";
const SAVE_VERSION = 1;

export type SaveData = {
  version: number;
  bestTime: number;
  bestScore: number;
  games: number;
  muted: boolean;
  reduceShake: boolean;
};

const defaults: SaveData = {
  version: SAVE_VERSION,
  bestTime: 0,
  bestScore: 0,
  games: 0,
  muted: false,
  reduceShake: false,
};

function migrate(raw: Partial<SaveData> | null): SaveData {
  return { ...defaults, ...raw, version: SAVE_VERSION };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaults };
    return migrate(JSON.parse(raw) as Partial<SaveData>);
  } catch {
    return { ...defaults };
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // private mode / quota — keep playing in memory
  }
}
