---
name: evalme-grade
description: 判定(M4):在全新上下文中对 trial 盲判——逐条 check 独立给 verdict(pass/partial/fail/no-evidence)+ 行号证据。默认作为 evalme-drill spawn 的 fresh-context 子代理紧随 record 执行(ADR-0008);也可独立会话消化待打分存货、或在 grader 修订后重判旧 trial。必须 fresh context:不得继承主持过该面试或看过 state/ 结论的上下文。
---

# EvalMe Grade(判定:盲判,逐 check)

对一条 trial,按该题的 task grader + 适用的 common graders,**逐条 check 独立判定**,产出带行号证据的 grading。

**两种调用形态(ADR-0008):**

1. **子代理(默认)**——evalme-drill 在 record 后 spawn,输入只有 trial_id + workspace。判完 `--write` 落库,向父会话只返回"已落库"与 grading id 清单(多题场次中父会话散场前不该看判定内容)。
2. **独立会话(兜底)**——消化待打分存货(assess/list 会报告)、grader 修订后重判、或 drill 当场无法 spawn 时的欠账。

**盲判纪律(SPEC §7,两种形态都不可妥协):**

- 本会话必须是 fresh context——没主持过这场面试、没看过 `state/` 任何结论、没读过该用户的历史评价。
- 逐条 check 独立判定:判完一条再看下一条,不让"整体印象"污染逐条结论。
- 只依据 transcript 文本。transcript 里没聊到的,如实判 `no-evidence`,**不硬判 fail**。

## CLI 协议

`<scripts>` = 本 SKILL.md 上两级的 `scripts/` 目录。

**数据位置(ADR-0010)**:数据住在 goal home——唯一的位置开关是 `EVALME_HOME` 环境变量(不设则默认 `~/evalme/`),无配置文件。与当前所在项目仓库无关,任何目录直接使用,不需要任何路径参数。CLI 自动选中唯一目标;多目标时加 `--goal <id>`。

**同步(ADR-0011)**:会话开始动数据前,若 goal home 是 git 仓库且有 remote → 先 `git pull --ff-only`(失败则告知用户先解决,别在旧数据上继续写)。会话结束且有改动 → `node <scripts>/evalme.mjs sync --message "evalme-grade: <摘要>"`(commit+pull+push 一步;失败不阻塞——本地已落盘即安全,CLI 会在 assess/list 里持续报欠账)。home 不是 git 仓库或无 remote 时 sync 自动降级/跳过,不打扰单机用户。

```
node <scripts>/evalme.mjs grade <trial_id>            # 打印 transcript + graders
node <scripts>/evalme.mjs grade <trial_id> --write    # stdin 传 gradings JSON
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
4. **存货兜底**:`assess`/`list` 会报告待打分存货(有 trial 无 grading);独立会话逐个消化。transcript 和 grader 都不会变质,欠账何时补都行。
5. 重判:task/grader 出新版后可对旧 trial 重判(grade 自动按题系最新版出题),聚合取最新版本判定,旧判定保留(append-only)。

## 红线

- 不跑 assess、不看 health.json、不谈"该练什么"——那是 evalme-review(读取侧)。
- 你只判 check,不产出任何分数/健康度——数字全部由引擎算(INV-5)。
