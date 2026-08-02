# ADR-0003: 单一打分管道——外来 transcript 归一化为 imported task,不设兜底双轨

- 状态:Accepted
- 日期:2026-02-14

## 背景

题库 task 有预注册 grader;但真实面试、他人主持的模拟面试产生的 transcript 没有对应
task。曾考虑双轨:兜底通用 grader 作为独立打分路径,grading 允许 task_ref: null。

## 决策

系统只有一条打分管道:一切 grading 必锚定某个 task。外来 transcript 入库时现场归一化——
LLM 从 transcript 反推题面、按 taxonomy 起草 grader、用户确认后生成
`tasks/<name>-v1.yaml`,origin 标 `imported-live`,随后走与题库题完全相同的 grade 路径。

task 的 origin 取值:
- `generated`:LLM 按缺口出题,grader 预注册。
- `imported`:用户上传题目素材,作答前补写 grader,仍预注册。
- `imported-live`:从已发生的表现反推,grader 事后写,非预注册。

## 理由

1. "没有 task 就造一个 task"比"允许没有 task"便宜:单一数据形状,assess/explain/
   suite 视图无需处理两种 grading。特殊性收敛在入管一刻。
2. 复用已有的"用户素材归一化入管"机制,真实面试只是 imported 的一个特例。
3. 事后写 grader 失去预注册性,但以 origin 字段如实标注,estimator 的 reliability
   因子可区分对待,不假装同质。

## 后果

- 兜底通用 grader 降级为 imported-live 归一化时的起草模板,不是运行时路径。
- 入管步骤变重(反推题面 + 用户确认 grader),由 goal-log 侧 skill 流程承担。
