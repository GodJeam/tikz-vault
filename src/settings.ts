import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type TikzVaultPlugin from "./main";

export type TikzEngine = "auto" | "pdf" | "dvi";

export interface TikzSettings {
  tikzEnabled: boolean;
  tikzEngine: TikzEngine;
  tikzLatexBin: string;
  tikzDvisvgmBin: string;
  tikzExtraPreamble: string;
  tikzLivePreview: boolean;
}

export const DEFAULT_SETTINGS: TikzSettings = {
  tikzEnabled: true,
  tikzEngine: "auto",
  tikzLatexBin: "",
  tikzDvisvgmBin: "",
  tikzExtraPreamble: "",
  tikzLivePreview: true,
};

export class TikzSettingTab extends PluginSettingTab {
  plugin: TikzVaultPlugin;

  constructor(app: App, plugin: TikzVaultPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Rendering TikZ" });

    new Setting(containerEl)
      .setName("Render dei blocchi TikZ con TeX locale")
      .setDesc(
        "Rende i blocchi ```tikz delle note con il TeX installato sul sistema (MiKTeX/TeX Live). Supporta TUTTE le librerie esterne (pgfplots, circuitikz, tikz-cd, forest, ecc.) che TikZJax non può caricare. Il rendering avviene prima del plugin TikZJax, quindi ha la precedenza."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.tikzEnabled)
          .onChange(async (value) => {
            this.plugin.settings.tikzEnabled = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Anteprima in modifica (live preview)")
      .setDesc(
        "Mostra l'immagine TikZ anche nella modalità modifica, sotto il blocco di codice. L'anteprima viene aggiornata automaticamente quando il codice cambia."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.tikzLivePreview)
          .onChange(async (value) => {
            this.plugin.settings.tikzLivePreview = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Motore di rendering")
      .setDesc(
        "auto = prova pdflatex+dvisvgm e ripiega su latex+dvisvgm. 'pdf' è più compatibile con i pacchetti moderni, 'dvi' è più tradizionale."
      )
      .addDropdown((dd) =>
        dd
          .addOption("auto", "Auto (consigliato)")
          .addOption("pdf", "pdflatex + dvisvgm (PDF)")
          .addOption("dvi", "latex + dvisvgm (DVI)")
          .setValue(this.plugin.settings.tikzEngine)
          .onChange(async (value) => {
            this.plugin.settings.tikzEngine = value as TikzEngine;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Percorso binario latex/pdflatex")
      .setDesc(
        "Lascia vuoto per la ricerca automatica nel PATH (consigliato). Usa il percorso completo solo se serve."
      )
      .addText((text) =>
        text
          .setPlaceholder("(auto)")
          .setValue(this.plugin.settings.tikzLatexBin)
          .onChange(async (value) => {
            this.plugin.settings.tikzLatexBin = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Percorso binario dvisvgm")
      .setDesc("Lascia vuoto per la ricerca automatica nel PATH (consigliato).")
      .addText((text) =>
        text
          .setPlaceholder("(auto)")
          .setValue(this.plugin.settings.tikzDvisvgmBin)
          .onChange(async (value) => {
            this.plugin.settings.tikzDvisvgmBin = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Preambolo aggiuntivo")
      .setDesc(
        "Linee da aggiungere al preambolo di ogni rendering. Utile per caricare librerie usate di frequente, es. \\usepackage{pgfplots} oppure \\usetikzlibrary{positioning, arrows.meta}."
      )
      .addTextArea((text) =>
        text
          .setPlaceholder("\\usepackage{pgfplots}\n\\pgfplotsset{compat=1.18}")
          .setValue(this.plugin.settings.tikzExtraPreamble)
          .onChange(async (value) => {
            this.plugin.settings.tikzExtraPreamble = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Testa rendering TikZ")
      .setDesc(
        "Esegue un diagramma di prova con pgfplots, circuitikz e librerie per verificare la configurazione."
      )
      .addButton((btn) =>
        btn.setButtonText("Test").onClick(async () => {
          btn.setDisabled(true);
          btn.setButtonText("Rendering in corso...");
          try {
            await this.plugin.tikzRenderer.render(
              "\\usepackage{pgfplots}\n\\pgfplotsset{compat=1.18}\n\\usepackage[siunitx]{circuitikz}\n\\usetikzlibrary{positioning, arrows.meta}\n\\begin{tikzpicture}\n\\draw (0,0) to[R=1k] (3,0);\n\\node[draw, right=1cm of {(3,0)}] (b) {OK};\n\\draw[-{Stealth}] (3,0) -- (b);\n\\end{tikzpicture}"
            );
            new Notice("Rendering TikZ riuscito: la configurazione TeX funziona.");
          } catch (e) {
            new Notice(`Errore rendering TikZ: ${(e as Error).message}`);
          } finally {
            btn.setDisabled(false);
            btn.setButtonText("Test");
          }
        })
      );

    new Setting(containerEl)
      .setName("Svuota cache rendering")
      .setDesc(
        "Elimina gli SVG già compilati (utile dopo modifiche al preambolo o per liberare spazio)."
      )
      .addButton((btn) =>
        btn.setButtonText("Svuota").onClick(() => {
          this.plugin.tikzRenderer.clearCache();
          new Notice("Cache TikZ svuotata.");
        })
      );
  }
}