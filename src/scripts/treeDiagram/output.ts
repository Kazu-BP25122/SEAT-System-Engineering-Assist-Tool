// 展開図出力画面のロジック

import { escapeHtml } from '../utils';
import { DEFAULT_TREE_DATA, loadTreeData } from './data';
import type { TreeCategory, TreeDiagramData, TreeSubCategory } from './data';

let currentData: TreeDiagramData = DEFAULT_TREE_DATA;

// ---------- HTMLツリー構築 ----------

function renderLeafList(items: string[]): string {
    if (items.length === 0) {
        return '<p class="tree-leaf-item tree-leaf-empty">(項目なし)</p>';
    }
    const lis = items.map(item => `<li class="tree-leaf-item">${escapeHtml(item)}</li>`).join('');
    return `<ul class="tree-leaf-list">${lis}</ul>`;
}

export function renderTreeHtml(data: TreeDiagramData, idPrefix: string = ''): string {
    const isDataEmpty = !data.title && data.categories.length === 0;
    if (isDataEmpty) {
        return `
            <div class="empty-diagram-message">
                <p>展開図のデータが登録されていません。</p>
                <p>${idPrefix ? 'フォームからデータを入力してください。' : '上の「← 編集に戻る」ボタンからデータを入力してください。'}</p>
            </div>
        `;
    }

    const rootHtml = `
        <div class="tree-level tree-level-1">
            <div class="tree-node tree-node-root" id="${idPrefix}node-root">
                ${escapeHtml(data.title || '（無題）')}
            </div>
        </div>
    `;

    const categoriesHtml = data.categories
        .map((cat, catIdx) => {
            const catNodeId = `${idPrefix}node-cat-${catIdx}`;

            let childrenHtml = '';
            if (cat.subCategories.length > 0) {
                // 第3層がある場合
                const subCols = cat.subCategories
                    .map((sub, subIdx) => {
                        const subNodeId = `${idPrefix}node-sub-${catIdx}-${subIdx}`;
                        const leafNodeId = `${idPrefix}node-leaf-${catIdx}-${subIdx}`;
                        return `
                        <div class="tree-column">
                            <div class="tree-node tree-node-sub" id="${subNodeId}">
                                ${escapeHtml(sub.name)}
                            </div>
                            <div class="tree-node tree-node-leaf" id="${leafNodeId}">
                                ${renderLeafList(sub.items)}
                            </div>
                        </div>
                    `;
                    })
                    .join('');

                childrenHtml = `<div class="tree-sub-wrapper">${subCols}</div>`;
            } else {
                // 第3層がなく、直接第4層の項目を持つ場合
                const leafNodeId = `${idPrefix}node-direct-leaf-${catIdx}`;
                childrenHtml = `
                    <div class="tree-direct-leaf-wrapper">
                        <div class="tree-column">
                            <div class="tree-node tree-node-leaf" id="${leafNodeId}">
                                ${renderLeafList(cat.items || [])}
                            </div>
                        </div>
                    </div>
                `;
            }

            return `
            <div class="tree-category-branch" data-cat-idx="${catIdx}">
                <div class="tree-node tree-node-cat" id="${catNodeId}">
                    ${escapeHtml(cat.name)}
                </div>
                ${childrenHtml}
            </div>
        `;
        })
        .join('');

    return `
        <div class="diagram-canvas-wrapper" id="${idPrefix}diagram-canvas-wrapper">
            <svg class="tree-svg-layer" id="${idPrefix}tree-svg-layer" xmlns="http://www.w3.org/2000/svg"></svg>
            <div class="tree-nodes-layer" id="${idPrefix}tree-nodes-layer">
                ${rootHtml}
                <div class="tree-categories-wrapper">
                    ${categoriesHtml}
                </div>
            </div>
        </div>
    `;
}

// ---------- 接続線 (SVG Lines) の描画 ----------

interface Point {
    x: number;
    y: number;
}

interface NodeBounds {
    topCenter: Point;
    bottomCenter: Point;
    rect: DOMRect;
}

function getNodeBounds(el: HTMLElement, wrapperRect: DOMRect): NodeBounds {
    const r = el.getBoundingClientRect();
    const x = r.left - wrapperRect.left;
    const y = r.top - wrapperRect.top;
    return {
        topCenter: { x: x + r.width / 2, y },
        bottomCenter: { x: x + r.width / 2, y: y + r.height },
        rect: r,
    };
}

/** 直角分岐コネクタ（親の底面中央 → 子ノード群の上面中央） */
function createBranchPath(parentBottom: Point, childrenTops: Point[]): string {
    if (childrenTops.length === 0) return '';

    // 子が1つの場合：まっすぐ直線で結ぶ
    if (childrenTops.length === 1) {
        const child = childrenTops[0];
        const midY = (parentBottom.y + child.y) / 2;
        if (Math.abs(parentBottom.x - child.x) < 1) {
            return `M ${parentBottom.x} ${parentBottom.y} L ${child.x} ${child.y}`;
        }
        return `M ${parentBottom.x} ${parentBottom.y} V ${midY} H ${child.x} V ${child.y}`;
    }

    // 複数子ノードの場合
    const childMinY = Math.min(...childrenTops.map(p => p.y));
    const midY = (parentBottom.y + childMinY) / 2;
    const minX = Math.min(...childrenTops.map(p => p.x));
    const maxX = Math.max(...childrenTops.map(p => p.x));

    let path = `M ${parentBottom.x} ${parentBottom.y} V ${midY} `;
    path += `M ${minX} ${midY} H ${maxX} `;

    for (const child of childrenTops) {
        path += `M ${child.x} ${midY} V ${child.y} `;
    }

    return path;
}

/** 垂直直線コネクタ（親の底面中央 → 単一の子ノードの上面中央） */
function createDirectLinePath(parentBottom: Point, childTop: Point): string {
    return `M ${parentBottom.x} ${parentBottom.y} L ${childTop.x} ${childTop.y}`;
}

export function drawConnections(data: TreeDiagramData = currentData, idPrefix: string = ''): void {
    const wrapper = document.getElementById(`${idPrefix}diagram-canvas-wrapper`);
    const svg = document.getElementById(`${idPrefix}tree-svg-layer`) as SVGSVGElement | null;
    if (!wrapper || !svg) return;

    const wrapperRect = wrapper.getBoundingClientRect();
    if (wrapperRect.width === 0 || wrapperRect.height === 0) return;

    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('width', `${wrapperRect.width}`);
    svg.setAttribute('height', `${wrapperRect.height}`);
    svg.setAttribute('viewBox', `0 0 ${wrapperRect.width} ${wrapperRect.height}`);

    let pathData = '';

    // 1. ルートノードから第2層（カテゴリ群）への接続線
    const rootEl = document.getElementById(`${idPrefix}node-root`);
    const catEls = data.categories
        .map((_, idx) => document.getElementById(`${idPrefix}node-cat-${idx}`))
        .filter((el): el is HTMLElement => el !== null);

    if (rootEl && catEls.length > 0) {
        const rootBounds = getNodeBounds(rootEl, wrapperRect);
        const catTops = catEls.map(el => getNodeBounds(el, wrapperRect).topCenter);
        pathData += createBranchPath(rootBounds.bottomCenter, catTops) + ' ';
    }

    // 2. 各カテゴリから第3層（サブカテゴリ群）または第4層直下への接続線
    data.categories.forEach((cat, catIdx) => {
        const catEl = document.getElementById(`${idPrefix}node-cat-${catIdx}`);
        if (!catEl) return;
        const catBounds = getNodeBounds(catEl, wrapperRect);

        if (cat.subCategories.length > 0) {
            // 第3層への接続
            const subEls = cat.subCategories
                .map((_, subIdx) => document.getElementById(`${idPrefix}node-sub-${catIdx}-${subIdx}`))
                .filter((el): el is HTMLElement => el !== null);

            if (subEls.length > 0) {
                const subTops = subEls.map(el => getNodeBounds(el, wrapperRect).topCenter);
                pathData += createBranchPath(catBounds.bottomCenter, subTops) + ' ';
            }

            // 3. 各第3層から直下の第4層（箇条書き）への接続線（垂直直線）
            cat.subCategories.forEach((_, subIdx) => {
                const subEl = document.getElementById(`${idPrefix}node-sub-${catIdx}-${subIdx}`);
                const leafEl = document.getElementById(`${idPrefix}node-leaf-${catIdx}-${subIdx}`);
                if (subEl && leafEl) {
                    const subBounds = getNodeBounds(subEl, wrapperRect);
                    const leafBounds = getNodeBounds(leafEl, wrapperRect);
                    pathData += createDirectLinePath(subBounds.bottomCenter, leafBounds.topCenter) + ' ';
                }
            });
        } else {
            // 直下の箇条書きへの接続
            const leafEl = document.getElementById(`${idPrefix}node-direct-leaf-${catIdx}`);
            if (leafEl) {
                const leafBounds = getNodeBounds(leafEl, wrapperRect);
                pathData += createDirectLinePath(catBounds.bottomCenter, leafBounds.topCenter) + ' ';
            }
        }
    });

    svg.innerHTML = `
        <path d="${pathData}" stroke="#000000" stroke-width="2" fill="none" stroke-linecap="square" stroke-linejoin="miter" />
    `;
}

// ---------- テキスト折り返し処理 ----------

/**
 * テキストを最大幅に合わせて複数行に分割する（日本語・英語混在対応）
 */
function getWrappedLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    if (!text) return [];
    const lines: string[] = [];
    const paragraphs = text.split('\n');

    for (const paragraph of paragraphs) {
        if (!paragraph) {
            lines.push('');
            continue;
        }

        let currentLine = '';
        for (let i = 0; i < paragraph.length; i++) {
            const char = paragraph[i];
            const testLine = currentLine + char;
            const metrics = ctx.measureText(testLine);

            if (metrics.width > maxWidth && currentLine.length > 0) {
                // 句読点等の行頭禁則文字
                const noStartChars = '、。，．）]｝?!！？';
                if (noStartChars.includes(char)) {
                    currentLine += char;
                    lines.push(currentLine);
                    currentLine = '';
                    continue;
                }

                lines.push(currentLine);
                currentLine = char;
            } else {
                currentLine = testLine;
            }
        }
        if (currentLine) {
            lines.push(currentLine);
        }
    }

    return lines;
}

// ---------- 画像エクスポート (PNG) ----------

function exportToPng(): void {
    const wrapper = document.getElementById('diagram-canvas-wrapper');
    if (!wrapper) return;

    // 接続線を最新に更新
    drawConnections();

    const wrapperRect = wrapper.getBoundingClientRect();
    const padding = 30;
    const scale = 2; // 高解像度（Retina対応）

    const canvas = document.createElement('canvas');
    canvas.width = (wrapperRect.width + padding * 2) * scale;
    canvas.height = (wrapperRect.height + padding * 2) * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(scale, scale);

    // 背景を白で塗りつぶす
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, wrapperRect.width + padding * 2, wrapperRect.height + padding * 2);

    // 全体を padding 分オフセット
    ctx.translate(padding, padding);

    // 1. SVG 接続線を Canvas に描画
    const svgEl = document.getElementById('tree-svg-layer');
    if (svgEl) {
        svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        const svgString = new XMLSerializer().serializeToString(svgEl);
        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const URL = window.URL || window.webkitURL || window;
        const blobURL = URL.createObjectURL(svgBlob);
        const img = new Image();

        img.onload = () => {
            ctx.drawImage(img, 0, 0, wrapperRect.width, wrapperRect.height);
            URL.revokeObjectURL(blobURL);

            // 2. 各ノードを描画
            renderNodesToCanvas(ctx, wrapperRect);

            // 3. ダウンロード実行
            downloadCanvas(canvas, `${currentData.title || '展開図'}.png`);
        };

        img.onerror = () => {
            // SVG画像ロードに失敗した場合でもノードを描画
            renderNodesToCanvas(ctx, wrapperRect);
            downloadCanvas(canvas, `${currentData.title || '展開図'}.png`);
        };

        img.src = blobURL;
    } else {
        renderNodesToCanvas(ctx, wrapperRect);
        downloadCanvas(canvas, `${currentData.title || '展開図'}.png`);
    }
}

/** 各 DOM ノードを Canvas に直接描画して高品位に仕上げる（折り返し対応） */
function renderNodesToCanvas(ctx: CanvasRenderingContext2D, wrapperRect: DOMRect): void {
    const nodes = document.querySelectorAll<HTMLElement>('.tree-node');
    const fontStack = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif';

    nodes.forEach(node => {
        const r = node.getBoundingClientRect();
        const x = r.left - wrapperRect.left;
        const y = r.top - wrapperRect.top;
        const w = r.width;
        const h = r.height;

        // ノードの矩形（白背景・黒枠2px）
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);

        ctx.fillStyle = '#000000';

        if (node.classList.contains('tree-node-root')) {
            // 第1層（ルート）
            const fontSize = 17;
            ctx.font = `bold ${fontSize}px ${fontStack}`;
            const maxTextWidth = Math.max(w - 32, 20); // 左右パディング考慮
            const text = node.innerText.trim();
            const lines = getWrappedLines(ctx, text, maxTextWidth);

            const lineHeight = Math.round(fontSize * 1.35);
            const totalH = lines.length * lineHeight;
            const startY = y + (h - totalH) / 2 + lineHeight / 2;

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            lines.forEach((line, idx) => {
                ctx.fillText(line, x + w / 2, startY + idx * lineHeight);
            });
        } else if (node.classList.contains('tree-node-cat')) {
            // 第2層（大項目）
            const fontSize = 15;
            ctx.font = `bold ${fontSize}px ${fontStack}`;
            const maxTextWidth = Math.max(w - 28, 20);
            const text = node.innerText.trim();
            const lines = getWrappedLines(ctx, text, maxTextWidth);

            const lineHeight = Math.round(fontSize * 1.35);
            const totalH = lines.length * lineHeight;
            const startY = y + (h - totalH) / 2 + lineHeight / 2;

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            lines.forEach((line, idx) => {
                ctx.fillText(line, x + w / 2, startY + idx * lineHeight);
            });
        } else if (node.classList.contains('tree-node-sub')) {
            // 第3層（中項目）
            const fontSize = 14;
            ctx.font = `bold ${fontSize}px ${fontStack}`;
            const maxTextWidth = Math.max(w - 24, 20);
            const text = node.innerText.trim();
            const lines = getWrappedLines(ctx, text, maxTextWidth);

            const lineHeight = Math.round(fontSize * 1.35);
            const totalH = lines.length * lineHeight;
            const startY = y + (h - totalH) / 2 + lineHeight / 2;

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            lines.forEach((line, idx) => {
                ctx.fillText(line, x + w / 2, startY + idx * lineHeight);
            });
        } else if (node.classList.contains('tree-node-leaf')) {
            // 第4層（箇条書き詳細項目リスト）
            const fontSize = 13;
            ctx.font = `${fontSize}px ${fontStack}`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';

            const items = node.querySelectorAll<HTMLElement>('.tree-leaf-item');
            const paddingLeft = 14;
            const bulletWidth = 14;
            const paddingRight = 14;
            const maxTextWidth = Math.max(w - paddingLeft - bulletWidth - paddingRight, 20);
            const lineHeight = 19;

            items.forEach(item => {
                let text = item.innerText.trim();
                if (text.startsWith('・')) {
                    text = text.substring(1).trim();
                }

                // DOM 上の正確な Y 座標を取得
                const itemR = item.getBoundingClientRect();
                const itemY = itemR.top - wrapperRect.top;

                // 中黒（・）の描画
                ctx.fillText('・', x + paddingLeft, itemY);

                // テキストの折り返し描画（2行目以降もインデントを揃える）
                const lines = getWrappedLines(ctx, text, maxTextWidth);
                const textX = x + paddingLeft + bulletWidth;

                lines.forEach((line, lineIdx) => {
                    ctx.fillText(line, textX, itemY + lineIdx * lineHeight);
                });
            });
        }
    });
}

function downloadCanvas(canvas: HTMLCanvasElement, filename: string): void {
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ---------- 初期化 ----------

export function initTreeDiagramOutput(): void {
    try {
        currentData = loadTreeData(DEFAULT_TREE_DATA);

        const container = document.getElementById('diagram-container');
        if (!container) return;

        container.innerHTML = renderTreeHtml(currentData);

        const isDataEmpty = !currentData.title && currentData.categories.length === 0;
        const exportBtn = document.getElementById('export-png-btn') as HTMLButtonElement | null;
        const printBtn = document.getElementById('print-btn') as HTMLButtonElement | null;

        if (isDataEmpty) {
            if (exportBtn) exportBtn.disabled = true;
            if (printBtn) printBtn.disabled = true;
            return;
        }

        // レイアウト確定後にSVG接続線を描画
        requestAnimationFrame(() => {
            drawConnections();
        });
        setTimeout(drawConnections, 50);
        setTimeout(drawConnections, 200);

        // フォント読み込み完了時にも再描画
        if ('fonts' in document) {
            document.fonts.ready.then(() => {
                drawConnections();
            });
        }

        // リサイズやフォントロード完了時にも再描画
        window.addEventListener('resize', () => drawConnections());
        window.addEventListener('load', () => drawConnections());

        // 操作ボタンのバインド
        exportBtn?.addEventListener('click', exportToPng);
        printBtn?.addEventListener('click', () => window.print());
    } catch (error) {
        console.error('展開図の描画に失敗しました:', error);
        const container = document.getElementById('diagram-container');
        if (container) {
            container.innerText = '展開図の読み込みに失敗しました。';
        }
    }
}
