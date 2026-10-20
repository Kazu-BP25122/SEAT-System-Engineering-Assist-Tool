// 展開図の入力・出力ページで共有するデータ定義

/** 第4層の項目（箇条書き） */
export type TreeLeafItem = string;

/** 第3層（中項目・中分類ノード） */
export interface TreeSubCategory {
    id: string;
    name: string;
    items: TreeLeafItem[];
}

/** 第2層（大項目・大分類ノード） */
export interface TreeCategory {
    id: string;
    name: string;
    subCategories: TreeSubCategory[];
    /** 第3層を持たない場合の直下項目（オプション） */
    items?: TreeLeafItem[];
}

/** 第1層（ルートノードを含む全体データ） */
export interface TreeDiagramData {
    title: string; // 第1層：全体テーマ / 最上位目的
    categories: TreeCategory[]; // 第2層ノード群
}

export const STORAGE_KEY = 'seat_treeDiagram_data';

/** ランダムな一意IDを生成 */
export function generateId(): string {
    return 'node_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36).substring(4);
}

/** 空の初期データ（他ツールと同様、初期状態は空） */
export const DEFAULT_TREE_DATA: TreeDiagramData = {
    title: '',
    categories: [],
};

/** localStorage からデータを読み込む */
export function loadTreeData(fallback: TreeDiagramData = DEFAULT_TREE_DATA): TreeDiagramData {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return structuredClone(fallback);
    try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed.title === 'string' && Array.isArray(parsed.categories)) {
            return parsed;
        }
        return structuredClone(fallback);
    } catch {
        return structuredClone(fallback);
    }
}

/** localStorage にデータを保存する */
export function saveTreeData(data: TreeDiagramData): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
