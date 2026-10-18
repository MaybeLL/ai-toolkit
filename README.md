# AI Toolkit

[![CI](https://github.com/MaybeLL/ai-toolkit/actions/workflows/ci.yml/badge.svg)](https://github.com/MaybeLL/ai-toolkit/actions/workflows/ci.yml)

MaybeLL 的个人 agent 工具集，以 plugin 为单元组织通用生产力 skills 和可复用提示词。

## 内容

- [plugins/productivity](plugins/productivity) — 11 个通用 skills，涵盖解释、拷问、领域建模、研究、TDD、教学和制图。
- [prompt](prompt) — 可复用提示词。

## EvalMe 已独立

个人能力评测系统 **EvalMe** 已迁至独立公开仓库 [MaybeLL/evalme](https://github.com/MaybeLL/evalme)，
包含 CLI、入口 skill、示例、规格文档与设计决策。本仓库不再打包 EvalMe。

原来安装了 `evalme@maybell-plugins` 的用户，请按
[迁移说明](https://github.com/MaybeLL/evalme/blob/main/docs/MIGRATION.md)
切换到新仓库的 `evalme@evalme-plugins`。Pi 用户更新 ai-toolkit package 后单独安装新 EvalMe package。
现有 `EVALME_HOME` 和私有 `evalme-data` 数据仓库继续使用，已有评测数据无需移动。

## 安装 productivity

### Claude Code

```bash
claude plugin marketplace add MaybeLL/ai-toolkit
claude plugin install productivity@maybell-plugins
```

### Codex

```bash
codex plugin marketplace add MaybeLL/ai-toolkit --ref main
codex plugin add productivity@maybell-plugins
```

### Pi

```bash
pi install git:github.com/MaybeLL/ai-toolkit
```

安装或更新后重启宿主并打开新会话。Pi 以整个仓库为 package，当前只加载 productivity 的 11 个 skills。

## 本地验证

```bash
npm run check
```

## 许可证

[MIT](LICENSE)
