// SWOT分析の入力・出力ページで共有するデータ定義

export type SwotData = Record<string, string[]>;

export const STORAGE_KEY = 'seat_swot_data';

// デフォルトの空データ構造
export const DEFAULT_SWOT_DATA: SwotData = {
    'S:強み': [],
    'W:弱み': [],
    'O:機会': [],
    'T:脅威': [],
    'S×O:積極的攻勢': [],
    'S×T:差別化戦略': [],
    'W×O:段階的施策': [],
    'W×T:専守防衛・撤退': [],
};

// localStorage にデータが無い場合の表示用サンプルデータ
export const SAMPLE_SWOT_DATA: SwotData = {
    'S:強み': ['高い技術力と開発スピード', '既存顧客との強固な信頼関係', '柔軟なカスタマイズ対応'],
    'W:弱み': ['ブランド認知度の不足', '営業・マーケティング体制のリソース不足', '特定顧客への売上依存'],
    'O:機会': ['業界全体のDX需要の急拡大', 'リモートワーク定着に伴うクラウドツールのニーズ増', '新規参入を促す補助金制度'],
    'T:脅威': ['大手ベンダーの類似サービス提供', '原材料・クラウドインフラ費用の高騰', '技術者の採用競争の激化'],
    'S×O:積極的攻勢': ['強みの技術力を活かした新規クラウドツールの早期リリース', 'DX需要に合わせた共同プロモーション展開'],
    'S×T:差別化戦略': ['大手にはない柔軟な顧客対応と高品質サポートで顧客流出を防止', '独自技術の知財化'],
    'W×O:段階的施策': ['DX需要を取り込むためのWeb広告・コンテンツマーケティングの強化', 'パートナー連携による営業力補強'],
    'W×T:専守防衛・撤退': ['競合との価格競争を避け高付加価値領域へ特化', '不採算案件の整理とコスト削減'],
};

/** localStorage から読み込む。データが無い・壊れている場合は fallback を返す */
export function loadSwotData(fallback: SwotData = DEFAULT_SWOT_DATA): SwotData {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return structuredClone(fallback);
    try {
        const parsed = JSON.parse(saved);
        // デフォルトキーを保持しつつマージ
        return { ...structuredClone(fallback), ...parsed };
    } catch {
        return structuredClone(fallback);
    }
}

export function saveSwotData(data: SwotData): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
