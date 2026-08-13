# ADR-0009: 组卷器(exam)——确定性组一场整卷模拟面试

- 状态:Accepted
- 日期:2026-02-14

## 背景

产品 feature "模拟指定 goal 的整场面试" 只被支持了一半:多题 session 机制齐全
(session_id、散场后统一反馈、confidence 按场次去重),但没有"组卷"能力——
这场面试考哪几道题,只能人工挑。

## 决策

新增确定性只读命令 `evalme exam`(选题器 next 的姊妹,同属 M6 读取侧):

- 输入:`--size N`(默认 4)。
- 逻辑(纯确定性,无 LLM):
  1. 取全部非 cross_cutting topic,按 weight 降序(tie: id 字典序);
  2. 每个 topic 的候选 = suite 中**未尝试**的题系(would-be novelty 为
     unseen/variant),按题系名排序;无未尝试题系时退化为尝试次数最少者;
  3. 按 topic 顺序轮转(round-robin)取题,跨 topic 去重题系,直到满 N 或耗尽;
  4. 输出卷面(task_ref + topic + would_be_novelty)、本次调用新生成的建议 session_id、
     覆盖不足警告(有 weight 但无题可选的 topic → create_needed)。
- 消费方:evalme-practice 的"整场模拟"流程——按卷面顺序主持,共享 session,
  散场后统一反馈(ADR-0008)。

## 理由

- 与 next 的分工:next 回答"单点练什么"(补最弱),exam 回答"整场考什么"
  (加权覆盖)。两者都是题库上的确定性选题视图,不引入新数据。
- 组卷进 CLI 而非 skill 即兴挑题:卷面可复现、偏好可解释(INV-5——
  选择逻辑也是数字工作)。

## 后果

- 纯读取,不写任何文件;不在 INV-2 投影范围(与 list 同类)。卷面选择对同一证据状态
  保持确定性;session_id 是运行身份,使用当前日期 + 随机后缀生成,不能从 evidence
  `as_of` 派生,否则无新 trial 时多场面试会错误复用同一 session。
- practice 的多题流程获得标准入口;卷面仍可被用户手工覆盖(exam 只是建议)。
