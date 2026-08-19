# ADR-0014: 一个入口 Skill——UX 按用户意图组织,反锚定靠子代理

- 状态:Accepted
- 日期:2026-08-19

## 背景

ADR-0007 把系统组织成五个 skill(evalme-define/create/practice/grade/review),
与考试制度五环节一一对应。第一次真实使用(harness-interview)与用户反馈暴露:
**UX 按系统内部架构(M1–M6)组织,而不是按用户意图组织**。

具体痛点:

1. **入口分裂。** 用户想"练题/看进度/加题/定目标",却要先学会五个阶段名、
   理解管线顺序。skill 的 description 塞满内部术语("定标(M1)…weight/cross_cutting…
   治理 label 权威词表"),用户扫一眼就懵。
2. **会话卫生是用户的负担。** "看过 grader 就换新会话主持"把上下文隔离的实现
   成本推给用户;在"看进度 → 练 → 再看进度"之间来回切会话。
3. **没有"现在该干嘛"的统一入口。** list/assess/next 分散,答不了一个问题。
4. **假精确外泄。** `list` 输出 `priority 0.4541`、`explain` 输出
   `confidence 0.4065 / w=0.532`——违背 SPEC §1.1-4"展示压粗档位,不输出假精确小数"。

## 决策

1. **一个入口 skill(evalme),五个内部流程(phases/)。** 用户说人话,skill 按
   意图路由到 `phases/{define,create,practice,grade,review}.md`;phase 文档按需
   读取,不再各自携带重复的 CLI 协议/数据位置/同步块(收敛进入口文档)。CLI 的
   `status` 命令是入口的第一步:零参数回答"现在该干嘛"。
2. **反锚定的负担从用户移到系统。** 宿主支持交互式子代理时(如 Pi 的
   `contact_supervisor`),练习主持人搬进 fresh 子代理,用户会话只做逐字中继——
   用户上下文脏不脏不再影响能否练习;打分继续由 fresh 子代理盲判(ADR-0008)。
   不支持子代理的宿主保留两档兜底:本会话干净则直接主持;脏则给一句交接语
   ("新会话说:练题,goal=…,task=…")。
3. **展示层压粗档位。** `list`/`status`/`explain` 的用户可见输出只给
   档位(weak/uneven/solid/strong)+ emoji + 自然语言;内部连续值进 `--json`
   或 explain 的证据详情段。

## 影响

- **文件结构**:`skills/evalme/SKILL.md`(路由)+ `skills/evalme/phases/*.md`;
  原五个 skill 目录移除(git mv 保留历史)。插件清单不变(Claude/Codex/Pi 均按
  `skills/` 目录发现)。
- **CLI**:新增 `status`(读取侧、零参数、不写 state,INV-2 不受牵连);
  list/explain 输出档位化。
- **不变量不受影响**:事实不可变、投影可再生、证据链、职责分离全部保持;
  反锚定的两道隔离(预注册 + 上下文边界)原样保留,只是上下文边界由子代理
  结构性承担,不再依赖用户手动换会话。
- **ADRs 关系**:ADR-0007(五 skill 布局)被本文档取代其*展示层*形态,但其
  环节划分(M1–M6)与反锚定语义继续有效;ADR-0008(即时盲判)原样保留并扩展
  到"主持人也可子代理化"。
