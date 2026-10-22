// 段（レイヤ）ごとに箱を並べるレイアウト。AHP のように段単位で構造が決まる図で使う

import { LINE_HEIGHT, MARGIN, MIN_NODE_WIDTH, PAD_X, PAD_Y, textWidth, wrapText } from './svg';
import type { Box, Orientation } from './svg';

/** 同じ段の箱どうしの間隔 */
const CROSS_GAP: Record<Orientation, number> = { vertical: 24, horizontal: 14 };

export interface LayerSpec {
    labels: string[];
    /** labels が空のときに仮の箱として表示する文字列 */
    placeholder: string;
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
 * 同じ段の箱は大きさを揃え、段の中では中央揃えにする。
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

    const crossTotal = Math.max(...measured.map(m => m.rowLength)) + MARGIN * 2;

    let mainPos = MARGIN;
    const layers = measured.map((m, i): Layer => {
        const start = (crossTotal - m.rowLength) / 2;
        const boxes = m.wrapped.map((lines, j): Box => {
            const crossPos = start + j * (m.cross + crossGap);
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
