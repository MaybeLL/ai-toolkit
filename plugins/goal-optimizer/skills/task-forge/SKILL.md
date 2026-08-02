---
name: task-forge
description: 制题(M2):按缺口出题、导入用户上传的题目素材、从工作收获/学习笔记等任意材料抽取 task、把真实面试 transcript 归一化为 imported-live task、修订 task/common grader(开新版)、参考答案质检。当用户想出新题、贴来一道面试真题、想把一段值得沉淀的知识/经验变成可练习的题、想把一场已发生的真实面试入库(先归一化)、或要改评分标准时使用。出完题不主持(那是 goal-drill)、不打分(那是 goal-grade)。
---

# Task Forge(制题:题面 + 预注册 grader)

题库是系统的量具。一道 task = 题面(prompt)+ 预注册 grader(checks)+ labels + difficulty + 参考答案。

**三种来源(origin,ADR-0003):**

| origin | 场景 | grader 何时写 |
|---|---|---|
| `generated` | 按 goal-review 的缺口(`forge_needed`)出新题 | 出题时,预注册 |
| `imported` | 用户上传题面(面经、真题) | 作答**前**补写,仍预注册 |
| `imported-live` | 真实面试已发生,从 transcript 反推 | 事后写,**非**预注册(estimator 自动降权) |

## CLI 协议

`<scripts>` = 本 SKILL.md 上两级的 `scripts/` 目录。

**数据位置(ADR-0010)**:数据住在 goal home——唯一的位置开关是 `GOAL_OPTIMIZER_HOME` 环境变量(不设则默认 `~/goal-optimizer/`),无配置文件。与当前所在项目仓库无关,任何目录直接使用,不需要任何路径参数。CLI 自动选中唯一目标;多目标时加 `--goal <id>`。

**同步(ADR-0011)**:会话开始动数据前,若 goal home 是 git 仓库且有 remote → 先 `git pull --ff-only`(失败则告知用户先解决,别在旧数据上继续写)。会话结束且有改动 → `node <scripts>/goal.mjs sync --message "task-forge: <摘要>"`(commit+pull+push 一步;失败不阻塞——本地已落盘即安全,CLI 会在 assess/list 里持续报欠账)。home 不是 git 仓库或无 remote 时 sync 自动降级/跳过,不打扰单机用户。

```
node <scripts>/goal.mjs task add --file <task.yaml>    # 也接受 stdin
node <scripts>/goal.mjs task show <ref|family> [--prompt-only]
node <scripts>/goal.mjs grader add --file <grader.yaml>   # common grader
```

task YAML 形状(全部字段见 SPEC §4.2):

```yaml
task: coupon-idempotency      # 题系名;文件名/引用 = <题系名>-v<version>
version: 1
origin: generated
labels: [idempotency]         # 必须出自 goal.yaml topics 词表(不含 cross_cutting)
difficulty: 0.6               # 题目固有属性,一次标定
variant_of: payment-idempotency   # 可选:已知题系的变式(novelty 派生用)
prompt: |
  <题面>
grader:
  checks:
    - id: c1
      text: <可从 transcript 文本指认的行为>
      must_pass: true         # 可选:此条 fail 则整题不过
reference_solution: |
  <一份应当全 pass 的参考答案>
```

## 流程

### 出题(generated)

1. 读 goal-review 给的缺口(topic + mode);**不要读该 topic 的历史 transcript 细节**——按 topic 出题,不按用户的具体弱点反向定制题面(防 teaching-to-test)。
2. 写 check 的纪律:每条 = **条件 + 可观察行为 + 判别标准**,禁止形容词("清晰""熟练");问自己"强者和弱者在这条上会留下可从文本指认的不同行为吗?"。
3. 生成 reference_solution。
4. **质检**:模拟以判定者视角拿参考答案对照 checks,应全 pass;不能全 pass 说明题或 grader 有病,先修。
5. `task add` 入库,把 task_ref 告诉用户。

### 导入(imported)

用户贴题面 → 你按词表标 labels、定 difficulty、起草 checks → **用户确认 grader** → 入库。确认必须发生在用户作答之前(预注册)。

### 材料抽题(imported 的变体:输入不是题面)

用户给的不是题,而是一段**值得沉淀的材料**——工作中踩过的坑、学习笔记里的精彩段落、一次技术讨论的结论。抽题流程:

1. **提炼考点**:这段材料真正考验的能力是什么?强者和弱者在这个点上会留下什么不同行为?(不是"背出这段话",而是"在新场景里用出这个判断")
2. **反推题面**:设计一个能自然诱出该考点的任务场景——优先选与材料原场景**不同**的业务背景(考迁移,不考复述);若考点属于已有题系的变式,标 `variant_of`。
3. **材料入 checks**:材料里的关键判断("必须区分 X 与 Y""边界在 Z")提炼成可指认的 check;材料本身可作为 reference_solution 的骨架。
4. label 不在词表时提醒用户:这可能是个新 topic,去 goal-define 加词(顺便定 weight)。
5. 后续同 imported:用户确认 grader → 入库。origin 仍是 `imported`(预注册性质相同:题在作答前存在)。

这条路径是系统的低门槛进食口:材料随时可以抛进来变成题,哪天想练再练。

### 归一化(imported-live)

真实面试已发生:从 transcript 反推题面 → 起草 grader(用户确认)→ `origin: imported-live` 入库 → 告诉用户接下来走 goal-drill 的 record(type=real_interview)再 goal-grade。

### 修订

task/grader 一经 grading 引用即不可变;修订 = 新版本文件(version+1,CLI 强制版本连续)。修订后可对旧 trial 重判(goal-grade),聚合自动取最新版本判定。

## 红线

- label 不在词表 → 先去 goal-define 加词,不得私造。
- 不给 drill 泄 grader:出完题只交 task_ref;主持人只能 `task show --prompt-only`。
- 你不打分、不主持。制完即止。
