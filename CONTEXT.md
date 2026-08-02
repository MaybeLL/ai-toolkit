# CONTEXT — EvalMe 术语表

> 本文件只是术语表(ubiquitous language),不含实现细节。
> 适用范围:plugins/evalme 及 docs/SPEC.md。

## 术语

### Workspace
一个目标的全部数据所在的目录(goal.yaml、题库、事实、派生状态)。每个目标一个,互不影响。

### Requirement(已废弃,v0.2 起由 Topic 取代)
见 ADR-0005。

### Topic
goal.yaml 中声明的一个内容领域或横切行为(如 idempotency、caching、communication),带 weight(相对重要度)与可选 critical。topics 清单同时是 **label 权威词表**(治理开放词汇,防同义漂移)。取代 requirement 成为定标单元。

### Label
task 与 common grader 上的 topic 引用。task 级 label 标内容(题是关于什么的);common grader 自带 label 标横切行为。聚合时按 label 分组 grading。

### Capability / Dimension(已废弃)
v0.1 的心理测量构念轴(recall/application/transfer)。dimension 想区分的"会背 vs 会用 vs 陌生场景会用",由 **novelty 分层视图**接任(按 trial 的 unseen/variant/repeat 分层展示通过情况)——novelty 是引擎派生的事实字段,比 LLM 判定的维度标签更可信。见 ADR-0005。

### Task
题库中的一道题:题面(prompt)+ 预注册 task grader + labels(引用 topics 词表)+ difficulty。一经有 grading 引用即不可变,修订开新版本(题系名 + 版本号)。评价标准的**组织轴**。**一切 grading 必锚定某个 grader**:外来 transcript(真实面试等)入库时现场归一化出一个 task(ADR-0003)。

### Origin(task 属性)
task 的来源标记:`generated`(LLM 按缺口出题,grader 预注册)/ `imported`(用户上传题目,grader 在作答前补写,仍预注册)/ `imported-live`(从已发生的表现反推,grader 事后写,**非**预注册)。estimator 可据此区分对待。

### Grader
评分逻辑,由若干条 check 组成,分两类(一次 trial 的打分 = 两类并行):
- **Task grader**:附属于某道题,测题目特定的内容要点,正常情况下预注册(`imported-live` 除外)。
- **Common grader**:独立文件(graders/<name>-v<N>.yaml),自带 label,承载横切行为(如 communication),跨题复用、独立版本化,可声明适用范围(applies_to)。v0.1 通用 rubric 的归宿。

grading 行以 `grader_ref` 锚定判定依据(task_ref 或 common grader 版本)。

### Run(非正式术语)
口语中指"跑一场评测"(取题→主持→存稿→打分)。**不是 schema 实体,无状态**:它的产物就是一条 trial + 若干 grading,进度由既有文件推导(有 trial 无 grading = 待打分)。见 ADR-0002。

### Trial
对一个 task 的一次尝试的**事实记录**(不可变,append-only,存于 trials.jsonl)。含时间、条件、task_ref、transcript 引用及其内容哈希。不含任何评价。同一 task 的多条 trial 构成该能力的成长曲线切片。取代 v0.1 的 "event"。

### Transcript
一次尝试的完整过程记录文件(面试逐字稿等),只增不改,哈希公证。取代 v0.1 的 "artifact"。

### Grading
LLM 按 grader 对 transcript 逐条 check 判定后产出的结构化结果(append-only,存于 gradings.jsonl)。每条以 `grader_ref`(task 版本或 common grader 版本 + check id)锚定判定依据、指向 transcript 具体行号。取代 v0.1 的 "observation";动作/命令为 `evalme grade`(取代 `goal observe`)。

### Retraction
撤销一条记错的 trial 的追加事件。纠错的唯一路径(事实不可变)。

### Assess / Gap / Plan
(聚合轴 v0.2 起为 topic)assess = 读模型刷新,把全部 gradings 按 label 确定性聚合;gap = 每个 topic 的外延式健康度(suite 覆盖 + unseen/variant 题近期通过情况 + stale),不再有数值分数线;plan = 基于 gap 的选题决策(Agent 设计、CLI 校验)。
