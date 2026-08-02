# ADR-0005: 定标层换轴——Topic/Label 取代 Requirement,双 grader 承载横切能力,废除 dimension

- 状态:Accepted
- 日期:2026-02-14

## 背景

v0.1 定标层为 requirements:每条声明 `(capability, dimension)` 的 required(0-1 分数线)、
weight、critical。问题:required 是全系统仅存的凭空绝对数值(0.75 与真实及格线无换算
关系);capability×dimension 表格对用户反直觉;dimension 判定依赖 LLM 标签。

## 决策

1. **Requirement 删除,Topic 取代。** goal.yaml 声明 topics 清单:
   `{id, weight, critical?}`。topics 清单同时是 label 权威词表(evalme-forge 归一化时
   只许从词表选 label,加新词先进清单),防开放词汇同义漂移。
2. **Task 用 label 关联 topic**(去掉 targets)。聚合轴从 capability×dimension 换成 topic。
3. **达标判据定为外延式**:topic 健康度 = suite 覆盖 + unseen/variant 题近期通过情况
   + stale,不再有数值分数线。`required` 字段随 requirement 一起消亡。
4. **横切能力由 common grader 承载**(用户方案):打分 = task grader(题目特定内容
   checks)+ common grader(独立文件、自带 label、跨题复用、独立版本化,如
   communication)。grading 行以 grader_ref 锚定依据出处。common grader 可声明
   applies_to;修订开新版,与 task 版本化同构。
5. **Dimension 轴(recall/application/transfer)废除**,由 novelty 分层视图接任:
   "会背 vs 会用 vs 陌生场景会用"的区分改由 trial 的 novelty 事实字段
   (unseen/variant/repeat,引擎派生、不可自报)分层展示通过情况。

## 理由

- topic 是用户备考的自然语言("要练幂等、缓存,幂等最重要"),capability×dimension 不是。
- 外延式判据("能稳定通过该 topic 下的陌生题")可观察,数值分数线(0.75)是拍的——与
  砍 ΔCapability、砍展示精度同一把刀。
- 横切标准(如沟通)散写在每题 checks 里必然漂移;common grader 定义一次、跨题一致,
  恰是横切能力最需要的性质。这也是 v0.1 通用 rubric 的正确归宿(修订 ADR-0003 中
  "归一化模板"的定位:它是并行打分层)。
- novelty 是事实字段,比 LLM 判定的 dimension 标签可信;transfer 的本义就是
  "unseen/variant 题上的表现"。

## 后果

- estimator 聚合公式沿用,聚合键从 (capability, dimension) 换为 label;gap 计算重写为
  外延式健康度。
- grading 粒度为单条 check,verdict 经 label 分组聚合;check verdict 折算规则待定。
- a/b 达标判据分岔(数值 vs 外延)由本决策消解:只能走外延式。
