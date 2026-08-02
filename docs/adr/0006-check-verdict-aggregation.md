# ADR-0006: check verdict 折算规则——no-evidence 剔除,题级通过用折算率阈值 + 可选 must-pass

- 状态:Accepted
- 日期:2026-02-14

## 背景

grading 粒度是单条 check(pass/partial/fail/no-evidence)。外延式健康度需要题级
"过/不过"判定,estimator 聚合需要数值。

## 决策

1. **no-evidence 从聚合中剔除**(不算过也不算不过),但 suite 视图计数展示。
   高 no-evidence 率是"题未引出考点/跑题"的信号,值得可见,不值得惩罚。
2. **题级通过 = 折算率阈值**:pass=1 / partial=0.5 / fail=0,有效 check(剔除
   no-evidence)均值 ≥ 阈值(默认 0.7)。保留 partial credit,判据可解释。
3. **可选 must-pass**:task grader 可标个别 check 为 must-pass,该 check fail 则
   整题不过(v0.1 critical 思想下放到 check 级)。可选字段,不强制。

## 后果

- 全 pass 才过(太苛)与无题级判定(外延式判据失去着落)两个候选被否。
- 阈值 0.7 是拍的,但只影响"过/不过"边界且随时可调(派生层参数,非事实)。
