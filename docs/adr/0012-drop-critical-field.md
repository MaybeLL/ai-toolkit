# ADR-0012: 废除 topic 的 critical 字段

- 状态:Accepted
- 日期:2026-02-14

## 背景

critical 的设计意图是"门槛项:不健康则目标整体不达标"。第一次真实使用
(harness-interview 定标)暴露问题:Agent 起草 9 个 topic 标了 4 个 critical,
用户被迫花心智裁决"哪些真算门槛"。复查代码发现其名义功能并不存在——
系统没有任何"整体 ready"输出;实际功能只有排序置顶(weight 排序已覆盖)
与 list 的单独计数(边际)。

## 决策

删除 critical 字段。排序统一按 priority(weight × deficit × confidence 因子);
"这项不行是否必挂"的裁决属于复盘时的人,不属于 schema。与删 --workspace、
删 config.json 同一原则:两个入口表达同一语义(重要程度)时,砍掉弱的那个。

## 后果

- goal.yaml schema、health/next 输出、list 排序与展示中 critical 全部移除;
  weight 建议 0.1 步长(不装精度)。
- 旧 goal.yaml 若含 critical 字段:引擎忽略未知字段,无迁移(loadYaml 宽容)。
- 失去"绝对置顶":weight 0.9 的不健康项本来就排前,实际损失≈0。
