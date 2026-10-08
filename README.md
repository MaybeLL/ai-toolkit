# EvalMe

[![CI](https://github.com/MaybeLL/ai-toolkit/actions/workflows/ci.yml/badge.svg)](https://github.com/MaybeLL/ai-toolkit/actions/workflows/ci.yml)

一个本地优先、append-only 的**个人能力评测系统**——用 agent 评测的组织方式评测人:
每道题(task)自带预注册的评分标准(grader),每次尝试(trial)留下逐字稿(transcript),
每个结论都能回溯到逐字稿的具体行。

> 核心问题:**我距离目标还有多远?**——答案必须可信、可查、可复算。
> "下一步练什么"(next)是测量基础设施之上的便利视图,不是系统的灵魂。

五环节流水线(spec-v0.2,task 中心模型)——**一个入口,五个流程**:用户只说人话(练题/看进度/定目标/出题/打分),`evalme` skill 自动路由;`status` 一条命令回答"现在该干嘛"。

```
定标       出题          练习          打分           复盘
define → create → practice → grade → review
目标+词表   题+grader    主持→逐字稿   逐 check 盲判   assess→explain→next
```

- **evalme(入口)** — 意图路由 + 公共协议(数据位置/同步/会话卫生);练习与打分默认在 fresh 子代理里跑,用户不用管"哪个会话能干什么"。
- **define** — 定标:goal.yaml 的 topics 清单 = 优先级声明(weight)+ label 权威词表。**没有数值分数线**:达标是外延式的(该 topic 下 unseen/variant 题的近期通过情况)。
- **create** — 出题:题面 + **预注册 grader**(行为锚定的 checks,可选 must_pass)+ labels + difficulty + 参考答案质检；**草案须经用户明确确认才入库**。三种来源:`generated`(LLM 按缺口出题)/ `imported`(用户上传,作答前补 grader)/ `imported-live`(真实面试事后归一化,如实降权)。横切行为(如 communication)由 **common grader** 承载,定义一次、跨题复用。
- **practice** — 练习:从题库取题主持,主持人**只看题面**(`--prompt-only`,绝不看 checks),产逐字中立 transcript(SHA-256 公证)并立即 record。novelty(unseen/variant/familiar/repeat)由引擎按题系历史派生,不接受自报。
- **grade** — 打分:全新上下文盲判,逐条 check 独立给 verdict(pass/partial/fail/no-evidence)+ 行号证据。可攒批:trial 落地即安全,grading 何时补都行。
- **review** — 复盘:`assess`(确定性重算)→ `explain`(证据链、novelty 分层、成长曲线、stale 标注)→ `next`(选题器:从题库选未做过的 unseen/variant 题,无题可选则 `create_needed`)。

### 系统不变量

- **事实不可变** — `transcripts/` 与 `data/trials.jsonl`、`data/gradings.jsonl` 只增不改;纠错走 retraction。
- **投影可再生** — `state/` 完全派生:`rm -rf state/ && assess` 逐字节重建(recency 用数据自身时钟)。
- **证据链完整** — 任何结论都能回溯到 transcript 具体行;task/grader 版本化,数值变化可区分"你变了"还是"标准变了"。
- **职责分离** — Agent 判断语义(逐 check verdict),CLI 计算每一个数字;展示用粗档位(weak/uneven/solid/strong),不输出假精确小数。
- **反锚定靠结构** — grader 预注册(时序隔离)+ 盲判 fresh context(空间隔离),不靠口头约定。

设计全文见 [docs/SPEC.md](docs/SPEC.md),决策记录见 [docs/adr/](docs/adr/),术语表见 [CONTEXT.md](CONTEXT.md)。

## 仓库布局：个人 agent toolkit

本仓库是 MaybeLL 的个人 agent toolkit，以 **plugin 为单元**开发自己用的能力：

- [plugins/evalme](plugins/evalme) — 能力评测系统（CLI + 1 个入口 skill，内含 5 个流程）
- [plugins/productivity](plugins/productivity) — 个人生产力 skill 合集（10 个 skill，纯 skill 无代码）

新增能力时按类型放：plugin（成套功能）、mcp（协议服务）、skill（纯技能）、cli（独立命令）。

## 前置依赖

只需要 **Node.js**(CLI 是单文件、零依赖的 `evalme.mjs`)。无数据库、无账号、无云同步。Git 即同步机制。

## 安装

三个宿主的安装方式不同。先确认对应命令可用(`claude --version`、`codex --version` 或 `pi --version`)，再按下列步骤执行。

### Claude Code

以下命令将 marketplace 和两个插件安装到当前用户范围(默认 scope)：

```bash
claude plugin marketplace add MaybeLL/ai-toolkit
claude plugin install evalme@maybell-plugins
claude plugin install productivity@maybell-plugins
```

安装后**完全退出并重新打开 Claude Code**，再开一个新会话。可用 `/plugin` 查看已安装插件；新会话中应能调用 `evalme` skill。

### Codex

以下命令注册本仓库的 `main` 分支为 marketplace，并安装两个插件：

```bash
codex plugin marketplace add MaybeLL/ai-toolkit --ref main
codex plugin add evalme@maybell-plugins
codex plugin add productivity@maybell-plugins
```

安装后开一个**新 Codex 会话**，让新安装的 skill 被发现。可用 `codex plugin list` 检查 marketplace 中的可用插件；新会话中应能调用 `$evalme` skill。

### Pi

以下命令把整个仓库作为 Pi package 安装到用户范围；Pi 会加载其中声明的 EvalMe 与 productivity skills：

```bash
pi install git:github.com/MaybeLL/ai-toolkit
```

若只想让当前项目使用它，追加 `-l`，即 `pi install git:github.com/MaybeLL/ai-toolkit -l`。重新启动 Pi 后，可用 `/skill:evalme` 开始。

三个宿主都只需要 Node.js。EvalMe 的用户数据不保存到当前项目，而是保存到 goal home（`EVALME_HOME` 或默认 `~/evalme/`）。

### 宿主安装粒度差异

| 宿主 | 安装粒度 | 能否只装一个 plugin |
|---|---|---|
| Claude Code | 按 plugin（`claude plugin install <name>@maybell-plugins`） | 可以，逐个装 |
| Codex | 按 plugin（`codex plugin add <name>@maybell-plugins`） | 可以，逐个装 |
| Pi | 按 package（整个仓库） | 一次全装；可加 `-l` 限定当前项目 |

Pi 以**仓库为粒度**：`pi install git:github.com/MaybeLL/ai-toolkit` 会加载 `package.json` 的 `pi.skills` 里声明的**所有** skill（目前是 evalme 的 1 个 + productivity 的 10 个）。新增 plugin 时把它加进 `pi.skills` 数组即可，pi 端新开会话自动可见。

若想只让 pi 加载部分 skill，两种方式：

1. `pi config` 交互式启用/禁用单个 skill；
2. settings.json 用对象形式过滤（如 `"skills": ["!plugins/evalme/skills"]` 排除某目录）。

## 更新到最新版 / 看不到新 skill 怎么办

`marketplace add owner/repo` 只拉 GitHub **默认分支**(本仓库默认分支为 `main`),
且 Claude Code 会把仓库缓存在本地、**不会自动重新拉取**——已知 issue 中 `marketplace update`
常常报"已是最新"却不真拉新提交。所以插件更新后若看不到新增/改动的 skill,用
**彻底重装 + 整会话重启**(最可靠):

```bash
claude plugin uninstall evalme@maybell-plugins
claude plugin uninstall productivity@maybell-plugins
claude plugin marketplace remove maybell-plugins
claude plugin marketplace add MaybeLL/ai-toolkit
claude plugin install evalme@maybell-plugins
claude plugin install productivity@maybell-plugins
```

然后**完全退出并重开 Claude Code**——新 skill 只有整会话重启后才注册,`/reload-plugins` 不够。
重启后 evalme 应看到一个 skill:`evalme`;productivity 应看到十个 skill(`explain-clearly` / `grilling` / `wait-what` 等)。

仍不出现时按此排查:

1. 确认 GitHub 默认分支确实是 `main`(否则拉到的旧分支上没有这些 skill)。
2. 清理卸载未删的缓存残留(路径以本机为准,先 `ls ~/.claude/plugins/` 看结构):
   `rm -rf ~/.claude/plugins/*maybell* ~/.claude/plugins/cache/*maybell* 2>/dev/null`。
3. `claude plugin list` 或 `/plugin` 面板确认装的是 `main` 的内容。

## 试用 worked example

仓库自带一个完整示例 workspace:[`plugins/evalme/examples/backend-system-design`](plugins/evalme/examples/backend-system-design)——题库(3 道 task + 1 个 common grader)、三条已判定的 trial、以及派生的健康度状态。

```bash
cd plugins/evalme/scripts
export EVALME_HOME=../examples/backend-system-design
node evalme.mjs status              # “现在该干嘛”:健康度 + 建议动作
node evalme.mjs explain idempotency # 证据链:每条结论能回溯到逐字稿行号
# 从事实重算,验证逐字节一致(INV-2):
rm -rf "$EVALME_HOME/state" && node evalme.mjs assess
```

## 卸载

数据由用户自持(住在 goal home:`EVALME_HOME` 或默认 `~/evalme/`),**卸载插件不会删除任何目标数据**——工具和数据的生命周期完全独立。

- Claude Code:`claude plugin uninstall evalme@maybell-plugins`（及 `productivity@maybell-plugins`）
- Codex:`codex plugin remove evalme@maybell-plugins`（及 `productivity@maybell-plugins`）
- Pi:`pi remove git:github.com/MaybeLL/ai-toolkit`

如果不再使用本仓库任何插件,可继续 `... plugin marketplace remove maybell-plugins`。

卸载后你的题库、逐字稿、判定记录仍在 goal home——纯文本可直接阅读,重装插件即刻接着用;想彻底清除则 `rm -rf ~/evalme`(及你自建的远端 repo)。

## 本地验证

```bash
node --check plugins/evalme/scripts/evalme.mjs
node scripts/validate-plugin-metadata.mjs
node scripts/validate-evalme-workflows.mjs
```

## 许可证

[MIT](LICENSE)
