# Goal Optimizer

[![CI](https://github.com/MaybeLL/ai-toolkit/actions/workflows/ci.yml/badge.svg)](https://github.com/MaybeLL/ai-toolkit/actions/workflows/ci.yml)

一个以“目标”为中心、以“能力”为状态、以“证据”为依据、以“优化”为核心循环的
**个人能力操作系统(Goal Optimization System)**。

它不关心你学了什么,而关心:**你距离目标还有多远,以及下一单位时间投入在哪里,能最大幅度缩小差距?**

核心循环:

```
写入侧(每份表现)          读取侧(看结果时刷新)
record → observe    │    assess → explain → next
记录表现   提取观测   │   聚合能力   解释证据链   定下一步
```

`record → observe` 是写入侧,只追加不可变事实。`assess` 是读模型刷新(全量重算 `state/`),
与摄取解耦——看结果前懒触发或一批摄取后统一跑一次,不属于单份表现的写入事务。

- **record** — 把一次表现(模拟面试、练习作答)登记为不可变的事实,不含任何评价。
- **observe** — 宿主 Agent 读原始 artifact,按 rubric 提取结构化观测(pass/partial/fail + 指向具体行号的证据摘录);提取时看不到历史分数(防锚定)。
- **assess** — 读模型刷新:确定性引擎把全部观测聚合成每个 `(能力, 维度)` 的 **score** 与 **confidence**,再对比目标算出按优先级排序的差距。无 LLM 参与;与摄取解耦,读取前刷新。
- **explain** — 展示某个能力数字为什么是这个值:每条支撑证据、其权重的逐因子拆解、以及它出自 artifact 的哪一行。
- **next** — 确定性地给出优先级最高的可行动缺口,Agent 据此设计至多 3 个 diagnose/train 任务。只排序,不编造提升数值。

### 系统不变量

- **事实不可变** — `artifacts/` 与 `data/events.jsonl` 只增不改。
- **推断可再生** — `state/` 完全派生:`rm -rf state/ && assess` 逐字节重建(recency 用数据自身时钟而非运行时钟)。
- **证据链完整** — 任何能力结论都能回溯到 artifact 里的具体行。
- **职责分离** — Agent 判断语义,CLI 计算每一个数字。

设计全文见 [docs/SPEC.md](docs/SPEC.md)。

## 仓库布局：个人 agent toolkit

本仓库是 MaybeLL 的个人 agent toolkit，以 **plugin 为单元**开发自己用的能力：

- [plugins/goal-optimizer](plugins/goal-optimizer) — 目标优化系统（CLI + 4 个 skill）
- [plugins/productivity](plugins/productivity) — 个人生产力 skill 合集（9 个 skill，纯 skill 无代码）

新增能力时按类型放：plugin（成套功能）、mcp（协议服务）、skill（纯技能）、cli（独立命令）。

## 前置依赖

只需要 **Node.js**(CLI 是单文件、零依赖的 `goal.mjs`)。无数据库、无账号、无云同步。Git 即同步机制。

## 安装

所有插件随 `maybell-plugins` marketplace 分发，可在三个宿主加载：

Claude Code:

```bash
claude plugin marketplace add MaybeLL/ai-toolkit
claude plugin install goal-optimizer@maybell-plugins
claude plugin install productivity@maybell-plugins
```

Codex:

```bash
codex plugin marketplace add MaybeLL/ai-toolkit
codex plugin add goal-optimizer@maybell-plugins
codex plugin add productivity@maybell-plugins
```

Pi:

```bash
pi install git:github.com/MaybeLL/ai-toolkit
```

Claude Code 与 Codex 会自动发现 skill;Pi 通过 `pi.skills` 加载 skill。安装后新开会话即可开始。

### 宿主安装粒度差异

| 宿主 | 安装粒度 | 能否只装一个 plugin |
|---|---|---|
| Claude Code | 按 plugin（`plugin install <name>@maybell-plugins`） | 可以，逐个装 |
| Codex | 按 plugin（`plugin add <name>@maybell-plugins`） | 可以，逐个装 |
| Pi | 按 package（整个仓库） | 一次全装 |

Pi 以**仓库为粒度**：`pi install git:github.com/MaybeLL/ai-toolkit` 会加载 `package.json` 的 `pi.skills` 里声明的**所有** skill（目前是 goal-optimizer 的 4 个 + productivity 的 9 个）。新增 plugin 时把它加进 `pi.skills` 数组即可，pi 端新开会话自动可见。

若想只让 pi 加载部分 skill，两种方式：

1. `pi config` 交互式启用/禁用单个 skill；
2. settings.json 用对象形式过滤（如 `"skills": ["!plugins/goal-optimizer/skills"]` 排除某目录）。

## 更新到最新版 / 看不到新 skill 怎么办

`marketplace add owner/repo` 只拉 GitHub **默认分支**(本仓库默认分支为 `main`),
且 Claude Code 会把仓库缓存在本地、**不会自动重新拉取**——已知 issue 中 `marketplace update`
常常报"已是最新"却不真拉新提交。所以插件更新后若看不到新增/改动的 skill,用
**彻底重装 + 整会话重启**(最可靠):

```bash
claude plugin uninstall goal-optimizer@maybell-plugins
claude plugin uninstall productivity@maybell-plugins
claude plugin marketplace remove maybell-plugins
claude plugin marketplace add MaybeLL/ai-toolkit
claude plugin install goal-optimizer@maybell-plugins
claude plugin install productivity@maybell-plugins
```

然后**完全退出并重开 Claude Code**——新 skill 只有整会话重启后才注册,`/reload-plugins` 不够。
重启后 goal-optimizer 应看到四个 skill:`goal-manage` / `goal-grill` / `goal-log` / `goal-review`;productivity 应看到九个 skill(`explain-clearly` / `grilling` 等)。

仍不出现时按此排查:

1. 确认 GitHub 默认分支确实是 `main`(否则拉到的旧分支上没有这些 skill)。
2. 清理卸载未删的缓存残留(路径以本机为准,先 `ls ~/.claude/plugins/` 看结构):
   `rm -rf ~/.claude/plugins/*maybell* ~/.claude/plugins/cache/*maybell* 2>/dev/null`。
3. `claude plugin list` 或 `/plugin` 面板确认装的是 `main` 的内容。

## 试用 worked example

仓库自带一个完整示例 workspace:[`plugins/goal-optimizer/examples/backend-system-design`](plugins/goal-optimizer/examples/backend-system-design)——三份面试逐字稿、提取出的观测、以及派生的能力/差距状态。

```bash
cd plugins/goal-optimizer/scripts
WS=../examples/backend-system-design
node goal.mjs explain idempotency.transfer --workspace "$WS"
# 从事实重算,验证逐字节一致(INV-2):
rm -rf "$WS/state" && node goal.mjs assess --workspace "$WS"
```

## 卸载

数据由用户自持(就在你指定的 workspace 目录里),卸载插件不会删除任何目标数据。

- Codex:`codex plugin remove goal-optimizer@maybell-plugins` 与 `codex plugin remove productivity@maybell-plugins`
- Claude Code:`claude plugin uninstall goal-optimizer@maybell-plugins` 与 `claude plugin uninstall productivity@maybell-plugins`

如果不再使用本仓库任何插件,可继续 `... plugin marketplace remove maybell-plugins`。

## 本地验证

```bash
node --check plugins/goal-optimizer/scripts/goal.mjs
node scripts/validate-plugin-metadata.mjs
```

## 许可证

[MIT](LICENSE)
