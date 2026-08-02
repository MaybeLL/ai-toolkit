# ADR-0001: spec-v0.2 围绕 Task 中心模型重写,而非在 v0.1 上增补

- 状态:Accepted
- 日期:2026-02-14

## 背景

spec-v0.1 以 capability 为评价组织轴:一份通用 rubric(按能力组织的行为锚点)量一切 artifact。
讨论(参考 Anthropic "Demystifying evals for AI agents")确认系统本质是"对人的能力评测",
应采用 agent 评测的组织方式:评价标准跟随任务(task 自带预注册 grader),而非通用尺子。

这不是加模块,而是换组织轴:rubric 降级为 taxonomy + 兜底 grader,observe 输入从
"artifact + 通用 rubric"变为"transcript + 该 task 的 grader",goal-grill 出题流程重构。

## 决策

v0.2 整体重写,叙事轴从能力换成任务。显式继承不变的部分:

- 六条系统不变量 INV-1~6(事实不可变、投影可再生、证据链完整、皆带版本、职责分离、无外部依赖)
- 事实 / 推断 / 决策三层分离
- estimator 的加权聚合与置信度公式(§5)
- 系统定位:测量/信任系统(让用户对自己能力的判断有据可查),优化(next)是其上的便利视图

## 理由

1. v0.1 是未实现的 Draft——现在是唯一零迁移成本的重写窗口。
2. 补丁式演进会让 SPEC 出现两套并存的世界观(能力轴 + 任务轴),比重写更难读。

## 后果

- v0.1 的 §4.3(通用 rubric)、§6.2(observe)、§7(goal-grill 流程)被实质替换。
- 尚未产生任何真实数据,无迁移。
