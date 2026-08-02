---
name: goal-define
description: 定标(M1):创建/修订目标与 topics 清单(weight/critical/cross_cutting),治理 label 权威词表;跨目标总览(list)。当用户想建一个新目标、调整 topic 优先级、给词表加新词、归档删除目标、或想看所有目标的健康概览时使用。制题归 task-forge,施测归 goal-drill,复盘归 goal-review。
---

# Goal Define(定标:目标 + topics 词表)

目标的全生命周期:建 workspace、起草/修订 `goal.yaml` 的 topics 清单、跨目标总览、归档删除。

**topics 清单是两样东西合一(ADR-0005):**

1. **优先级声明** — 每个 topic 的 weight(相对重要度)与 critical(门槛项)。
2. **label 权威词表** — task 与 common grader 的 label 必须出自此清单;要用新词,先加进清单再 commit。这是防同义漂移(`idempotency` vs `幂等`)的唯一治理点。

**没有数值分数线。** 达标是外延式的(SPEC §5.4):该 topic 下 unseen/variant 题的通过情况 + 覆盖 + 无 must_pass 失败 + 非 stale。不要替用户发明 `required: 0.75` 这类字段。

## CLI 协议

把 `<scripts>` 解析为本 SKILL.md 上两级(插件根)的 `scripts/` 目录,脚本为 `<scripts>/goal.mjs`,用 `node` 运行(零依赖)。

**数据位置(ADR-0010)**:数据住在 goal home——唯一的位置开关是 `GOAL_OPTIMIZER_HOME` 环境变量(不设则默认 `~/goal-optimizer/`),无配置文件。与当前所在项目仓库无关,任何目录直接使用。`init --goal-id <id>` 建在 `<home>/<id>`;`list` 扫 home;多目标时其他命令加 `--goal <id>`。

```
node <scripts>/goal.mjs init --goal-id <id> [--title <t>] [--created-at <YYYY-MM-DD>]
node <scripts>/goal.mjs list [--root <dir>] [--json]     # 只读,不触发 assess;默认扫 goal home
```

## 流程

### 建目标

1. `init --goal-id <id>` 在 goal home 搭骨架(已存在 goal.yaml 会拒绝覆盖)。home 是新建的话,建议用户顺手 `git init` + 私有远端——异地备份 + 跨设备同步(`state/` 可进 .gitignore,它可再生);多设备使用纪律:开练前 pull,练完 push。
2. **陪用户起草 topics**:问清楚这个目标真正考什么(内容领域)、哪些横切行为也算数(如 communication,标 `cross_cutting: true`)。weight/critical 是用户的决策——你起草,**用户确认后生效**。
3. 检查 `graders/communication-v1.yaml` 模板是否贴合,不贴合陪用户改(生效前可自由改;一经 grading 引用即不可变)。
4. 交接:制题去 **task-forge**(没有题,一切都测不了)。

### 修订 topics

- 加 topic / 调 weight:直接编辑 goal.yaml + git commit(git 即版本机制)。
- **删 topic 前先查**:是否有 task/grader 还在用这个 label(`grep -l` tasks/ graders/)。有引用就别删,先讨论。

### 归档删除

删 workspace 目录 + git 记录即可,无破坏性命令。提醒用户:数据自持,卸载插件不删数据。

## 红线

- 不代填 weight/critical——起草可以,定稿必须用户确认。
- `list` 是只读的,展示的是最近一次 assess 的结果,可能滞后;要最新数值让用户走 goal-review。
