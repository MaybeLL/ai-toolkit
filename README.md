# AI Toolkit

[![CI](https://github.com/MaybeLL/ai-toolkit/actions/workflows/ci.yml/badge.svg)](https://github.com/MaybeLL/ai-toolkit/actions/workflows/ci.yml)

MaybeLL 维护的通用 Agent Skill 合集：设计、编码、评审、研究、学习和日常工具。12 个 Skill 按用途分为 4 个插件；每个 Skill 只有一份源码，可单独安装，也可按插件安装。

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
| [software-design-philosophy](plugins/engineering/skills/software-design-philosophy) | 软件设计、编码、修复、重构与评审；附本地依据 | 无外部运行依赖，依据可离线阅读 |
| [video-download](plugins/media/skills/video-download) | 下载视频、音频、字幕并检查成品 | yt-dlp、ffmpeg/ffprobe；部分站点需 JS 运行时与网络 |
| [explain-clearly](plugins/learning/skills/explain-clearly) | 清晰解释概念、机制和设计 | 手动调用 |
| [grilling](plugins/engineering/skills/grilling) | 深入审视计划、决策和想法 | 可按请求触发 |
| [grill-me](plugins/engineering/skills/grill-me) | 逐问打磨计划 | 手动调用；同时安装 grilling |
| [grill-with-docs](plugins/engineering/skills/grill-with-docs) | 访谈过程中沉淀领域文档 | 同时安装 grilling、domain-modeling |
| [domain-modeling](plugins/engineering/skills/domain-modeling) | 领域模型、统一语言、ADR | 工作区文件读写 |
| [research](plugins/learning/skills/research) | 一手来源研究 | 宿主支持后台代理、联网查询和文件写入 |
| [tdd](plugins/engineering/skills/tdd) | 测试驱动开发 | 目标项目的测试工具 |
| [teach](plugins/learning/skills/teach) | 在工作区进行教练式学习 | 工作区文件读写 |
| [excalidraw-diagram-generator](plugins/diagrams/skills/excalidraw-diagram-generator) | Excalidraw 流程图、架构图、思维导图 | 基础 JSON 无额外依赖；辅助脚本 Python 3.10+ |
| [wait-what](plugins/learning/skills/wait-what) | 重新用简单、有上下文的方式解释 | 手动调用 |

组合 Skill 的安装示例：

```bash
npx skills@1.7.4 add MaybeLL/ai-toolkit --skill grill-with-docs grilling domain-modeling -a codex -g
```

## 按插件安装

同一个 `maybell-plugins` marketplace 提供四个插件，按任务选择：

| 插件 | 包含的 Skill |
|---|---|
| `engineering` | software-design-philosophy、domain-modeling、tdd、grilling、grill-me、grill-with-docs |
| `learning` | research、teach、explain-clearly、wait-what |
| `diagrams` | excalidraw-diagram-generator |
| `media` | video-download |

下面以 `engineering` 为例，替换插件名即可安装其他组：

```bash
# Claude Code
claude plugin marketplace add MaybeLL/ai-toolkit
claude plugin install engineering@maybell-plugins

# Codex
codex plugin marketplace add MaybeLL/ai-toolkit --ref main
codex plugin add engineering@maybell-plugins

# Pi：安装整个仓库的 12 个 Skill
pi install git:github.com/MaybeLL/ai-toolkit
```

Pi 需要单独安装时，可使用前面的 `skills add` 命令并指定 `-a pi`。插件分组只组织安装，不限制 Skill 在其他领域使用。安装或更新后按宿主要求重启或打开新会话；媒体等 Skill 的系统依赖仍需检查，并在用户确认后安装。

从 0.4.0 起直接使用这四个插件：`productivity` 入口和 `drawio` 已删除，不保留兼容别名。

## 维护和质量

```bash
npm ci --ignore-scripts
npm run check
npm test
npm run package
```

源码位于 `plugins/<plugin>/skills/<skill>/`，不跨插件复制。CI 在 Linux 和 macOS 检查四组入口、组合依赖、格式、链接、独立 ZIP、单个安装和分组安装；从解压目录运行媒体检查器和 Excalidraw 脚本。这里的安装测试使用 skills CLI，宿主原生插件生命周期和模型行为另行验收。

- [维护、版本发布和回退](docs/MAINTAINING.md)
- [版本记录](CHANGELOG.md) · [行为验收](tests/README.md)
- [可复用提示词](prompt/README.md)

## 独立产品与来源

[EvalMe](https://github.com/MaybeLL/evalme) 已独立维护，不随本仓库打包；原用户见 [迁移说明](https://github.com/MaybeLL/evalme/blob/main/docs/MIGRATION.md)。Book2Skill 等第三方工具独立安装，机器专属服务 Skill 留在对应产品仓库。

仓库维护代码采用 [MIT](LICENSE)。保留导入 Skill 和 vendored 资源自己的许可证及来源；例如 wait-what 的 MIT 署名。软件设计哲学 Skill 是对原书方法的转述与应用，不包含原书全文，也不改变原书版权。
