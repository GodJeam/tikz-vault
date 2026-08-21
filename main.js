"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => TikzVaultPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian2 = require("obsidian");

// src/tikzRenderer.ts
var import_child_process = require("child_process");
var import_crypto = require("crypto");
var import_fs = require("fs");
var import_os = require("os");
var import_path = require("path");
var TikzRenderer = class {
  constructor(plugin) {
    this.inFlight = /* @__PURE__ */ new Map();
    this.plugin = plugin;
    this.cacheDir = (0, import_path.join)((0, import_os.tmpdir)(), "tikz-vault-render");
    (0, import_fs.mkdirSync)(this.cacheDir, { recursive: true });
  }
  async render(code) {
    const s = this.plugin.settings;
    const tex = this.buildTexSource(code, s.tikzExtraPreamble);
    const hash = (0, import_crypto.createHash)("sha256").update(tex).digest("hex").slice(0, 32);
    const dir = (0, import_path.join)(this.cacheDir, hash);
    const svgFile = (0, import_path.join)(dir, "main.svg");
    if ((0, import_fs.existsSync)(svgFile)) {
      return (0, import_fs.readFileSync)(svgFile, "utf8");
    }
    const existing = this.inFlight.get(hash);
    if (existing) return existing;
    const promise = this.doRender(tex, dir, svgFile, s).finally(() => {
      this.inFlight.delete(hash);
    });
    this.inFlight.set(hash, promise);
    return promise;
  }
  async doRender(tex, dir, svgFile, s) {
    (0, import_fs.mkdirSync)(dir, { recursive: true });
    (0, import_fs.writeFileSync)((0, import_path.join)(dir, "main.tex"), tex, "utf8");
    const latexPdf = this.resolveLatex("pdf");
    const latexDvi = this.resolveLatex("dvi");
    const dvisvgm = this.resolveDvisvgm();
    const engines = [];
    if (s.tikzEngine !== "dvi" && latexPdf && dvisvgm) {
      engines.push({
        label: "pdflatex + dvisvgm",
        build: async (d) => {
          await this.run(
            latexPdf,
            ["--interaction=nonstopmode", "--halt-on-error", "--disable-write18", "--enable-installer", "main.tex"],
            d
          );
          await this.run(dvisvgm, ["--pdf", "--no-fonts", "--precision=2", "main.pdf"], d);
        }
      });
    }
    if (s.tikzEngine !== "pdf" && latexDvi && dvisvgm) {
      engines.push({
        label: "latex + dvisvgm",
        build: async (d) => {
          await this.run(
            latexDvi,
            ["--interaction=nonstopmode", "--halt-on-error", "--disable-write18", "--enable-installer", "main.tex"],
            d
          );
          await this.run(dvisvgm, ["--no-fonts", "--precision=2", "main.dvi"], d);
        }
      });
    }
    if (engines.length === 0) {
      const missing = [];
      if (!latexPdf && !latexDvi) missing.push("latex/pdflatex");
      if (!dvisvgm) missing.push("dvisvgm");
      throw new Error(
        `Binario ${missing.join(" e ")} non trovato. Verifica l'installazione di TeX oppure imposta i percorsi nelle impostazioni del plugin.`
      );
    }
    const errors = [];
    for (const engine of engines) {
      try {
        await engine.build(dir);
        if (!(0, import_fs.existsSync)(svgFile)) {
          throw new Error(`dvisvgm non ha prodotto alcun SVG (engine ${engine.label})`);
        }
        const svg = (0, import_fs.readFileSync)(svgFile, "utf8");
        return this.cleanSvg(svg);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
        for (const f of ["main.pdf", "main.dvi"]) {
          try {
            (0, import_fs.rmSync)((0, import_path.join)(dir, f), { force: true });
          } catch (e2) {
          }
        }
      }
    }
    throw new Error(this.buildErrorMessage(errors, dir));
  }
  clearCache() {
    try {
      (0, import_fs.rmSync)(this.cacheDir, { recursive: true, force: true });
      (0, import_fs.mkdirSync)(this.cacheDir, { recursive: true });
    } catch (e) {
    }
  }
  buildTexSource(code, extraPreamble) {
    const src = code.replace(/\r\n/g, "\n").trim();
    if (!src) throw new Error("Il blocco TikZ \xE8 vuoto.");
    if (/\\documentclass\s*\{/.test(src)) {
      return src;
    }
    const envMatch = src.match(/\\begin\{(\w+)\}/);
    let preamble = "";
    let body = src;
    if (envMatch && envMatch.index !== void 0) {
      preamble = src.slice(0, envMatch.index).trim();
      body = src.slice(envMatch.index).trim();
      const env = envMatch[1];
      if (env !== "tikzpicture" && env !== "tikzcd") {
        body = "\\begin{tikzpicture}\n" + body + "\n\\end{tikzpicture}";
      }
    } else if (!/\\tikz\s*[{\[]/.test(src)) {
      body = "\\begin{tikzpicture}\n" + src + "\n\\end{tikzpicture}";
    }
    const parts = ["\\documentclass[border=5pt]{standalone}", "\\usepackage{tikz}"];
    if (/\\begin\{tikzcd\}/.test(src)) parts.push("\\usepackage{tikz-cd}");
    if (/(\\begin\{axis\}|\\addplot)/.test(src)) {
      parts.push("\\usepackage{pgfplots}", "\\pgfplotsset{compat=1.18}");
    }
    if (/\\begin\{forest\}/.test(src)) parts.push("\\usepackage{forest}");
    const extra = extraPreamble.trim();
    if (extra) parts.push(extra);
    if (preamble) parts.push(preamble);
    parts.push("\\begin{document}", body, "\\end{document}");
    return parts.join("\n");
  }
  cleanSvg(svg) {
    return svg.replace(/^\s*<\?xml[^>]*\?>\s*/, "").replace(/^\s*<!--[\s\S]*?-->\s*/, "").trim();
  }
  buildErrorMessage(errors, dir) {
    const logFile = (0, import_path.join)(dir, "main.log");
    let tail = "";
    if ((0, import_fs.existsSync)(logFile)) {
      const lines = (0, import_fs.readFileSync)(logFile, "utf8").split(/\r?\n/);
      const errs = lines.filter(
        (l) => /^!|^l\.\d+|error|Error|Undefined control sequence|File .* not found|cannot|runaway/i.test(l)
      );
      tail = (errs.length ? errs : lines).slice(-25).join("\n");
    }
    const detail = errors.length ? errors.map((e, i) => `Tentativo ${i + 1}: ${e}`).join("\n\n") : "";
    return detail + (tail ? `

--- log LaTeX ---
${tail}` : "");
  }
  resolveLatex(engine) {
    var _a;
    const cfg = this.plugin.settings.tikzLatexBin.trim();
    if (cfg) return this.withExe(cfg);
    return (_a = this.findInPath(engine === "pdf" ? "pdflatex" : "latex")) != null ? _a : "";
  }
  resolveDvisvgm() {
    var _a;
    const cfg = this.plugin.settings.tikzDvisvgmBin.trim();
    if (cfg) return this.withExe(cfg);
    return (_a = this.findInPath("dvisvgm")) != null ? _a : "";
  }
  withExe(bin) {
    if (process.platform !== "win32") return bin;
    if (bin.toLowerCase().endsWith(".exe") || bin.includes("\\") || bin.includes("/")) return bin;
    return bin + ".exe";
  }
  findInPath(name) {
    var _a;
    const isWin = process.platform === "win32";
    const exts = isWin ? [".exe", ".cmd", ".bat"] : [""];
    const dirs = ((_a = process.env.PATH) != null ? _a : "").split(isWin ? ";" : ":").filter(Boolean);
    for (const dir of dirs) {
      for (const ext of exts) {
        const p = (0, import_path.join)(dir, name + ext);
        if ((0, import_fs.existsSync)(p)) return p;
      }
    }
    return null;
  }
  run(bin, args, cwd) {
    return new Promise((resolve, reject) => {
      (0, import_child_process.execFile)(
        bin,
        args,
        { cwd, windowsHide: true, timeout: 12e4, env: process.env },
        (error, _stdout, stderr) => {
          if (error) {
            const e = error;
            if (e.code === "ENOENT") {
              reject(new Error(`Eseguibile non trovato: ${bin}`));
            } else if (typeof e.code === "number") {
              reject(
                new Error(
                  `Errore (exit code ${e.code}) da ${bin}: ${(stderr || "").trim() || _stdout.trim()}`
                )
              );
            } else {
              reject(new Error(`${bin}: ${e.message}`));
            }
          } else {
            resolve();
          }
        }
      );
    });
  }
};

// src/tikzPreview.ts
var import_state = require("@codemirror/state");
var import_view = require("@codemirror/view");
var TIKZ_LANG = /^```(tikz|tikzcd|pgfplots)(\s|$)/i;
var CLOSING_FENCE = /^```\s*$/;
function findTikzBlocks(state) {
  const blocks = [];
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
      if (k - n > 5e3) break;
    }
    if (closeLine) {
      const to = doc.line(closeLine).to;
      const codeLines = [];
      for (let x = n + 1; x < closeLine; x++) {
        codeLines.push(doc.line(x).text);
      }
      const code = codeLines.join("\n").trim();
      if (code) blocks.push({ to, code });
      n = closeLine;
    }
  }
  return blocks;
}
var TikzPreviewWidget = class extends import_view.WidgetType {
  constructor(code, renderFn) {
    super();
    this.code = code;
    this.renderFn = renderFn;
    this.destroyed = false;
  }
  eq(other) {
    return other.code === this.code;
  }
  toDOM() {
    const wrap = document.createElement("div");
    wrap.className = "tikz-live";
    const status = document.createElement("div");
    status.className = "tikz-status";
    status.textContent = "Rendering TikZ\u2026";
    wrap.appendChild(status);
    this.renderFn(this.code).then((svg) => {
      if (this.destroyed) return;
      wrap.replaceChildren();
      const fig = document.createElement("div");
      fig.className = "tikz-figure";
      fig.innerHTML = svg;
      wrap.appendChild(fig);
    }).catch((err) => {
      if (this.destroyed) return;
      wrap.replaceChildren();
      const errBox = document.createElement("div");
      errBox.className = "tikz-error";
      const title = document.createElement("div");
      title.className = "tikz-error-title";
      title.textContent = "Errore di rendering TikZ";
      errBox.appendChild(title);
      const pre = document.createElement("pre");
      pre.className = "tikz-error-msg";
      pre.textContent = err instanceof Error ? err.message : String(err);
      errBox.appendChild(pre);
      wrap.appendChild(errBox);
    });
    return wrap;
  }
  destroy() {
    this.destroyed = true;
  }
  ignoreEvent() {
    return true;
  }
};
function computeDecorations(state, plugin) {
  if (!plugin.settings.tikzEnabled || !plugin.settings.tikzLivePreview) return import_view.Decoration.none;
  const builder = new import_state.RangeSetBuilder();
  const render = (code) => plugin.tikzRenderer.render(code);
  try {
    for (const block of findTikzBlocks(state)) {
      builder.add(
        block.to,
        block.to,
        import_view.Decoration.widget({ widget: new TikzPreviewWidget(block.code, render), block: true, side: 1 })
      );
    }
  } catch (e) {
    console.error("tikz-vault: errore nella costruzione delle decorazioni TikZ:", e);
  }
  return builder.finish();
}
var tikzRecalcEffect = import_state.StateEffect.define();
function tikzPreviewExtension(plugin) {
  const field = import_state.StateField.define({
    create(state) {
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
    provide: (f) => import_view.EditorView.decorations.from(f)
  });
  return [
    field,
    import_view.EditorView.updateListener.of((update) => {
      if (update.viewportChanged) {
        update.view.dispatch({ effects: tikzRecalcEffect.of(null) });
      }
    })
  ];
}

// src/settings.ts
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  tikzEnabled: true,
  tikzEngine: "auto",
  tikzLatexBin: "",
  tikzDvisvgmBin: "",
  tikzExtraPreamble: "",
  tikzLivePreview: true
};
var TikzSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Rendering TikZ" });
    new import_obsidian.Setting(containerEl).setName("Render dei blocchi TikZ con TeX locale").setDesc(
      "Rende i blocchi ```tikz delle note con il TeX installato sul sistema (MiKTeX/TeX Live). Supporta TUTTE le librerie esterne (pgfplots, circuitikz, tikz-cd, forest, ecc.) che TikZJax non pu\xF2 caricare. Il rendering avviene prima del plugin TikZJax, quindi ha la precedenza."
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.tikzEnabled).onChange(async (value) => {
        this.plugin.settings.tikzEnabled = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Anteprima in modifica (live preview)").setDesc(
      "Mostra l'immagine TikZ anche nella modalit\xE0 modifica, sotto il blocco di codice. L'anteprima viene aggiornata automaticamente quando il codice cambia."
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.tikzLivePreview).onChange(async (value) => {
        this.plugin.settings.tikzLivePreview = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Motore di rendering").setDesc(
      "auto = prova pdflatex+dvisvgm e ripiega su latex+dvisvgm. 'pdf' \xE8 pi\xF9 compatibile con i pacchetti moderni, 'dvi' \xE8 pi\xF9 tradizionale."
    ).addDropdown(
      (dd) => dd.addOption("auto", "Auto (consigliato)").addOption("pdf", "pdflatex + dvisvgm (PDF)").addOption("dvi", "latex + dvisvgm (DVI)").setValue(this.plugin.settings.tikzEngine).onChange(async (value) => {
        this.plugin.settings.tikzEngine = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Percorso binario latex/pdflatex").setDesc(
      "Lascia vuoto per la ricerca automatica nel PATH (consigliato). Usa il percorso completo solo se serve."
    ).addText(
      (text) => text.setPlaceholder("(auto)").setValue(this.plugin.settings.tikzLatexBin).onChange(async (value) => {
        this.plugin.settings.tikzLatexBin = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Percorso binario dvisvgm").setDesc("Lascia vuoto per la ricerca automatica nel PATH (consigliato).").addText(
      (text) => text.setPlaceholder("(auto)").setValue(this.plugin.settings.tikzDvisvgmBin).onChange(async (value) => {
        this.plugin.settings.tikzDvisvgmBin = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Preambolo aggiuntivo").setDesc(
      "Linee da aggiungere al preambolo di ogni rendering. Utile per caricare librerie usate di frequente, es. \\usepackage{pgfplots} oppure \\usetikzlibrary{positioning, arrows.meta}."
    ).addTextArea(
      (text) => text.setPlaceholder("\\usepackage{pgfplots}\n\\pgfplotsset{compat=1.18}").setValue(this.plugin.settings.tikzExtraPreamble).onChange(async (value) => {
        this.plugin.settings.tikzExtraPreamble = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Testa rendering TikZ").setDesc(
      "Esegue un diagramma di prova con pgfplots, circuitikz e librerie per verificare la configurazione."
    ).addButton(
      (btn) => btn.setButtonText("Test").onClick(async () => {
        btn.setDisabled(true);
        btn.setButtonText("Rendering in corso...");
        try {
          await this.plugin.tikzRenderer.render(
            "\\usepackage{pgfplots}\n\\pgfplotsset{compat=1.18}\n\\usepackage[siunitx]{circuitikz}\n\\usetikzlibrary{positioning, arrows.meta}\n\\begin{tikzpicture}\n\\draw (0,0) to[R=1k] (3,0);\n\\node[draw, right=1cm of {(3,0)}] (b) {OK};\n\\draw[-{Stealth}] (3,0) -- (b);\n\\end{tikzpicture}"
          );
          new import_obsidian.Notice("Rendering TikZ riuscito: la configurazione TeX funziona.");
        } catch (e) {
          new import_obsidian.Notice(`Errore rendering TikZ: ${e.message}`);
        } finally {
          btn.setDisabled(false);
          btn.setButtonText("Test");
        }
      })
    );
    new import_obsidian.Setting(containerEl).setName("Svuota cache rendering").setDesc(
      "Elimina gli SVG gi\xE0 compilati (utile dopo modifiche al preambolo o per liberare spazio)."
    ).addButton(
      (btn) => btn.setButtonText("Svuota").onClick(() => {
        this.plugin.tikzRenderer.clearCache();
        new import_obsidian.Notice("Cache TikZ svuotata.");
      })
    );
  }
};

// src/main.ts
var TikzVaultPlugin = class extends import_obsidian2.Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.tikzRenderer = new TikzRenderer(this);
    this.registerEditorExtension(tikzPreviewExtension(this));
    this.registerMarkdownPostProcessor(
      async (el) => {
        if (!this.settings.tikzEnabled) return;
        try {
          const candidates = Array.from(
            el.querySelectorAll(
              "pre > code.language-tikz, pre > code.language-tikzcd, pre > code.language-pgfplots"
            )
          );
          for (const codeEl of candidates) {
            try {
              const pre = codeEl.parentElement;
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
      -1e3
    );
    this.addSettingTab(new TikzSettingTab(this.app, this));
  }
  onunload() {
  }
  buildTikzContainer(code) {
    const container = document.createElement("div");
    container.className = "tikz-result";
    container.dataset.tikzCode = code;
    const status = container.createEl("div", { cls: "tikz-status" });
    status.setText("Rendering TikZ con TeX locale\u2026");
    status.addClass("tikz-loading");
    return container;
  }
  async fillTikzContainer(container, code) {
    const status = container.querySelector(".tikz-status");
    try {
      const svg = await this.tikzRenderer.render(code);
      status == null ? void 0 : status.remove();
      const figure = container.createEl("div", { cls: "tikz-figure" });
      figure.innerHTML = svg;
      const toggle = container.createEl("details", { cls: "tikz-toggle" });
      const summary = toggle.createEl("summary");
      summary.setText("Mostra codice TikZ");
      const codePre = toggle.createEl("pre");
      const codeOut = codePre.createEl("code");
      codeOut.setText(code);
    } catch (e) {
      status == null ? void 0 : status.remove();
      const errBox = container.createEl("div", { cls: "tikz-error" });
      errBox.createEl("div", {
        text: "Errore di rendering TikZ",
        cls: "tikz-error-title"
      });
      errBox.createEl("pre", {
        text: e instanceof Error ? e.message : String(e),
        cls: "tikz-error-msg"
      });
      const toggle = errBox.createEl("details", { cls: "tikz-toggle" });
      const summary = toggle.createEl("summary");
      summary.setText("Mostra codice TikZ");
      const codePre = toggle.createEl("pre");
      const codeOut = codePre.createEl("code");
      codeOut.setText(code);
    }
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
