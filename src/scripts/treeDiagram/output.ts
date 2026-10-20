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

function renderTreeHtml(data: TreeDiagramData): string {
    const rootHtml = `
        <div class="tree-level tree-level-1">
            <div class="tree-node tree-node-root" id="node-root">
                ${escapeHtml(data.title)}
            </div>
        </div>
    `;

    const categoriesHtml = data.categories
        .map((cat, catIdx) => {
            const catNodeId = `node-cat-${catIdx}`;

            let childrenHtml = '';
            if (cat.subCategories.length > 0) {
                // 第3層がある場合
                const subCols = cat.subCategories
                    .map((sub, subIdx) => {
                        const subNodeId = `node-sub-${catIdx}-${subIdx}`;
                        const leafNodeId = `node-leaf-${catIdx}-${subIdx}`;
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
                const leafNodeId = `node-direct-leaf-${catIdx}`;
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
        <div class="diagram-canvas-wrapper" id="diagram-canvas-wrapper">
            <svg class="tree-svg-layer" id="tree-svg-layer"></svg>
            <div class="tree-nodes-layer" id="tree-nodes-layer">
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

export function drawConnections(): void {
    const wrapper = document.getElementById('diagram-canvas-wrapper');
    const svg = document.getElementById('tree-svg-layer') as SVGSVGElement | null;
    if (!wrapper || !svg) return;

    const wrapperRect = wrapper.getBoundingClientRect();
    svg.setAttribute('width', `${wrapperRect.width}`);
    svg.setAttribute('height', `${wrapperRect.height}`);
    svg.setAttribute('viewBox', `0 0 ${wrapperRect.width} ${wrapperRect.height}`);

    let pathData = '';

    // 1. ルートノードから第2層（カテゴリ群）への接続線
    const rootEl = document.getElementById('node-root');
    const catEls = currentData.categories
        .map((_, idx) => document.getElementById(`node-cat-${idx}`))
        .filter((el): el is HTMLElement => el !== null);

    if (rootEl && catEls.length > 0) {
        const rootBounds = getNodeBounds(rootEl, wrapperRect);
        const catTops = catEls.map(el => getNodeBounds(el, wrapperRect).topCenter);
        pathData += createBranchPath(rootBounds.bottomCenter, catTops) + ' ';
    }

    // 2. 各カテゴリから第3層（サブカテゴリ群）または第4層直下への接続線
    currentData.categories.forEach((cat, catIdx) => {
        const catEl = document.getElementById(`node-cat-${catIdx}`);
        if (!catEl) return;
        const catBounds = getNodeBounds(catEl, wrapperRect);

        if (cat.subCategories.length > 0) {
            // 第3層への接続
            const subEls = cat.subCategories
                .map((_, subIdx) => document.getElementById(`node-sub-${catIdx}-${subIdx}`))
                .filter((el): el is HTMLElement => el !== null);

            if (subEls.length > 0) {
                const subTops = subEls.map(el => getNodeBounds(el, wrapperRect).topCenter);
                pathData += createBranchPath(catBounds.bottomCenter, subTops) + ' ';
            }

            // 3. 各第3層から直下の第4層（箇条書き）への接続線（垂直直線）
            cat.subCategories.forEach((_, subIdx) => {
                const subEl = document.getElementById(`node-sub-${catIdx}-${subIdx}`);
                const leafEl = document.getElementById(`node-leaf-${catIdx}-${subIdx}`);
                if (subEl && leafEl) {
                    const subBounds = getNodeBounds(subEl, wrapperRect);
                    const leafBounds = getNodeBounds(leafEl, wrapperRect);
                    pathData += createDirectLinePath(subBounds.bottomCenter, leafBounds.topCenter) + ' ';
                }
            });
        } else {
            // 直下の箇条書きへの接続
            const leafEl = document.getElementById(`node-direct-leaf-${catIdx}`);
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
            // SVG画像ロードに失敗した場合でもノードのみは描画
            renderNodesToCanvas(ctx, wrapperRect);
            downloadCanvas(canvas, `${currentData.title || '展開図'}.png`);
        };

        img.src = blobURL;
    }
}

/** 各 DOM ノードを Canvas に直接描画して高品位に仕上げる */
function renderNodesToCanvas(ctx: CanvasRenderingContext2D, wrapperRect: DOMRect): void {
    const nodes = document.querySelectorAll<HTMLElement>('.tree-node');

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

        // テキストの描画
        ctx.fillStyle = '#000000';

        if (node.classList.contains('tree-node-root')) {
            ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(node.innerText.trim(), x + w / 2, y + h / 2);
        } else if (node.classList.contains('tree-node-cat')) {
            ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(node.innerText.trim(), x + w / 2, y + h / 2);
        } else if (node.classList.contains('tree-node-sub')) {
            ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(node.innerText.trim(), x + w / 2, y + h / 2);
        } else if (node.classList.contains('tree-node-leaf')) {
            ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';

            const items = node.querySelectorAll<HTMLElement>('.tree-leaf-item');
            const lineHeight = 22;
            let currentY = y + 12;

            items.forEach(item => {
                const text = item.innerText.trim();
                // 中黒付きで描画
                ctx.fillText(`・${text}`, x + 12, currentY);
                currentY += lineHeight;
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
        window.addEventListener('resize', drawConnections);
        window.addEventListener('load', drawConnections);

        // 操作ボタンのバインド
        document.getElementById('export-png-btn')?.addEventListener('click', exportToPng);
        document.getElementById('print-btn')?.addEventListener('click', () => window.print());
    } catch (error) {
        console.error('展開図の描画に失敗しました:', error);
        const container = document.getElementById('diagram-container');
        if (container) {
            container.innerText = '展開図の読み込みに失敗しました。';
        }
    }
}
