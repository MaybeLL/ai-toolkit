# ADR-0002: 不引入 run 状态机,评测进度由既有文件推导

- 状态:Accepted
- 日期:2026-02-14

## 背景

参考 Anthropic agent 评测框架时,曾考虑引入 "run 管理"模块:一个带生命周期
(已出题/已作答/已打分)的编排状态机,可能物化为 runs.jsonl。

## 决策

不引入。"run" 仅作口语,不是 schema 实体。正式概念只有 task / trial / transcript / grading。
原设想的三个"状态"实为独立的只读查询,并入既有命令:

- 待打分:有 trial 无 grading —— assess / list 顺带提醒("N 条 trial 尚无 grading")。
- 未做的题:task-index 的 suite 视图(每个 requirement 下有几题、做过几题)。
- "忘记入管"的保障是 goal-grill 的流程纪律(主持完强制交接入库),不是状态机。

## 理由

1. agent eval harness 需要状态机是因为并发跑数百任务、失败重试;本系统一次一场、
   人肉推进,状态机没有服务对象。
2. 状态文件是第二事实源,会与 trials.jsonl 漂移;推导永远一致(INV-2 哲学的应用)。
3. "题库里有没做的题"是常态,不是待办,不值得被建模成悬空状态。

## 后果

- 系统中唯一可变状态仍只有 state/ 派生投影,append-only 世界观无破口。
- 若未来出现真正的编排需求(如批量模拟评测),再议。
