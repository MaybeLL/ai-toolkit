# ADR-0008: 判定即时化——盲判由 practice 会话 spawn fresh-context 子代理执行,反馈按 session 粒度

- 状态:Accepted
- 日期:2026-02-14

## 背景

原设计把判定(M4)定位为"可延后攒批",默认路径是 practice 之后另开会话消化存货。
产品审视发现:用户答完一道题的最强需求恰是"马上知道自己表现如何",延迟反馈
是弃用风险。而反锚定(SPEC §7)真正要求的是**上下文隔离**,不是**时间隔离**——
攒批只是工程便利,不应包装成纪律。

## 决策

1. **判定默认紧随 record**:evalme-practice 会话在 record 后 spawn 一个 fresh-context
   盲判子代理,只传 trial_id(不携带任何印象/评语的指针)。子代理自行
   `grade <trial_id>`(打印模式取冻结材料)→ 逐 check 判定 → `--write` 落库。
2. **反馈按 session 粒度**:
   - 单题练习(session 只此一题)→ 判完当场反馈。
   - 多题模拟面试 → 每题结束即可并行 spawn 判定,但**展示推迟到全场散场后**
     统一给——中途反馈会让主持人无意识照顾弱点、也打断用户的面试状态
     (真实面试同样不会中途告知分数)。
3. **攒批降级为兜底路径**:真实面试导入、grader 修订后的重判、当场无法
   spawn 时的欠账,仍走独立 evalme-grade 会话;"有 trial 无 grading"的存货
   提醒(assess/list)保留。

## 隔离论证

主持与盲判的隔离墙均未破:
- 主持侧:practice 必须从 clean context 开始,只能读取 prompt-only。曾创建这道题、
  看过 grader/reference_solution 或历史结论的会话不能切换角色继续主持;必须新开上下文,
  只传 goal + task_ref。主持逐问披露,方向性引导如实记 hints。
- 输入侧:子代理 fresh context,材料只来自 CLI 打印模式(transcript + graders,
  无历史结论);trial_id 本身不携带判断。
- grader 侧:预注册不变,标准仍是答题前冻结的。

放弃的批内一致性可接受:check 级行为锚点本就为收窄单次判定漂移而设计,
一致性主要靠 grader 质量,不靠同批执行。

## 后果

- evalme-practice 增加"盲判子代理交接 + session 粒度反馈"流程;practice 会话仍不得
  自行判定(它只 spawn,不判)。
- evalme-grade 职责不变,新增"可被 practice 以子代理方式调用"的形态。
- 无 CLI/schema 改动:grade 命令与 gradings 契约原样复用。
