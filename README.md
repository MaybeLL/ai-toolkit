# AI Toolkit

[![CI](https://github.com/MaybeLL/ai-toolkit/actions/workflows/ci.yml/badge.svg)](https://github.com/MaybeLL/ai-toolkit/actions/workflows/ci.yml)

MaybeLL 维护的通用 Agent Skill 合集：设计、编码、评审、研究、学习和日常工具。13 个 Skill 共用一份源码，可按需安装，也可安装 productivity 插件。

## 安装一个 Skill

需要 Node.js 22.20+。下面固定到已验收的安装器版本：

```bash
# 查看目录
npx skills@1.7.4 add MaybeLL/ai-toolkit --list

# 只为 Codex 安装「软件设计的哲学」，在所有项目中使用
npx skills@1.7.4 add MaybeLL/ai-toolkit --skill software-design-philosophy -a codex -g
```

`-a` 可改为 `claude-code`、`cursor` 等安装器支持的宿主；去掉 `-g` 则仅安装到当前项目。安装完成后打开新会话，例如：

> 使用 software-design-philosophy 评审这个模块，找出增加理解和修改成本的设计，并给出最小改进方案。

```bash
npx skills@1.7.4 check
npx skills@1.7.4 update software-design-philosophy -g
```

先备份安装目录中的本地修改再更新。同一宿主避免同时通过插件与单个安装渠道加载同名 Skill。固定版本安装、离线 ZIP 和回退步骤见 [维护与发布](docs/MAINTAINING.md)。

## Skill 目录

| Skill | 用途 | 运行依赖 / 组合要求 |
|---|---|---|
| [software-design-philosophy](plugins/productivity/skills/software-design-philosophy) | 软件设计、编码、修复、重构与评审；附本地依据 | 无外部运行依赖，依据可离线阅读 |
| [video-download](plugins/productivity/skills/video-download) | 下载视频、音频、字幕并检查成品 | yt-dlp、ffmpeg/ffprobe；部分站点需 JS 运行时与网络 |
| [explain-clearly](plugins/productivity/skills/explain-clearly) | 清晰解释概念、机制和设计 | 手动调用 |
| [grilling](plugins/productivity/skills/grilling) | 深入审视计划、决策和想法 | 手动调用 |
| [grill-me](plugins/productivity/skills/grill-me) | 逐问打磨计划 | 手动调用 |
| [grill-with-docs](plugins/productivity/skills/grill-with-docs) | 访谈过程中沉淀领域文档 | 同时安装 grilling、domain-modeling |
| [domain-modeling](plugins/productivity/skills/domain-modeling) | 领域模型、统一语言、ADR | 工作区文件读写 |
| [research](plugins/productivity/skills/research) | 一手来源研究 | 宿主支持后台代理、联网查询和文件写入 |
| [tdd](plugins/productivity/skills/tdd) | 测试驱动开发 | 目标项目的测试工具 |
| [teach](plugins/productivity/skills/teach) | 在工作区进行教练式学习 | 工作区文件读写 |
| [drawio](plugins/productivity/skills/drawio) | 离线 YAML 制图及导入、编辑 | Node.js 20+；桌面图片导出和部分导入器有可选依赖，见 Skill |
| [excalidraw-diagram-generator](plugins/productivity/skills/excalidraw-diagram-generator) | Excalidraw 流程图、架构图、思维导图 | 基础 JSON 无额外依赖；辅助脚本 Python 3.10+ |
| [wait-what](plugins/productivity/skills/wait-what) | 重新用简单、有上下文的方式解释 | 手动调用 |

组合 Skill 的安装示例：

```bash
npx skills@1.7.4 add MaybeLL/ai-toolkit --skill grill-with-docs grilling domain-modeling -a codex -g
```

## 安装整个插件

现有安装入口继续可用；整个插件包含全部 13 个 Skill。

```bash
# Claude Code
claude plugin marketplace add MaybeLL/ai-toolkit
claude plugin install productivity@maybell-plugins

# Codex
codex plugin marketplace add MaybeLL/ai-toolkit --ref main
codex plugin add productivity@maybell-plugins

# Pi
pi install git:github.com/MaybeLL/ai-toolkit
```

安装或更新后按宿主要求重启或打开新会话。

## 维护和质量

```bash
npm ci --ignore-scripts
npm run check
npm test
npm run package
```

源码唯一目录：`plugins/productivity/skills/`。CI 在 Linux 和 macOS 检查格式、链接、打包及单个安装；从解压目录运行 drawio 验证资源完整性。宿主内的模型行为单独验收，不由 CI 结构检查代替。

- [维护、版本发布和回退](docs/MAINTAINING.md)
- [版本记录](CHANGELOG.md) · [行为验收](tests/README.md)
- [可复用提示词](prompt/README.md)

## 独立产品与来源

[EvalMe](https://github.com/MaybeLL/evalme) 已独立维护，不随本仓库打包；原用户见 [迁移说明](https://github.com/MaybeLL/evalme/blob/main/docs/MIGRATION.md)。Book2Skill 等第三方工具独立安装，机器专属服务 Skill 留在对应产品仓库。

仓库维护代码采用 [MIT](LICENSE)。保留导入 Skill 和 vendored 资源自己的许可证及来源；例如 wait-what 的 MIT 署名、drawio 的上游信息与组件许可证。软件设计哲学 Skill 是对原书方法的转述与应用，不包含原书全文，也不改变原书版权。
