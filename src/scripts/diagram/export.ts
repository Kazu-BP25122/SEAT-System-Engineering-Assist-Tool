// 図（SVG）を SVG / PNG ファイルとして保存する処理

import type { RenderedSvg } from './svg';

/** PNG に書き出すときの拡大率（高解像度の画面や印刷でぼやけないように） */
const PNG_SCALE = 2;

function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export function downloadSvg(svg: RenderedSvg, filename: string): void {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${svg.markup}`;
    downloadBlob(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }), `${filename}.svg`);
}

export function downloadPng(svg: RenderedSvg, filename: string): void {
    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = svg.width * PNG_SCALE;
        canvas.height = svg.height * PNG_SCALE;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
            if (blob) downloadBlob(blob, `${filename}.png`);
        }, 'image/png');
    };
    img.onerror = () => alert('PNG への変換に失敗しました。');
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.markup)}`;
}
