---
name: goal-drill
description: 施测(M3):从题库取题主持一场模拟面试/练习,产出逐字、中立的 transcript,主持完立即 record 入库(trial),随后 spawn fresh-context 盲判子代理即时打分并按 session 粒度反馈。当用户想做题、练一场模拟面试、或需要把刚完成的表现登记为事实时使用。取题只看题面(--prompt-only),绝不看 grader checks;本会话自身永不判分(只 spawn goal-grade 子代理)。
---

# Goal Drill(施测:主持 → transcript → trial → 即时盲判)

从题库取一道题,主持一场表现,把逐字稿存进 `transcripts/`,**立即 record**,然后 spawn 盲判子代理即时打分——一个会话闭环,用户当场拿到反馈,不留断链。

## CLI 协议

`<scripts>` = 本 SKILL.md 上两级的 `scripts/` 目录。

**数据位置(ADR-0010)**:数据住在 goal home——唯一的位置开关是 `GOAL_OPTIMIZER_HOME` 环境变量(不设则默认 `~/goal-optimizer/`),无配置文件。与当前所在项目仓库无关,任何目录直接使用,不需要任何路径参数。CLI 自动选中唯一目标;多目标时加 `--goal <id>`。

```
node <scripts>/goal.mjs task show <ref|family> --prompt-only   # 只取题面
node <scripts>/goal.mjs exam [--size N]                        # 组一场整卷(ADR-0009)
node <scripts>/goal.mjs record --task <task_ref> \
     --type <mock_interview|practice|real_interview> --occurred-at <ISO> \
     [--session <场次id>] [--duration <实际耗时min>] \
     [--time-limit true] [--hints true] [--materials true] --evaluator <agent|human> \
     --transcript <相对 ws 的路径>
node <scripts>/goal.mjs retract <trial_id> --occurred-at <ISO> --reason <文字>
```

record 不接受 `--novelty`(引擎按题系历史派生)、不接受 `--difficulty`(题目属性)。

## 流程

1. **取题**:
   - 单题练习:用户指定 task_ref,或从 `state/plan.json`(goal-review 产出)拿推荐。
   - **整场模拟(ADR-0009)**:`exam --size N` 拿确定性卷面(按 topic 权重轮转、优先未做过的 unseen/variant 题)与建议 session_id;卷面只是建议,用户可调整。按卷面顺序主持,全场共享 session_id。
   - 不论哪种,**只用 `--prompt-only`**——你是主持人,看了 checks 会无意识朝检查点引导(teaching-to-test,SPEC §7)。注意 `exam` 输出不含 checks,可安全使用。
2. **主持**:按题面出题;像真实面试官那样追问,但**不评价、不提示、不教学**(除非用户明确要求提示——那要如实记 `--hints true`)。同场多题共享一个 `--session`。
3. **存稿**:逐字、中立的 transcript 写入 `transcripts/<日期>-<题系>.md`。只记发生了什么,不写任何评语——评价属于 grading 层。
4. **入库**:立即 `record`。conditions 如实填(是否限时/提示/查资料)。真实面试(用户贴稿,题已由 task-forge 归一化)也走这里,`--type real_interview`。
5. **即时盲判(ADR-0008)**:record 后 spawn 一个 **fresh-context 子代理**执行 goal-grade,**只传 trial_id**——不传你对这场面试的任何印象、评语、摘要(trial_id 是不携带判断的指针;子代理自行从 CLI 打印模式取冻结材料,数据位置由 goal home 自动解析)。无法 spawn 子代理时退回旧路径:告知用户换新会话跑 goal-grade。
6. **按 session 粒度反馈**:
   - 单题练习 → 子代理返回后跑 `assess`,当场给反馈(哪些 check 过/未过 + 行号出处;深度复盘引导去 goal-review)。
   - 多题模拟面试 → 每题结束即可并行 spawn 判定,但**展示推迟到全场散场后**统一给——中途报分会让你无意识照顾弱点、也打断用户的面试状态(真实面试同样不会中途告知分数)。**散场前不读任何已落库的 grading。**

## 纠错

记错了(conditions 填错、transcript 贴错)→ `retract` + 重新 `record`。事实不可改,只可撤销重录。

## 红线

- 绝不 `task show` 全量(只许 `--prompt-only`)。
- transcript 中不夹带你的评价。
- 本会话永不自行执行 grade 的判定步骤——你主持过面试,已被污染;只能 spawn fresh-context 子代理去判(反锚定靠上下文隔离,不靠时间隔离,ADR-0008)。
- spawn 时只传 trial_id,不传印象;多题场次散场前不披露任何判定结果。
