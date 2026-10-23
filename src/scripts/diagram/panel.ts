// DiagramPanel コンポーネントのクライアント処理（描画・向きの切り替え・保存・コピー）

import { downloadPng, downloadSvg } from './export';
import type { Orientation, RenderedSvg } from './svg';

/** パネルに表示する図の中身。向きを受け取って SVG とコードを返す */
export interface DiagramContent {
    render: (orientation: Orientation) => RenderedSvg;
    code?: (orientation: Orientation) => string;
}

export interface DiagramPanelOptions {
    /** 保存するファイル名（拡張子なし） */
    filename: string;
    orientation?: Orientation;
    onOrientationChange?: (orientation: Orientation) => void;
}

// ---------- 保存・コピー ----------

async function copyText(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }
    // Clipboard API が使えない環境向けのフォールバック
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
}

/** ボタンの表示を一時的に変えて操作結果を知らせる */
function flashButton(btn: HTMLElement, message: string): void {
    const original = btn.dataset.label ?? btn.textContent ?? '';
    btn.dataset.label = original;
    btn.textContent = message;
    setTimeout(() => {
        btn.textContent = original;
    }, 1500);
}

// ---------- パネル ----------

/**
 * DiagramPanel コンポーネントを初期化し、描画関数を返す。
 * 返り値の関数に図の中身を渡すたびに再描画される。
 */
export function mountDiagramPanel(root: HTMLElement, options: DiagramPanelOptions): (content: DiagramContent) => void {
    const canvas = root.querySelector<HTMLElement>('[data-diagram-canvas]');
    const codeEl = root.querySelector<HTMLElement>('[data-diagram-code]');
    const orientationButtons = root.querySelectorAll<HTMLElement>('[data-diagram-orientation]');

    let orientation: Orientation = options.orientation ?? 'vertical';
    let content: DiagramContent | null = null;

    function draw(): void {
        if (!content) return;
        if (canvas) canvas.innerHTML = content.render(orientation).markup;
        if (codeEl && content.code) codeEl.textContent = content.code(orientation);
        orientationButtons.forEach(btn => {
            const active = btn.dataset.diagramOrientation === orientation;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-pressed', String(active));
        });
    }

    root.addEventListener('click', async e => {
        const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-diagram-action], [data-diagram-orientation]');
        if (!btn || !content) return;

        if (btn.dataset.diagramOrientation) {
            orientation = btn.dataset.diagramOrientation as Orientation;
            options.onOrientationChange?.(orientation);
            draw();
            return;
        }

        switch (btn.dataset.diagramAction) {
            case 'download-svg':
                downloadSvg(content.render(orientation), options.filename);
                break;
            case 'download-png':
                downloadPng(content.render(orientation), options.filename);
                break;
            case 'copy-code':
                if (!content.code) break;
                try {
                    await copyText(content.code(orientation));
                    flashButton(btn, 'コピーしました');
                } catch {
                    flashButton(btn, 'コピーに失敗しました');
                }
                break;
        }
    });

    return next => {
        content = next;
        draw();
    };
}
