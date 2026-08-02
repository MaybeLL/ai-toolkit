# ADR-0007: skill 版图定为五个,按数据所有权划界

- 状态:Accepted
- 日期:2026-02-14

## 背景

v0.1 有四个 skill(goal-manage/grill/log/review)。task 化后新增两块重职责:制题
(出题、导入、imported-live 归一化、grader 修订、质检)与逐 check 盲判。曾考虑在旧
skill 上增补,被否——应从新模型的自然用户活动出发重推。

## 决策

五个 skill,对应考试制度的五环节,与模块 M1-M6 对齐(M5 assess 无 skill,纯 CLI):

| Skill | 活动 | 模块 |
|---|---|---|
| evalme-define | 定标:topics(weight/critical)+ 词表治理;跨目标 list | M1 |
| evalme-forge | 制题:出题 / 导入 / imported-live 归一化 / grader 修订 / 参考答案质检 | M2 |
| evalme-drill | 施测:取题(--prompt-only)主持 → transcript → record trial | M3 |
| evalme-grade | 判定:fresh context 盲判,逐 check 独立,可攒批 | M4 |
| evalme-review | 复盘:assess → explain(novelty 分层、成长曲线)→ next(选题器) | M6 |

## 划界依据

- forge / drill / grade 三者边界由反锚定强制:出题与主持之间靠预注册时序隔离,
  主持与判分之间靠 fresh context 隔离,不可合并。
- drill 吞下 record(主持完顺手入库,会话闭环);imported-live 归一化归 forge
  (它就是归一化工作流的家),transcript 随后直接交 grade。
- define 与 review 都是目标层读写活动,若嫌五个多可合并为 goal-console;v1 先分开。

## 后果

- v0.1 的 goal-manage 拆为 define + forge;goal-grill → drill;goal-log → grade
  (record 移入 drill);evalme-review 保留。
