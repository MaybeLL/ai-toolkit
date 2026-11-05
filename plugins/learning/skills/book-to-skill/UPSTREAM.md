# Upstream provenance

- Project: [virgiliojr94/book-to-skill](https://github.com/virgiliojr94/book-to-skill)
- Revision: `e7bb659d3261491c8b28793dcb9102fa64a46c22`
- Upstream package version: `1.4.0`
- Imported: 2026-11-05
- License: MIT, copyright (c) 2025 virgiliojr94; see [LICENSE](LICENSE).
- Selection: GitHub repository search by stars for `book-to-skill` and `book2skill`; this project had 36,971 stars at import time (counts change).

## Included files

`SKILL.md`, `scripts/extract.py`, `book_to_skill/`, and `tools/scan_generated_skill.py` come from the pinned revision. The upstream MIT license is preserved as `LICENSE`. Upstream tests, documentation site, development tooling and example book content are excluded.

## Local adaptation

The extraction instructions require `BOOK_TO_SKILL_ROOT` to point to the loaded Skill directory and search its bundled extractor first. This supports plugin paths and standalone ZIPs without accidentally executing another global installation. Runtime Python code is unchanged. This provenance file and `agents/openai.yaml` are local additions.

## Runtime and updating

Use Python 3.10+ under this repository's supported baseline. Plain text and Markdown extraction use the standard library; other formats have optional dependencies. Run `python3 scripts/extract.py --check` from this directory to inspect them. Technical mode uses Docling. The agent performs synthesis after extraction; the Python CLI alone does not generate a complete Skill.

To update, fetch a specific upstream revision, compare the imported runtime files and SKILL.md, retain the loaded-directory adaptation and MIT attribution, update this record, and run the repository checks and distribution tests. Do not copy a machine's installed Skill over this source.
