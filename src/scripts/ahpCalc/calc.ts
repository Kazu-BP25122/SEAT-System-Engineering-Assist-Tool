// AHP の計算（幾何平均法によるウエイト・整合度 C.I.・総合評価・グループ統合・感度分析）
// DOM や localStorage に依存しない純粋関数だけを置く

/** 整合性ありとみなす C.I. の上限 */
export const CI_THRESHOLD = 0.1;

/** 一対比較行列 1 つ分の計算結果（講義資料の計算表の各列に対応） */
export interface MatrixAnalysis {
    size: number;
    /** 各行の要素の積 */
    rowProducts: number[];
    /** 行の積の n 乗根（幾何平均） */
    geometricMeans: number[];
    geometricMeanSum: number;
    /** 幾何平均を合計で割って正規化したウエイト（合計 = 1） */
    weights: number[];
    /** 行列の各行とウエイトベクトルの内積 */
    weightedSums: number[];
    /** 内積をウエイトで割った固有値の推定値 */
    eigenEstimates: number[];
    /** 固有値の推定値の平均 */
    lambdaMax: number;
    ci: number;
    consistent: boolean;
}

/** AHP 全体の計算結果 */
export interface AhpAnalysis {
    criteria: MatrixAnalysis;
    /** 評価基準ごとの代替案の計算結果 */
    alternatives: MatrixAnalysis[];
    /** 代替案ごとの総合評価 */
    scores: number[];
    /** 代替案ごとの順位（同点は同順位） */
    ranks: number[];
}

/** 浮動小数点の誤差とみなす大きさ */
const EPSILON = 1e-12;

function sum(values: number[]): number {
    return values.reduce((total, v) => total + v, 0);
}

/** 一対比較行列からウエイトと整合度を求める */
export function analyzeMatrix(matrix: number[][]): MatrixAnalysis {
    const n = matrix.length;
    const rowProducts = matrix.map(row => row.reduce((product, v) => product * v, 1));
    const geometricMeans = rowProducts.map(p => Math.pow(p, 1 / n));
    const geometricMeanSum = sum(geometricMeans);
    const weights = geometricMeans.map(g => (geometricMeanSum > 0 ? g / geometricMeanSum : 0));
    const weightedSums = matrix.map(row => row.reduce((total, v, j) => total + v * weights[j], 0));
    const eigenEstimates = weightedSums.map((s, i) => (weights[i] > 0 ? s / weights[i] : 0));
    const lambdaMax = n > 0 ? sum(eigenEstimates) / n : 0;

    // 1 項目では C.I. を定義できないので 0 とする。2 項目は理論上常に 0 になるので誤差を丸める
    let ci = n > 1 ? (lambdaMax - n) / (n - 1) : 0;
    if (Math.abs(ci) < EPSILON) ci = 0;

    return {
        size: n,
        rowProducts,
        geometricMeans,
        geometricMeanSum,
        weights,
        weightedSums,
        eigenEstimates,
        lambdaMax,
        ci,
        consistent: ci <= CI_THRESHOLD,
    };
}

/**
 * 総合評価を求める。
 * alternativeWeights[i][k] は評価基準 i における代替案 k のウエイト
 */
export function synthesize(criteriaWeights: number[], alternativeWeights: number[][], alternativeCount: number): number[] {
    return Array.from({ length: alternativeCount }, (_, k) =>
        criteriaWeights.reduce((total, w, i) => total + w * (alternativeWeights[i]?.[k] ?? 0), 0));
}

/** 値の大きい順に順位を付ける（同点は同順位） */
export function rankScores(scores: number[]): number[] {
    return scores.map(score => 1 + scores.filter(other => other - score > 1e-9).length);
}

export function analyzeAhp(criteriaMatrix: number[][], alternativeMatrices: number[][][], alternativeCount: number): AhpAnalysis {
    const criteria = analyzeMatrix(criteriaMatrix);
    const alternatives = alternativeMatrices.map(analyzeMatrix);
    const scores = synthesize(criteria.weights, alternatives.map(a => a.weights), alternativeCount);
    return { criteria, alternatives, scores, ranks: rankScores(scores) };
}

// ---------- グループ意思決定 ----------

/** 複数人の一対比較行列を、要素ごとの幾何平均で 1 つの行列に統合する（逆数の関係は保たれる） */
export function aggregateMatrices(matrices: number[][][]): number[][] {
    const p = matrices.length;
    if (p === 0) return [];
    return matrices[0].map((row, i) => row.map((_, j) =>
        Math.pow(matrices.reduce((product, m) => product * m[i][j], 1), 1 / p)));
}

// ---------- 感度分析 ----------

/** 2 本の直線の交点（どの代替案どうしが入れ替わるか） */
export interface Crossing {
    w: number;
    score: number;
    pair: [number, number];
}

/** 最も総合評価の高い代替案が同じになるウエイトの区間 */
export interface BestInterval {
    from: number;
    to: number;
    best: number;
}

export interface SensitivityAnalysis {
    target: number;
    /** 計算で求めた、対象の評価基準の現在のウエイト */
    current: number;
    /** w = 0 と w = 1 のときの各代替案の総合評価（総合評価は w の 1 次式なので両端で決まる） */
    start: number[];
    end: number[];
    crossings: Crossing[];
    intervals: BestInterval[];
}

/**
 * 評価基準 target のウエイトを w にしたときの基準ウエイト。
 * ほかの基準は元の比率を保ったまま、合計が 1 − w になるように縮める
 */
export function shiftWeights(weights: number[], target: number, w: number): number[] {
    const rest = 1 - weights[target];
    return weights.map((v, i) => {
        if (i === target) return w;
        // ほかの基準のウエイトがすべて 0 のときは均等に割り振る
        return rest > EPSILON ? (v / rest) * (1 - w) : (1 - w) / (weights.length - 1);
    });
}

/** 感度分析での、ウエイト w のときの各代替案の総合評価 */
export function scoresAt(s: SensitivityAnalysis, w: number): number[] {
    return s.start.map((v, k) => v + (s.end[k] - v) * w);
}

/** 最適案が入れ替わるウエイト（区間の境目） */
export function reversalPoints(s: SensitivityAnalysis): number[] {
    return s.intervals.slice(1).map(iv => iv.from);
}

function argmax(values: number[]): number {
    return values.reduce((best, v, k) => (v > values[best] + 1e-12 ? k : best), 0);
}

/**
 * 評価基準 target のウエイトを 0 〜 1 で動かしたときの総合評価の変化を求める。
 * 評価基準が 2 つ以上あるときだけ意味を持つ
 */
export function analyzeSensitivity(
    criteriaWeights: number[],
    alternativeWeights: number[][],
    alternativeCount: number,
    target: number,
): SensitivityAnalysis {
    const start = synthesize(shiftWeights(criteriaWeights, target, 0), alternativeWeights, alternativeCount);
    const end = synthesize(shiftWeights(criteriaWeights, target, 1), alternativeWeights, alternativeCount);

    // 直線どうしの交点のうち 0 < w < 1 にあるもの
    const crossings: Crossing[] = [];
    for (let a = 0; a < alternativeCount; a++) {
        for (let b = a + 1; b < alternativeCount; b++) {
            const slopeDiff = (end[a] - start[a]) - (end[b] - start[b]);
            if (Math.abs(slopeDiff) < EPSILON) continue;
            const w = (start[b] - start[a]) / slopeDiff;
            if (w <= 0 || w >= 1) continue;
            crossings.push({ w, score: start[a] + (end[a] - start[a]) * w, pair: [a, b] });
        }
    }
    crossings.sort((x, y) => x.w - y.w);

    // 交点で区切った各区間の真ん中で最も高い代替案を調べ、同じものが続く区間はまとめる
    const breaks = [0, ...crossings.map(c => c.w), 1];
    const intervals: BestInterval[] = [];
    for (let i = 0; i < breaks.length - 1; i++) {
        const [from, to] = [breaks[i], breaks[i + 1]];
        if (to - from < 1e-9) continue;
        const mid = (from + to) / 2;
        const best = argmax(start.map((v, k) => v + (end[k] - v) * mid));
        const last = intervals[intervals.length - 1];
        if (last && last.best === best) last.to = to;
        else intervals.push({ from, to, best });
    }

    return { target, current: criteriaWeights[target] ?? 0, start, end, crossings, intervals };
}

// ---------- 整合性のアシスト ----------

/** AHP の標準スケール（9 〜 1 〜 1/9） */
export const SCALE_VALUES: number[] = [9, 8, 7, 6, 5, 4, 3, 2, 1, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 6, 1 / 7, 1 / 8, 1 / 9];

/** 矛盾の候補とみなす、入力値と理論値のずれ（対数の差）の下限 */
const MIN_DEVIATION = 0.1;

/** 標準スケールの中で最も近い値（比で比べるので対数で距離をとる） */
export function nearestScaleValue(value: number): number {
    return SCALE_VALUES.reduce((best, v) =>
        (Math.abs(Math.log(v / value)) < Math.abs(Math.log(best / value)) ? v : best), 1);
}

/** 矛盾の原因になっていそうな比較（上三角のセル） */
export interface InconsistentCell {
    i: number;
    j: number;
    /** 入力した値 a_ij */
    actual: number;
    /** ウエイトの比 w_i / w_j（理論値） */
    ideal: number;
    /** 理論値に最も近い標準スケールの値 */
    suggested: number;
    /** |log(a_ij) − log(w_i / w_j)| */
    deviation: number;
}

/**
 * 入力値とウエイトの比（理論値）のずれが大きい比較を、大きい順に limit 個まで返す。
 * 項目が 3 つ未満の行列は常に整合するので空になる
 */
export function findInconsistentCells(matrix: number[][], limit = 3): InconsistentCell[] {
    const n = matrix.length;
    if (n < 3) return [];
    const { weights } = analyzeMatrix(matrix);
    const cells: InconsistentCell[] = [];
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const ideal = weights[i] / weights[j];
            const deviation = Math.abs(Math.log(matrix[i][j]) - Math.log(ideal));
            if (deviation < MIN_DEVIATION) continue;
            cells.push({ i, j, actual: matrix[i][j], ideal, suggested: nearestScaleValue(ideal), deviation });
        }
    }
    return cells.sort((a, b) => b.deviation - a.deviation).slice(0, limit);
}

/** ウエイトの比 w_i / w_j を標準スケールに丸めた一対比較行列 */
function roundedMatrix(weights: number[]): number[][] {
    return weights.map((wi, i) => weights.map((wj, j) => {
        if (i === j) return 1;
        // 逆数の関係を保つため、上三角で丸めて下三角はその逆数にする
        return i < j ? nearestScaleValue(wi / wj) : 1 / nearestScaleValue(wj / wi);
    }));
}

/** ウエイトの比を縮める度合い（1: そのまま 〜 0: すべて同じ重要度） */
const COMPRESSION_STEPS = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0];

export interface ConsistentMatrix {
    matrix: number[][];
    analysis: MatrixAnalysis;
    /** ウエイトの比を縮めた度合い（1 ならウエイトの比をそのまま丸めた） */
    compression: number;
}

/**
 * ウエイトの比を標準スケールに丸めて、C.I. ≦ 0.1 の一対比較行列を作る。
 * 9 倍を超える比が丸めで 9 に押さえられて C.I. が上がるときは、ウエイトを w^α（α < 1）にして
 * 順位を保ったまま比を縮める。α = 0 ではすべて 1 になり C.I. = 0 なので、必ず整合した行列が得られる
 */
export function consistentMatrixFromWeights(weights: number[]): ConsistentMatrix {
    for (const alpha of COMPRESSION_STEPS) {
        const matrix = roundedMatrix(weights.map(w => Math.pow(w, alpha)));
        const analysis = analyzeMatrix(matrix);
        if (analysis.consistent) return { matrix, analysis, compression: alpha };
    }
    // COMPRESSION_STEPS の最後（α = 0）で必ず整合するのでここには来ない
    const matrix = roundedMatrix(weights.map(() => 1));
    return { matrix, analysis: analyzeMatrix(matrix), compression: 0 };
}

export interface AutoAdjustResult extends ConsistentMatrix {
    /** 値が変わった比較（上三角のセル）の数 */
    changed: number;
}

/**
 * 整合性の自動調整。今の行列から幾何平均法で求めたウエイトの比を標準スケールに丸め、
 * 元の評価のバランス（ウエイトの順位と比）を保ったまま C.I. ≦ 0.1 の行列にする
 */
export function autoAdjustMatrix(matrix: number[][]): AutoAdjustResult {
    const result = consistentMatrixFromWeights(analyzeMatrix(matrix).weights);
    let changed = 0;
    matrix.forEach((row, i) => row.forEach((v, j) => {
        if (i < j && Math.abs(Math.log(v / result.matrix[i][j])) > 1e-9) changed++;
    }));
    return { ...result, changed };
}

/**
 * 順位固定アシスト。項目の並び順（order[0] が 1 位）から、矛盾の無い一対比較行列を作る。
 * 1 位と最下位の比が maxRatio になるよう、順位が 1 つ下がるごとに同じ倍率でウエイトを下げる
 */
export function matrixFromRanking(order: number[], maxRatio: number): ConsistentMatrix {
    const n = order.length;
    const weights = Array<number>(n).fill(1);
    order.forEach((item, rank) => {
        weights[item] = n > 1 ? Math.pow(maxRatio, (n - 1 - rank) / (n - 1)) : 1;
    });
    return consistentMatrixFromWeights(weights);
}
