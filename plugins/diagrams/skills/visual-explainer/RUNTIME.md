# Runtime and local entry points

All paths below are relative to this Skill directory. Use the copy containing the loaded `SKILL.md`; do not fall back to an independently installed npm package. The repository and standalone ZIP contain the same runtime.

## Basic HTML

Requires Node.js 22.20+ and a browser to read the output. No npm installation is required for the kit or plan renderer. Write a source using the bundled references, then run:

```sh
node kit/render.mjs /absolute/path/report.src.html --open
```

For a code-grounded plan:

```sh
node plan/render.mjs /absolute/path/plan.src.html --root /absolute/path/project --open
```

The renderer keeps the source and produces a sibling HTML file. Kit CSS, JavaScript and SVG are bundled, but Google Fonts links are external; page-authored CDN libraries or images can also require a network. Single-file output is not a guarantee of offline fidelity.

## Browser verification

Install browser checking dependencies in this Skill directory when needed:

```sh
npm install --ignore-scripts --package-lock=false --include=optional
```

A local Chrome installation can be used. If no browser is available, install Chromium separately as described in the renderer's diagnostic. Re-render and inspect the reported contact sheet. If dependencies or a browser are missing, the renderer reports a skipped check; do not report visual validation as passed. `--no-check` is intended for structural smoke tests, not visual acceptance.

## Optional MCP, PPTX and video

The local `package.json` mirrors upstream runtime dependency ranges and adds optional `playwright-core`. Install it only when these capabilities are needed:

```sh
npm install --ignore-scripts --package-lock=false
node mcp/server.mjs
node pptx/export.mjs /absolute/path/deck.html /absolute/path/deck.pptx
node video/render.mjs --help
```

MCP needs `@modelcontextprotocol/server` and `zod`. PPTX export needs `node-html-parser` and `pptxgenjs`; it is best-effort and does not preserve interactive HTML fidelity. Video additionally needs FFmpeg and Chrome/Chromium; narration setup is described in `references/video.md`. Optional npm dependency ranges follow upstream and are not locked by this distribution.

Host registration is separate: point an MCP host at this directory's `mcp/server.mjs` using an absolute path. The bundled `extension.ts` can be explicitly loaded by a compatible Pi host; AI Toolkit does not auto-register it. The `commands/` workflows are included as references, not registered slash commands. Consult the upstream host documentation before enabling these integrations.
