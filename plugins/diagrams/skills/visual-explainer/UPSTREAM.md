# Upstream provenance

- Project: [nicobailon/visual-explainer](https://github.com/nicobailon/visual-explainer)
- Revision: `9d5f880b7e8e0a9a80c890b8e1bb6918b68481ad`
- Upstream version: `0.15.0`
- Imported: 2026-11-05
- License: MIT; upstream [LICENSE](LICENSE) and the vendored renderer's [PELE-LICENSE](kit/vendor/PELE-LICENSE) are preserved.

## Included source

The upstream `plugins/visual-explainer/` tree is included except its nested `.claude-plugin` manifest. Runtime JavaScript, TypeScript, CSS, SVG, templates, command workflows and reference material are retained. Upstream repository tests, fixtures, screenshots and installation configuration are excluded. AI Toolkit discovers this one copy through the `diagrams` plugin.

## Local adaptations

- `SKILL.md` explains the loaded-directory CLI default, optional host registration, browser-check requirements and external assets; video uses the local entry point.
- MCP/PPTX setup and the video reference point to the relocated runtime.
- `package.json` is a local, private dependency manifest using upstream version/dependency ranges; no root npm or host dependency is automatically added.
- `RUNTIME.md`, this record and `agents/openai.yaml` are local additions.
- Runtime source code is unchanged. Pi extensions, MCP tools and slash commands are retained but not automatically registered by AI Toolkit.

## Updating

Fetch a fixed revision, compare its plugin tree, preserve the MIT notices and local path adaptations, and update this record and dependency manifest. Run repository validation, installation and standalone ZIP tests; re-run browser and optional-host acceptance for changed capabilities. A CLI smoke test does not establish Pi/MCP integration, video/PPTX fidelity, or model behavior quality.
