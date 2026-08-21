import { Plugin } from "obsidian";
import { TikzRenderer } from "./tikzRenderer";
import { tikzPreviewExtension } from "./tikzPreview";
import { DEFAULT_SETTINGS, TikzSettingTab, TikzSettings } from "./settings";

export default class TikzVaultPlugin extends Plugin {
  settings!: TikzSettings;
  tikzRenderer!: TikzRenderer;

  async onload(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.tikzRenderer = new TikzRenderer(this);

    this.registerEditorExtension(tikzPreviewExtension(this));

    this.registerMarkdownPostProcessor(
      async (el) => {
        if (!this.settings.tikzEnabled) return;
        try {
          const candidates = Array.from(
            el.querySelectorAll<HTMLElement>(
              "pre > code.language-tikz, pre > code.language-tikzcd, pre > code.language-pgfplots"
            )
          );
          for (const codeEl of candidates) {
            try {
              const pre = codeEl.parentElement as HTMLElement | null;
              if (!pre) continue;
              const code = codeEl.innerText;
              const container = this.buildTikzContainer(code);
              pre.replaceWith(container);
              await this.fillTikzContainer(container, code);
            } catch (e) {
              console.error("tikz-vault: errore nel post-processor TikZ:", e);
            }
          }
        } catch (e) {
          console.error("tikz-vault: errore nel post-processor TikZ:", e);
        }
      },
      -1000
    );

    this.addSettingTab(new TikzSettingTab(this.app, this));
  }

  onunload(): void {}

  private buildTikzContainer(code: string): HTMLElement {
    const container = document.createElement("div");
    container.className = "tikz-result";
    container.dataset.tikzCode = code;
    const status = container.createEl("div", { cls: "tikz-status" });
    status.setText("Rendering TikZ con TeX locale…");
    status.addClass("tikz-loading");
    return container;
  }

  private async fillTikzContainer(container: HTMLElement, code: string): Promise<void> {
    const status = container.querySelector(".tikz-status") as HTMLElement | null;
    try {
      const svg = await this.tikzRenderer.render(code);
      status?.remove();
      const figure = container.createEl("div", { cls: "tikz-figure" });
      figure.innerHTML = svg;
      const toggle = container.createEl("details", { cls: "tikz-toggle" });
      const summary = toggle.createEl("summary");
      summary.setText("Mostra codice TikZ");
      const codePre = toggle.createEl("pre");
      const codeOut = codePre.createEl("code");
      codeOut.setText(code);
    } catch (e) {
      status?.remove();
      const errBox = container.createEl("div", { cls: "tikz-error" });
      errBox.createEl("div", {
        text: "Errore di rendering TikZ",
        cls: "tikz-error-title",
      });
      errBox.createEl("pre", {
        text: e instanceof Error ? e.message : String(e),
        cls: "tikz-error-msg",
      });
      const toggle = errBox.createEl("details", { cls: "tikz-toggle" });
      const summary = toggle.createEl("summary");
      summary.setText("Mostra codice TikZ");
      const codePre = toggle.createEl("pre");
      const codeOut = codePre.createEl("code");
      codeOut.setText(code);
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}