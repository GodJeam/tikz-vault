import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { EditorState } from "@codemirror/state";
import type TikzVaultPlugin from "./main";

const TIKZ_LANG = /^```(tikz|tikzcd|pgfplots)(\s|$)/i;
const CLOSING_FENCE = /^```\s*$/;

interface TikzBlock {
  from: number;
  to: number;
  fromLine: number;
  toLine: number;
  code: string;
}

function findTikzBlocks(state: EditorState): TikzBlock[] {
  const blocks: TikzBlock[] = [];
  const doc = state.doc;

  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    if (!TIKZ_LANG.test(line.text.trim())) continue;

    let closeLine = 0;
    for (let k = n + 1; k <= doc.lines; k++) {
      const l = doc.line(k);
      if (CLOSING_FENCE.test(l.text.trim())) {
        closeLine = k;
        break;
      }
      if (k - n > 5000) break;
    }

    if (closeLine) {
      const from = doc.line(n).from;
      const to = doc.line(closeLine).to;
      const codeLines: string[] = [];
      for (let x = n + 1; x < closeLine; x++) {
        codeLines.push(doc.line(x).text);
      }
      const code = codeLines.join("\n").trim();
      if (code) blocks.push({ from, to, fromLine: n, toLine: closeLine, code });
      n = closeLine;
    }
  }

  return blocks;
}

class TikzPreviewWidget extends WidgetType {
  private destroyed = false;

  constructor(
    readonly code: string,
    private renderFn: (code: string) => Promise<string>,
    private t: (s: string) => string
  ) {
    super();
  }

  eq(other: TikzPreviewWidget): boolean {
    return other.code === this.code;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "tikz-live";

    const status = document.createElement("div");
    status.className = "tikz-status";
    status.textContent = this.t("Rendering TikZ...");
    wrap.appendChild(status);

    // The code is hidden by default and revealed on hover.
    const source = document.createElement("pre");
    source.className = "tikz-source";
    source.textContent = this.code;
    wrap.appendChild(source);

    this.renderFn(this.code)
      .then((svg) => {
        if (this.destroyed) return;
        wrap.replaceChildren();
        const fig = document.createElement("div");
        fig.className = "tikz-figure";
        fig.innerHTML = svg;
        wrap.appendChild(fig);
        const src2 = document.createElement("pre");
        src2.className = "tikz-source";
        src2.textContent = this.code;
        wrap.appendChild(src2);
      })
      .catch((err) => {
        if (this.destroyed) return;
        wrap.replaceChildren();
        const errBox = document.createElement("div");
        errBox.className = "tikz-error";
        const title = document.createElement("div");
        title.className = "tikz-error-title";
        title.textContent = this.t("TikZ rendering error");
        errBox.appendChild(title);
        const pre = document.createElement("pre");
        pre.className = "tikz-error-msg";
        pre.textContent = err instanceof Error ? err.message : String(err);
        errBox.appendChild(pre);
        wrap.appendChild(errBox);
        const src2 = document.createElement("pre");
        src2.className = "tikz-source";
        src2.textContent = this.code;
        wrap.appendChild(src2);
      });

    return wrap;
  }

  destroy(): void {
    this.destroyed = true;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function computeDecorations(state: EditorState, plugin: TikzVaultPlugin) {
  if (!plugin.settings.tikzEnabled || !plugin.settings.tikzLivePreview) return Decoration.none;
  const builder = new RangeSetBuilder<Decoration>();
  const render = (code: string) => plugin.tikzRenderer.render(code);
  try {
    for (const block of findTikzBlocks(state)) {
      // Hide the code fence lines in Edit mode (the image widget below shows
      // the rendering; the code is revealed on hover via the widget).
      for (let k = block.fromLine; k <= block.toLine; k++) {
        const pos = state.doc.line(k).from;
        builder.add(pos, pos, Decoration.line({ class: "tikz-code-hidden" }));
      }
      builder.add(
        block.to,
        block.to,
        Decoration.widget({ widget: new TikzPreviewWidget(block.code, render, plugin.t), block: true, side: 1 })
      );
    }
  } catch (e) {
    console.error("tikz-vault: error building TikZ decorations:", e);
  }
  return builder.finish();
}

const tikzRecalcEffect = StateEffect.define<null>();

export function tikzPreviewExtension(plugin: TikzVaultPlugin) {
  const field = StateField.define({
    create(state: EditorState) {
      return computeDecorations(state, plugin);
    },
    update(decorations, tr) {
      let next = decorations;
      for (const e of tr.effects) {
        if (e.is(tikzRecalcEffect)) {
          next = computeDecorations(tr.state, plugin);
        }
      }
      if (tr.docChanged) {
        next = computeDecorations(tr.state, plugin);
      }
      return next;
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  return [
    field,
    EditorView.updateListener.of((update) => {
      if (update.viewportChanged) {
        update.view.dispatch({ effects: tikzRecalcEffect.of(null) });
      }
    }),
  ];
}