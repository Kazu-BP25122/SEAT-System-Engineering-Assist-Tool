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

/** サンプル1: ニーズ展開図（reference/TreeDiagram/ニーズ展開図.png に対応） */
export const SAMPLE_NEEDS_TREE: TreeDiagramData = {
    title: '双方の記憶に残る文化祭の創出',
    categories: [
        {
            id: 'cat-visitor',
            name: '来場者の記憶への定着',
            subCategories: [
                {
                    id: 'sub-comfort',
                    name: '快適性を確保する',
                    items: [
                        '列に並びたくない',
                        '混雑を避けたい',
                        '現金を使いたくない',
                        '座りたい',
                        'スマホの充電をしたい',
                    ],
                },
                {
                    id: 'sub-charm',
                    name: '魅力を伝える',
                    items: [
                        '美味しい物を食べたい',
                        'お土産が欲しい',
                        '世界観に没頭したい',
                        '懐かしみたい',
                        '安く楽しみたい',
                    ],
                },
                {
                    id: 'sub-share',
                    name: '体験を共有する',
                    items: [
                        '写真をSNSにアップしたい',
                        '友達と一緒に楽しみたい',
                        '盛り上がりたい',
                    ],
                },
            ],
        },
        {
            id: 'cat-organizer',
            name: '主催者の記憶への定着',
            subCategories: [
                {
                    id: 'sub-risk',
                    name: 'リスクを回避する',
                    items: [
                        'クレームを防ぎたい',
                        'トラブルを防ぎたい',
                        '費用を抑えたい',
                    ],
                },
                {
                    id: 'sub-satisfaction',
                    name: '満足度を向上する',
                    items: [
                        '長時間待たせたくない',
                        'トレンドを把握したい',
                    ],
                },
                {
                    id: 'sub-fulfillment',
                    name: '充実感を得る',
                    items: [
                        'たくさんの人に来てほしい',
                        '来場者の感想を聞きたい',
                        '達成感を得たい',
                        'データを取りたい',
                    ],
                },
            ],
        },
    ],
};

/** サンプル2: 目的展開図（reference/TreeDiagram/目的展開図_v4.png に対応） */
export const SAMPLE_PURPOSE_TREE: TreeDiagramData = {
    title: '双方の記憶に残る文化祭の創出',
    categories: [
        {
            id: 'cat-p-visitor',
            name: '来場者の記憶への定着',
            subCategories: [
                {
                    id: 'sub-p-comfort',
                    name: '快適性の確保',
                    items: [
                        '待ち時間の短縮',
                        '動線の設計',
                        '自由度の向上',
                    ],
                },
                {
                    id: 'sub-p-stimulus',
                    name: '刺激の創出',
                    items: [
                        '非日常感の提供',
                        '未告知イベントの開催',
                        'ライブの実施',
                    ],
                },
                {
                    id: 'sub-p-enjoy',
                    name: '楽しさの提供',
                    items: [
                        '美味しいご飯の提供',
                        '参加型企画の実施',
                        '世界観の設定',
                    ],
                },
            ],
        },
        {
            id: 'cat-p-organizer',
            name: '主催者の記憶への定着',
            subCategories: [
                {
                    id: 'sub-p-achieve',
                    name: '達成感の獲得',
                    items: [
                        'チームでの協力',
                        'ブースのデバッグによる試行錯誤',
                        '来場者数の可視化',
                    ],
                },
                {
                    id: 'sub-p-joy',
                    name: '他者貢献の喜びの実感',
                    items: [
                        'メッセージボードで来場者の声の共有',
                        'フォトスポットによるポジティブな反応の可視化',
                    ],
                },
            ],
        },
    ],
};

/** デフォルトデータ（初回表示時など） */
export const DEFAULT_TREE_DATA: TreeDiagramData = SAMPLE_NEEDS_TREE;

/** 空の初期データ（新規作成時） */
export const EMPTY_TREE_DATA: TreeDiagramData = {
    title: 'メインテーマを入力',
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
