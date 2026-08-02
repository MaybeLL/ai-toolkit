---
name: goal-grade
description: 判定(M4):在全新上下文中对 trial 盲判——逐条 check 独立给 verdict(pass/partial/fail/no-evidence)+ 行号证据。当用户想给已入库的 trial 打分、批量消化待打分存货、或在 grader 修订后重判旧 trial 时使用。必须 fresh context:不得继承主持过该面试或看过 state/ 结论的上下文。
---

# Goal Grade(判定:盲判,逐 check,可攒批)

对一条 trial,按该题的 task grader + 适用的 common graders,**逐条 check 独立判定**,产出带行号证据的 grading。

**盲判纪律(SPEC §7,不可妥协):**

- 本会话必须是 fresh context——没主持过这场面试、没看过 `state/` 任何结论、没读过该用户的历史评价。
- 逐条 check 独立判定:判完一条再看下一条,不让"整体印象"污染逐条结论。
- 只依据 transcript 文本。transcript 里没聊到的,如实判 `no-evidence`,**不硬判 fail**。

## CLI 协议

`<scripts>` = 本 SKILL.md 上两级的 `scripts/` 目录;所有命令 `--workspace <ws>`。

```
node <scripts>/goal.mjs grade <trial_id> --workspace <ws>            # 打印 transcript + graders
node <scripts>/goal.mjs grade <trial_id> --workspace <ws> --write    # stdin 传 gradings JSON
```

打印模式给你:trial 元数据、task 的 prompt+checks、适用的 common graders、transcript 全文。你产出 JSON 数组,每条:

```json
{ "grader_ref": "coupon-idempotency-v1#c2",
  "verdict": "partial",
  "evidence": "一句话摘录/概括",
  "transcript_ref": "transcripts/2026-07-28-coupon.md#L10-L11",
  "grader_model": "<你的模型名>" }
```

- `verdict` ∈ pass | partial | fail | no-evidence。no-evidence 时省略 evidence/transcript_ref。
- `transcript_ref` 必须指向真实、非空的行段(CLI 校验,INV-3)。
- task grader 与 common grader 的每条 check 都要有判定(包括 no-evidence)。

## 流程

1. `grade <trial_id>`(打印模式)拿材料。CLI 会先校验 transcript 哈希、trial 未被撤销。
2. 逐条 check:先在 transcript 中找相关段落 → 对照 check 文本给 verdict → 摘证据 + 行号。判定基于行为是否出现,不基于文风好坏(防构念无关方差)。
3. `--write` 提交。CLI 校验通过即 append-only 落库。
4. **攒批**:`assess`/`list` 会报告待打分存货(有 trial 无 grading);逐个消化即可。trial 落地后何时打分都行——transcript 和 grader 都不会变质,批量判反而更一致。
5. 重判:task/grader 出新版后可对旧 trial 重判(grade 自动按题系最新版出题),聚合取最新版本判定,旧判定保留(append-only)。

## 红线

- 不跑 assess、不看 health.json、不谈"该练什么"——那是 goal-review(读取侧)。
- 你只判 check,不产出任何分数/健康度——数字全部由引擎算(INV-5)。
