// 作業一覧表（WBS）のデータ定義と永続化処理

export interface WbsItem {
    id: string;
    /** WBS番号（例: "1.", "2.1" など） */
    wbs: string;
    /** 作業の名称（例: "システム設計", "機械設計" など） */
    name: string;
    /** 記号（例: "A", "B" など。親タスクなどの場合は空文字） */
    symbol: string;
    /** 先行作業（例: "-", "A", "D, G" など。親タスクなどの場合は空文字） */
    predecessors: string;
    /** 所要時間（数値文字列。親タスクなどの場合は空文字） */
    duration: string;
}

export interface WbsData {
    /** 表番号・プレフィックス（例: "表 7.1"） */
    tableNumber: string;
    /** 表のタイトル（例: "プロジェクトの作業一覧表"） */
    title: string;
    /** 所要時間の単位（例: "週", "日", "時間"） */
    timeUnit: string;
    /** 作業一覧 */
    items: WbsItem[];
}

export const STORAGE_KEY = 'seat_wbs_data';

/** サンプルデータ（reference/作業一覧表.jpg に準拠） */
export const SAMPLE_WBS_DATA: WbsData = {
    tableNumber: '表 7.1',
    title: 'プロジェクトの作業一覧表',
    timeUnit: '週',
    items: [
        { id: 'item-1', wbs: '1.', name: 'システム設計', symbol: 'A', predecessors: '-', duration: '4' },
        { id: 'item-2', wbs: '2.', name: '機械開発', symbol: '', predecessors: '', duration: '' },
        { id: 'item-3', wbs: '2.1', name: '機械設計', symbol: 'B', predecessors: 'A', duration: '4' },
        { id: 'item-4', wbs: '2.2', name: '機械試作', symbol: 'C', predecessors: 'B', duration: '2' },
        { id: 'item-5', wbs: '2.3', name: '機械試験', symbol: 'D', predecessors: 'C', duration: '2' },
        { id: 'item-6', wbs: '3.', name: '電気開発', symbol: '', predecessors: '', duration: '' },
        { id: 'item-7', wbs: '3.1', name: '電気設計', symbol: 'E', predecessors: 'A', duration: '5' },
        { id: 'item-8', wbs: '3.2', name: '電気試作', symbol: 'F', predecessors: 'E', duration: '6' },
        { id: 'item-9', wbs: '3.3', name: '電気試験', symbol: 'G', predecessors: 'F', duration: '3' },
        { id: 'item-10', wbs: '4.', name: 'ソフトウェア開発', symbol: '', predecessors: '', duration: '' },
        { id: 'item-11', wbs: '4.1', name: 'ソフトウェア設計', symbol: 'H', predecessors: 'A', duration: '4' },
        { id: 'item-12', wbs: '4.2', name: 'ソフトウェア製造', symbol: 'I', predecessors: 'H', duration: '5' },
        { id: 'item-13', wbs: '4.3', name: 'ソフトウェア試験', symbol: 'J', predecessors: 'I', duration: '3' },
        { id: 'item-14', wbs: '5.', name: '試験', symbol: '', predecessors: '', duration: '' },
        { id: 'item-15', wbs: '5.1', name: '組合せ試験 1', symbol: 'K', predecessors: 'D, G', duration: '2' },
        { id: 'item-16', wbs: '5.2', name: '組合せ試験 2', symbol: 'L', predecessors: 'G, J', duration: '4' },
        { id: 'item-17', wbs: '5.3', name: 'システム試験', symbol: 'M', predecessors: 'K, L', duration: '3' },
    ],
};

/** 空の初期データ */
export const DEFAULT_WBS_DATA: WbsData = {
    tableNumber: '表 1',
    title: 'プロジェクトの作業一覧表',
    timeUnit: '週',
    items: [
        { id: 'item-init-1', wbs: '1.', name: '', symbol: 'A', predecessors: '-', duration: '' },
    ],
};

/** localStorage からデータを読み込む。データが無い・壊れている場合は fallback（無指定ならサンプルデータ）を返す */
export function loadWbsData(fallback: WbsData = SAMPLE_WBS_DATA): WbsData {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return structuredClone(fallback);
    try {
        const parsed = JSON.parse(saved);
        if (!parsed || !Array.isArray(parsed.items)) {
            return structuredClone(fallback);
        }
        return {
            tableNumber: typeof parsed.tableNumber === 'string' ? parsed.tableNumber : fallback.tableNumber,
            title: typeof parsed.title === 'string' ? parsed.title : fallback.title,
            timeUnit: typeof parsed.timeUnit === 'string' ? parsed.timeUnit : fallback.timeUnit,
            items: parsed.items.map((it: Partial<WbsItem>, index: number) => ({
                id: it.id || `item-${Date.now()}-${index}`,
                wbs: it.wbs ?? '',
                name: it.name ?? '',
                symbol: it.symbol ?? '',
                predecessors: it.predecessors ?? '',
                duration: it.duration ?? '',
            })),
        };
    } catch {
        return structuredClone(fallback);
    }
}

/** localStorage へデータを保存する */
export function saveWbsData(data: WbsData): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
