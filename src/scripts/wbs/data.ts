// 作業一覧表（WBS）のデータ定義と永続化処理

/** グループ内の作業タスク */
export interface WbsTask {
    id: string;
    /** 作業の名称（例: "機械設計"） */
    name: string;
    /** 先行作業（例: "-", "A", "D, G" など） */
    predecessors: string;
    /** 所要時間（数値文字列） */
    duration: string;
}

/** 親グループ（例: "1. システム設計"（単独） や "2. 機械開発"（子タスク持ち）） */
export interface WbsGroup {
    id: string;
    /** グループ名 / 作業名（例: "システム設計", "機械開発"） */
    name: string;
    /** 子タスクを持たない単独作業の場合の先行作業 */
    predecessors?: string;
    /** 子タスクを持たない単独作業の場合の所要時間 */
    duration?: string;
    /** 配下の作業タスク一覧 */
    tasks: WbsTask[];
}

export interface WbsData {
    /** 表番号・プレフィックス（例: "表 7.1"） */
    tableNumber: string;
    /** 表のタイトル（例: "プロジェクトの作業一覧表"） */
    title: string;
    /** 所要時間の単位（例: "週", "日", "時間"） */
    timeUnit: string;
    /** 親グループ一覧 */
    groups: WbsGroup[];
}

/** 表描画やエクスポート用の平坦化された行データ */
export interface WbsFlatItem {
    id: string;
    /** 自動計算されたWBS番号（例: "1.", "2.", "2.1"） */
    wbs: string;
    /** 作業の名称 */
    name: string;
    /** 自動計算された記号（例: "A", "B", ... 親見出し行は空文字） */
    symbol: string;
    /** 先行作業 */
    predecessors: string;
    /** 所要時間 */
    duration: string;
    /** 親見出し行かどうか（配下にタスクを持つグループの行） */
    isParent: boolean;
    /** 階層の深さ（0: 親, 1: 子） */
    depth: number;
}

export const STORAGE_KEY = 'seat_wbs_data';

/** インデックス（0始まり）から記号（A, B, ..., Z, AA, AB, ...）を生成する */
export function getSymbolForIndex(index: number): string {
    let symbol = '';
    let num = index;
    while (num >= 0) {
        symbol = String.fromCharCode(65 + (num % 26)) + symbol;
        num = Math.floor(num / 26) - 1;
    }
    return symbol;
}

/** サンプルデータ（reference/作業一覧表.jpg に準拠） */
export const SAMPLE_WBS_DATA: WbsData = {
    tableNumber: '表 7.1',
    title: 'プロジェクトの作業一覧表',
    timeUnit: '週',
    groups: [
        {
            id: 'grp-1',
            name: 'システム設計',
            predecessors: '-',
            duration: '4',
            tasks: [],
        },
        {
            id: 'grp-2',
            name: '機械開発',
            tasks: [
                { id: 'task-2-1', name: '機械設計', predecessors: 'A', duration: '4' },
                { id: 'task-2-2', name: '機械試作', predecessors: 'B', duration: '2' },
                { id: 'task-2-3', name: '機械試験', predecessors: 'C', duration: '2' },
            ],
        },
        {
            id: 'grp-3',
            name: '電気開発',
            tasks: [
                { id: 'task-3-1', name: '電気設計', predecessors: 'A', duration: '5' },
                { id: 'task-3-2', name: '電気試作', predecessors: 'E', duration: '6' },
                { id: 'task-3-3', name: '電気試験', predecessors: 'F', duration: '3' },
            ],
        },
        {
            id: 'grp-4',
            name: 'ソフトウェア開発',
            tasks: [
                { id: 'task-4-1', name: 'ソフトウェア設計', predecessors: 'A', duration: '4' },
                { id: 'task-4-2', name: 'ソフトウェア製造', predecessors: 'H', duration: '5' },
                { id: 'task-4-3', name: 'ソフトウェア試験', predecessors: 'I', duration: '3' },
            ],
        },
        {
            id: 'grp-5',
            name: '試験',
            tasks: [
                { id: 'task-5-1', name: '組合せ試験 1', predecessors: 'D, G', duration: '2' },
                { id: 'task-5-2', name: '組合せ試験 2', predecessors: 'G, J', duration: '4' },
                { id: 'task-5-3', name: 'システム試験', predecessors: 'K, L', duration: '3' },
            ],
        },
    ],
};

/** 空の初期データ */
export const DEFAULT_WBS_DATA: WbsData = {
    tableNumber: '表 1',
    title: 'プロジェクトの作業一覧表',
    timeUnit: '週',
    groups: [
        {
            id: 'grp-init-1',
            name: 'システム設計',
            predecessors: '-',
            duration: '1',
            tasks: [],
        },
    ],
};

/** 階層データ（groups）から表用行データ（WBS番号・記号が自動計算されたリスト）を生成する */
export function flattenWbsData(data: WbsData): WbsFlatItem[] {
    const flatItems: WbsFlatItem[] = [];
    let symbolCounter = 0;

    data.groups.forEach((group, gIdx) => {
        const groupNum = `${gIdx + 1}.`;
        const hasTasks = group.tasks.length > 0;

        if (!hasTasks) {
            // 子タスクを持たない単独の作業グループ
            const symbol = getSymbolForIndex(symbolCounter++);
            flatItems.push({
                id: group.id,
                wbs: groupNum,
                name: group.name,
                symbol,
                predecessors: group.predecessors ?? '-',
                duration: group.duration ?? '',
                isParent: false,
                depth: 0,
            });
        } else {
            // 親見出し行
            flatItems.push({
                id: group.id,
                wbs: groupNum,
                name: group.name,
                symbol: '',
                predecessors: '',
                duration: '',
                isParent: true,
                depth: 0,
            });

            // 子タスク行
            group.tasks.forEach((task, tIdx) => {
                const taskNum = `${gIdx + 1}.${tIdx + 1}`;
                const symbol = getSymbolForIndex(symbolCounter++);
                flatItems.push({
                    id: task.id,
                    wbs: taskNum,
                    name: task.name,
                    symbol,
                    predecessors: task.predecessors ?? '',
                    duration: task.duration ?? '',
                    isParent: false,
                    depth: 1,
                });
            });
        }
    });

    return flatItems;
}

/** localStorage からデータを読み込む。データが無い・旧形式・壊れている場合は安全に変換または fallback を返す */
export function loadWbsData(fallback: WbsData = SAMPLE_WBS_DATA): WbsData {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return structuredClone(fallback);
    try {
        const parsed = JSON.parse(saved);
        if (!parsed) return structuredClone(fallback);

        // 新形式: groups がある場合
        if (Array.isArray(parsed.groups)) {
            return {
                tableNumber: typeof parsed.tableNumber === 'string' ? parsed.tableNumber : fallback.tableNumber,
                title: typeof parsed.title === 'string' ? parsed.title : fallback.title,
                timeUnit: typeof parsed.timeUnit === 'string' ? parsed.timeUnit : fallback.timeUnit,
                groups: parsed.groups.map((grp: any, gIdx: number) => ({
                    id: grp.id || `grp-${Date.now()}-${gIdx}`,
                    name: grp.name ?? '',
                    predecessors: grp.predecessors ?? '-',
                    duration: grp.duration ?? '',
                    tasks: Array.isArray(grp.tasks)
                        ? grp.tasks.map((tsk: any, tIdx: number) => ({
                              id: tsk.id || `tsk-${Date.now()}-${gIdx}-${tIdx}`,
                              name: tsk.name ?? '',
                              predecessors: tsk.predecessors ?? '',
                              duration: tsk.duration ?? '',
                          }))
                        : [],
                })),
            };
        }

        // 旧形式（items 配列）からの自動移行
        if (Array.isArray(parsed.items)) {
            const groups: WbsGroup[] = [];
            let currentGroup: WbsGroup | null = null;

            parsed.items.forEach((it: any, idx: number) => {
                const isParent = !it.symbol && !it.duration;
                if (isParent) {
                    currentGroup = {
                        id: it.id || `grp-${Date.now()}-${idx}`,
                        name: it.name || '',
                        tasks: [],
                    };
                    groups.push(currentGroup);
                } else if (currentGroup && (it.wbs.includes('.') && it.wbs.split('.').filter(Boolean).length > 1)) {
                    currentGroup.tasks.push({
                        id: it.id || `tsk-${Date.now()}-${idx}`,
                        name: it.name || '',
                        predecessors: it.predecessors || '',
                        duration: it.duration || '',
                    });
                } else {
                    currentGroup = {
                        id: it.id || `grp-${Date.now()}-${idx}`,
                        name: it.name || '',
                        predecessors: it.predecessors || '-',
                        duration: it.duration || '',
                        tasks: [],
                    };
                    groups.push(currentGroup);
                }
            });

            return {
                tableNumber: typeof parsed.tableNumber === 'string' ? parsed.tableNumber : fallback.tableNumber,
                title: typeof parsed.title === 'string' ? parsed.title : fallback.title,
                timeUnit: typeof parsed.timeUnit === 'string' ? parsed.timeUnit : fallback.timeUnit,
                groups: groups.length > 0 ? groups : structuredClone(fallback.groups),
            };
        }

        return structuredClone(fallback);
    } catch {
        return structuredClone(fallback);
    }
}

/** localStorage へデータを保存する */
export function saveWbsData(data: WbsData): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
