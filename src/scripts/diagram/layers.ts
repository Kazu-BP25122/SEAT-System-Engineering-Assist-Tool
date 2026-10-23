// 段（レイヤ）ごとに箱を並べるレイアウト。AHP のように段単位で構造が決まる図で使う

import { LINE_HEIGHT, MARGIN, MIN_NODE_WIDTH, PAD_X, PAD_Y, textWidth, wrapText } from './svg';
import type { Box, Orientation } from './svg';

/** 同じ段の箱どうしの間隔 */
const CROSS_GAP: Record<Orientation, number> = { vertical: 24, horizontal: 14 };
/** groupSizes でまとめた箱のまとまりどうしの間隔（同じ段の箱どうしの間隔に対する倍率） */
const GROUP_GAP_RATIO = 2;

export interface LayerSpec {
    labels: string[];
    /** labels が空のときに仮の箱として表示する文字列 */
    placeholder: string;
    /**
     * 指定すると、この段の箱を前の段の各箱の下にまとめて並べる（木構造）。
     * groupSizes[k] は前の段の k 番目の箱に属する箱の数で、合計は labels の数と一致させる。
     * 前の段の箱は、それぞれのまとまりの中央に置かれる。
     */
    groupSizes?: number[];
}

export interface Layer {
    boxes: Box[];
    placeholder: boolean;
}

export interface LayersLayout {
    width: number;
    height: number;
    layers: Layer[];
}

/**
 * 段を縦向きなら上から下、横向きなら左から右へ並べる。
 * 同じ段の箱は大きさを揃え、段の中では中央揃えにする（groupSizes を指定した段は親の下にまとめる）。
 * @param gaps 段と段の間隔（gaps[i] は i 段目と i+1 段目の間）
 */
export function layoutLayers(specs: LayerSpec[], orientation: Orientation, gaps: number[]): LayersLayout {
    const vertical = orientation === 'vertical';
    const crossGap = CROSS_GAP[orientation];

    const measured = specs.map(spec => {
        const placeholder = spec.labels.length === 0;
        const wrapped = (placeholder ? [spec.placeholder] : spec.labels).map(label => wrapText(label));
        const w = Math.max(MIN_NODE_WIDTH, Math.max(...wrapped.flat().map(textWidth)) + PAD_X * 2);
        const h = Math.max(...wrapped.map(lines => lines.length)) * LINE_HEIGHT + PAD_Y * 2;
        // main: 段が進む方向の大きさ, cross: 段の中で箱が並ぶ方向の大きさ
        const main = vertical ? h : w;
        const cross = vertical ? w : h;
        const rowLength = wrapped.length * cross + (wrapped.length - 1) * crossGap;
        return { wrapped, placeholder, w, h, main, cross, rowLength };
    });

    // 段の中での各箱の位置（段の先頭からの距離）と段の長さ。まずは等間隔に並べる
    const offsets = measured.map(m => m.wrapped.map((_, j) => j * (m.cross + crossGap)));
    const lengths = measured.map(m => m.rowLength);

    // groupSizes のある段は、前の段の箱ごとに「まとまり」を作り、親と子をまとまりの中央に揃える
    specs.forEach((spec, i) => {
        const sizes = spec.groupSizes;
        const parent = measured[i - 1];
        const child = measured[i];
        if (!sizes || !parent || parent.placeholder || child.placeholder) return;
        if (sizes.length !== parent.wrapped.length || sizes.reduce((s, n) => s + n, 0) !== child.wrapped.length) return;

        const groupGap = crossGap * GROUP_GAP_RATIO;
        const parentOffsets: number[] = [];
        const childOffsets: number[] = [];
        let pos = 0;
        sizes.forEach(size => {
            const childLength = size > 0 ? size * child.cross + (size - 1) * crossGap : 0;
            const slot = Math.max(parent.cross, childLength);
            parentOffsets.push(pos + (slot - parent.cross) / 2);
            const start = pos + (slot - childLength) / 2;
            for (let c = 0; c < size; c++) childOffsets.push(start + c * (child.cross + crossGap));
            pos += slot + groupGap;
        });
        offsets[i - 1] = parentOffsets;
        offsets[i] = childOffsets;
        lengths[i - 1] = lengths[i] = pos - groupGap;
    });

    const crossTotal = Math.max(...lengths) + MARGIN * 2;

    let mainPos = MARGIN;
    const layers = measured.map((m, i): Layer => {
        const start = (crossTotal - lengths[i]) / 2;
        const boxes = m.wrapped.map((lines, j): Box => {
            const crossPos = start + offsets[i][j];
            const [x, y] = vertical ? [crossPos, mainPos] : [mainPos, crossPos];
            return { x, y, w: m.w, h: m.h, lines, placeholder: m.placeholder };
        });
        mainPos += m.main + (gaps[i] ?? 0);
        return { boxes, placeholder: m.placeholder };
    });

    const mainTotal = mainPos + MARGIN;
    return vertical
        ? { width: crossTotal, height: mainTotal, layers }
        : { width: mainTotal, height: crossTotal, layers };
}
