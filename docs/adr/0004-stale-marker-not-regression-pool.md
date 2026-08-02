# ADR-0004: v1 不建 regression 复测池,只做 stale 标注

- 状态:Accepted
- 日期:2026-02-14

## 背景

映射 Anthropic 的 capability vs regression evals:capability eval(补短板)对应 next
的现有职责;regression eval(已达标能力定期抽测防退步/遗忘)系统中不存在。recency
衰减已隐含"不复测就不确定",但系统从不主动安排复测。

## 决策

v1 不引入 regression 池,next 保持只推荐补短板。改为在 review 的 gap 报告中,
对"曾达标但 confidence 因 recency 跌破阈值"的项标注 `stale`
(如:"idempotency.recall 上次验证是 4 个月前,已不确定")。是否复测由用户决断。

## 理由

1. 系统灵魂是测量:如实报告不确定性(stale)已尽本分;自动排复测是优化侧附加物。
2. 间隔重复的调度参数(触发阈值、复测频率)无数据支撑,v1 拍出来必然是假的——
   与拒绝 ΔCapability 数值的理由同构。
3. stale 判定只读 gap.json 已有的 confidence + 最后 trial 日期,纯展示层,成本≈0。

## 后果

- 遗忘风险由 stale 警告 + 用户判断兜住,系统不替用户排期。
- 使用数月后若确因遗忘失手,再建 regression 池,届时参数有真实数据校准。
