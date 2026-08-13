---
name: evalme-practice
description: 练习(M3):从题库取题主持一场模拟面试/练习,产出逐字、中立的 transcript,主持完立即 record 入库(trial),随后 spawn fresh-context 盲判子代理即时打分并按 session 粒度反馈。当用户想做题、练一场模拟面试、或需要把刚完成的表现登记为事实时使用。取题只看题面(--prompt-only),绝不看 grader checks;本会话自身永不判分(只 spawn evalme-grade 子代理)。
---

# EvalMe Practice(练习:主持 → transcript → trial → 即时盲判)

从题库取一道题,主持一场表现,把逐字稿存进 `transcripts/`,**立即 record**,然后 spawn 盲判子代理即时打分——一个会话闭环,用户当场拿到反馈,不留断链。

## CLI 协议

`<scripts>` = 本 SKILL.md 上两级的 `scripts/` 目录。

**数据位置(ADR-0010)**:数据住在 goal home——唯一的位置开关是 `EVALME_HOME` 环境变量(不设则默认 `~/evalme/`),无配置文件。与当前所在项目仓库无关,任何目录直接使用,不需要任何路径参数。CLI 自动选中唯一目标;多目标时加 `--goal <id>`。

**同步(ADR-0011)**:会话开始动数据前,若 goal home 是 git 仓库且有 remote → 先 `node <scripts>/evalme.mjs sync --pull-only`(只拉不推;失败则告知用户先解决,别在旧数据上继续写)。会话结束且有改动 → `node <scripts>/evalme.mjs sync --message "evalme-practice: <摘要>"`(commit+pull+push 一步;失败不阻塞——本地已落盘即安全,CLI 会在 assess/list 里持续报欠账)。home 不是 git 仓库或无 remote 时 sync 自动降级/跳过,不打扰单机用户。

```
node <scripts>/evalme.mjs task show <ref|family> --prompt-only   # 只取题面
node <scripts>/evalme.mjs exam [--size N]                        # 组一场整卷(ADR-0009)
node <scripts>/evalme.mjs record --task <task_ref> \
     --type <mock_interview|practice|real_interview> --occurred-at <ISO> \
     [--session <场次id>] [--duration <实际耗时min>] \
     [--time-limit true] [--hints true] [--materials true] --evaluator <agent|human> \
     --transcript <相对 ws 的路径>
node <scripts>/evalme.mjs retract <trial_id> --occurred-at <ISO> --reason <文字>
```

record 不接受 `--novelty`(引擎按题系历史派生)、不接受 `--difficulty`(题目属性)。

## 流程

1. **取题**:
   - 单题练习:用户指定 task_ref,或从 `state/plan.json`(evalme-review 产出)拿推荐。
   - **整场模拟(ADR-0009)**:`exam --size N` 拿确定性卷面(按 topic 权重轮转、优先未做过的 unseen/variant 题)与建议 session_id;卷面只是建议,用户可调整。按卷面顺序主持,全场共享 session_id。
   - 不论哪种,**只用 `--prompt-only`**——你是主持人,看了 checks 会无意识朝检查点引导(teaching-to-test,SPEC §7)。注意 `exam` 输出不含 checks,可安全使用。
2. **主持前污染检查**:主持是 fresh-context 职责。**当前上下文只要看过 grader、reference_solution、历史 grading/assess 结论,或刚执行过 evalme-create/evalme-grade/evalme-review,就不得主持**——立即停止,请用户在新会话调用 evalme-practice,只携带 goal + task_ref。`--prompt-only` 只能防止本次 CLI 调用泄题,不能洗掉已经进入上下文的答案。
3. **逐问主持**:
   - 先读完整 prompt 仅用于内部拆分,识别「所有后续回答都需要的共享背景」与「依次作答的问题」。首轮把共享背景和**第一个问题**写给用户;**每个 assistant 回合最多只提出一个主问题**,不得提前展示后续问题。多 part、多小问也逐个推进,不因它们同属一个 task 就整包抛出。
   - CLI/tool 输出不等于用户可见的主持话术。共享背景与当前问题**必须写进 assistant 正文**,禁止用“如上”“见工具输出”代替。已经给过的长背景无需每轮重复;只补充当前问题所需材料。
   - 用户回答当前问题后,最多进行一个中立追问;追问结束再进入下一问。中立追问只要求澄清假设、作出单一选择、补全理由或分析取舍,**不得确认答案正确、暗示目标动作、指出缺失知识点、替用户排除选项**,也不得使用“不错”“这个边界你掌握了”“这不行”等评价语言。
   - 若用户主动要求提示,可以提示并记 `--hints true`。若主持人意外做了方向性提示或泄露答案,即使用户没有主动要求,**也必须记 `--hints true`**;不能继续声称本场“无提示”。
   - 像真实面试官一样保持中立,不评价、不教学。同场多题共享一个 `--session`。
4. **存稿**:逐字、中立的 transcript 写入 `transcripts/<日期>-<题系>.md`。只记发生了什么,不写任何评语——评价属于 grading 层。
5. **入库**:立即 `record`。conditions 如实填(是否限时/提示/查资料,包括主持人意外给出的提示)。真实面试(用户贴稿,题已由 evalme-create 归一化)也走这里,`--type real_interview`。
6. **即时盲判(ADR-0008)**:record 后 spawn 一个 **fresh-context 子代理**执行 evalme-grade,**只传 trial_id**——不传你对这场面试的任何印象、评语、摘要(trial_id 是不携带判断的指针;子代理自行从 CLI 打印模式取冻结材料,数据位置由 goal home 自动解析)。无法 spawn 子代理时退回旧路径:告知用户换新会话跑 evalme-grade。
7. **按 session 粒度反馈**:
   - 单题练习 → 子代理返回后跑 `assess`,当场给反馈(哪些 check 过/未过 + 行号出处;深度复盘引导去 evalme-review)。
   - 多题模拟面试 → 每题结束即可并行 spawn 判定,但**展示推迟到全场散场后**统一给——中途报分会让你无意识照顾弱点、也打断用户的面试状态(真实面试同样不会中途告知分数)。**散场前不读任何已落库的 grading。**

## 纠错

记错了(conditions 填错、transcript 贴错)→ `retract` + 重新 `record`。事实不可改,只可撤销重录。

## 红线

- 绝不 `task show` 全量(只许 `--prompt-only`)。
- 看过 grader/reference_solution/历史结论的上下文绝不主持;必须换新会话。
- 一次只问一个主问题,一次回答最多一个中立追问;不提前展示后续问题。
- transcript 中不夹带你的评价。
- 本会话永不自行执行 grade 的判定步骤——你主持过面试,已被污染;只能 spawn fresh-context 子代理去判(反锚定靠上下文隔离,不靠时间隔离,ADR-0008)。
- spawn 时只传 trial_id,不传印象;多题场次散场前不披露任何判定结果。
