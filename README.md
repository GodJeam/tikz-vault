# TikZ Vault

An **Obsidian** plugin that renders TikZ code blocks (```tikz, ```tikzcd, ```pgfplots) in your vault using a **local TeX installation** (MiKTeX / TeX Live), producing SVG images. It supports all external libraries (pgfplots, circuitikz, tikz-cd, forest, etc.) that TikZJax cannot load.

> **Note**: this project was entirely generated using large language models (LLMs) via opencode. The code received **little personal review**: use it with due caution, test it, and report or fix any issues you find.

## Features

- Renders ```tikz blocks in **Reading mode** (replaces the code block with the rendered SVG).
- **Live preview** in Edit mode: shows the image below the code block, updating as you type.
- Supports **any LaTeX package** (pgfplots, circuitikz, tikz-cd, forest, positioning, arrows.meta, ...) since it uses a real TeX installation.
- Automatic fallback between `pdflatex + dvisvgm` and `latex + dvisvgm`.
- Cached results: each diagram is compiled once and cached on disk.

## Requirements

- Obsidian (desktop).
- A local **TeX** installation with `latex`/`pdflatex` and `dvisvgm` on your `PATH` (or configured in the plugin settings):

| Platform | Recommended TeX | Notes |
|---|---|---|
| Windows | MiKTeX | set the `latex`/`dvisvgm` binary paths in settings if not on `PATH` |
| macOS | MacTeX / TeX Live | binaries usually in `/Library/TeX/texbin` |
| Linux | TeX Live (`texlive-full`) | binaries usually in `/usr/bin` |

For the build you also need **Node.js**.

## Installation

1. Clone the repo and build:

```bash
git clone https://github.com/<your-username>/tikz-vault.git
cd tikz-vault
npm install
npm run build
```

2. Copy the generated files into your vault:

```
<vault>/.obsidian/plugins/tikz-vault/
    ├── main.js
    ├── manifest.json
    └── styles.css
```

3. In Obsidian: Settings → Community plugins → enable **TikZ Vault**.

## Usage

Wrap TikZ code in a fenced block:

````markdown
```tikz
\begin{tikzpicture}
\draw (0,0) circle (1);
\end{tikzpicture}
```
````

The diagram is rendered automatically. In the plugin settings you can configure the engine, binary paths, and an extra preamble. Use the **Test** button to verify your TeX configuration.

## Structure

- `src/main.ts` — entry point, post-processor and live-preview setup
- `src/tikzRenderer.ts` — TeX compilation and SVG conversion
- `src/tikzPreview.ts` — CodeMirror editor extension for live preview
- `src/settings.ts` — settings

## License

GPL-3.0 — see [LICENSE](LICENSE).