// ニーズリストの入力・出力ページで共有するデータ定義

export type NeedItems = string[];
export type SubCategories = Record<string, NeedItems>;
export type NeedsData = Record<string, NeedItems | SubCategories>;

export const STORAGE_KEY = 'seat_needs_data';

/** localStorage から読み込む。データが無い・壊れている場合は fallback を返す */
export function loadNeedsData(fallback: NeedsData): NeedsData {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return structuredClone(fallback);
    try {
        return JSON.parse(saved);
    } catch {
        return structuredClone(fallback);
    }
}

export function saveNeedsData(data: NeedsData): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
