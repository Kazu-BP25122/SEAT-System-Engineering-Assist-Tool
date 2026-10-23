// 作業一覧表（WBS）の出力画面ロジックおよびHTML/SVG生成

import { escapeHtml } from '../utils';
import { downloadPng, downloadSvg } from '../diagram/export';
import { renderTablesSvg } from '../diagram/table';
import type { RenderedSvg } from '../diagram/svg';
import { flattenWbsData, loadWbsData, SAMPLE_WBS_DATA } from './data';
import type { WbsData } from './data';

/** 作業一覧表の HTML テーブル文字列を生成する */
export function createWbsTableHtml(data: WbsData): string {
    const timeUnit = data.timeUnit ? `〔${escapeHtml(data.timeUnit)}〕` : '';
    const captionText = [escapeHtml(data.tableNumber), escapeHtml(data.title)].filter(Boolean).join('　');
    const flatItems = flattenWbsData(data);

    if (flatItems.length === 0) {
        return '<p class="empty-table-text">作業項目が登録されていません。入力画面から追加してください。</p>';
    }

    const rowsHtml = flatItems.map(item => {
        const rowClass = item.isParent ? 'wbs-row wbs-parent-row' : 'wbs-row';
        const indentClass = item.depth > 0 ? `wbs-name-indent depth-${Math.min(item.depth, 3)}` : '';

        return `
            <tr class="${rowClass}">
                <td class="wbs-cell-number">${escapeHtml(item.wbs)}</td>
                <td class="wbs-cell-name ${indentClass}">${escapeHtml(item.name)}</td>
                <td class="wbs-cell-symbol">${escapeHtml(item.symbol)}</td>
                <td class="wbs-cell-predecessors">${escapeHtml(item.predecessors)}</td>
                <td class="wbs-cell-duration">${escapeHtml(item.duration)}</td>
            </tr>
        `;
    }).join('');

    return `
        <div class="wbs-table-wrapper">
            ${captionText ? `<div class="wbs-table-caption">${captionText}</div>` : ''}
            <table class="wbs-table">
                <thead>
                    <tr>
                        <th class="wbs-th-number">WBS 番号</th>
                        <th class="wbs-th-name">作業の名称</th>
                        <th class="wbs-th-symbol">記 号</th>
                        <th class="wbs-th-predecessors">先行作業</th>
                        <th class="wbs-th-duration">所要時間${timeUnit}</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        </div>
    `;
}

/** Markdown形式のテキストに変換する */
export function createWbsMarkdown(data: WbsData): string {
    const timeUnit = data.timeUnit ? `〔${data.timeUnit}〕` : '';
    const title = [data.tableNumber, data.title].filter(Boolean).join(' ');
    const flatItems = flattenWbsData(data);
    const lines: string[] = [];

    if (title) {
        lines.push(`### ${title}`, '');
    }
    lines.push(`| WBS 番号 | 作業の名称 | 記号 | 先行作業 | 所要時間${timeUnit} |`);
    lines.push('|:---|:---|:---:|:---:|:---:|');
    flatItems.forEach(item => {
        const indent = '  '.repeat(item.depth);
        lines.push(`| ${item.wbs} | ${indent}${item.name} | ${item.symbol} | ${item.predecessors} | ${item.duration} |`);
    });
    return lines.join('\n');
}

/** TSV（Excel等にそのまま貼れる形式）に変換する */
export function createWbsTsv(data: WbsData): string {
    const timeUnit = data.timeUnit ? `〔${data.timeUnit}〕` : '';
    const flatItems = flattenWbsData(data);
    const lines: string[] = [];
    lines.push(`WBS 番号\t作業の名称\t記号\t先行作業\t所要時間${timeUnit}`);
    flatItems.forEach(item => {
        lines.push(`${item.wbs}\t${item.name}\t${item.symbol}\t${item.predecessors}\t${item.duration}`);
    });
    return lines.join('\n');
}

/** 表を SVG オブジェクトとして描画する */
export function renderWbsSvg(data: WbsData): RenderedSvg {
    const timeUnit = data.timeUnit ? `〔${data.timeUnit}〕` : '';
    const caption = [data.tableNumber, data.title].filter(Boolean).join(' ');
    const flatItems = flattenWbsData(data);

    const rows = flatItems.map(item => {
        const indent = '　'.repeat(item.depth);
        return {
            cells: [
                item.wbs,
                `${indent}${item.name}`,
                item.symbol,
                item.predecessors,
                item.duration,
            ],
            kind: item.isParent ? ('total' as const) : undefined,
        };
    });

    return renderTablesSvg([
        {
            tables: [
                {
                    caption,
                    head: ['WBS 番号', '作業の名称', '記 号', '先行作業', `所要時間${timeUnit}`],
                    rows,
                },
            ],
        },
    ]);
}

/** 出力ページの初期化処理 */
export function initWbsOutput(): void {
    const container = document.getElementById('table-container');
    if (!container) return;

    let wbsData: WbsData;
    try {
        wbsData = loadWbsData(SAMPLE_WBS_DATA);
    } catch (e) {
        console.error('作業一覧表データの読み込みに失敗しました:', e);
        container.innerText = 'データの読み込みに失敗しました。';
        return;
    }

    container.innerHTML = createWbsTableHtml(wbsData);

    // SVG 保存ボタン
    const svgBtn = document.getElementById('download-svg-btn');
    if (svgBtn) {
        svgBtn.addEventListener('click', () => {
            const svg = renderWbsSvg(wbsData);
            const filename = (wbsData.title || 'wbs_table').replace(/\s+/g, '_');
            downloadSvg(svg, filename);
        });
    }

    // PNG 保存ボタン
    const pngBtn = document.getElementById('download-png-btn');
    if (pngBtn) {
        pngBtn.addEventListener('click', () => {
            const svg = renderWbsSvg(wbsData);
            const filename = (wbsData.title || 'wbs_table').replace(/\s+/g, '_');
            downloadPng(svg, filename);
        });
    }

    // Markdown コピーボタン
    const copyMdBtn = document.getElementById('copy-md-btn');
    if (copyMdBtn) {
        copyMdBtn.addEventListener('click', async () => {
            const md = createWbsMarkdown(wbsData);
            await navigator.clipboard.writeText(md);
            const originalText = copyMdBtn.innerText;
            copyMdBtn.innerText = 'コピー完了！';
            setTimeout(() => {
                copyMdBtn.innerText = originalText;
            }, 2000);
        });
    }

    // TSV コピーボタン
    const copyTsvBtn = document.getElementById('copy-tsv-btn');
    if (copyTsvBtn) {
        copyTsvBtn.addEventListener('click', async () => {
            const tsv = createWbsTsv(wbsData);
            await navigator.clipboard.writeText(tsv);
            const originalText = copyTsvBtn.innerText;
            copyTsvBtn.innerText = 'コピー完了！';
            setTimeout(() => {
                copyTsvBtn.innerText = originalText;
            }, 2000);
        });
    }

    // 印刷ボタン
    const printBtn = document.getElementById('print-btn');
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            window.print();
        });
    }
}
