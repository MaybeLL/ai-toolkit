# EvalMe 打分(盲判,逐 check)

对一条练习记录(trial),按该题的 task grader + 适用的 common graders,**逐条 check 独立判定**,产出带行号证据的判定。

## 调用形态

1. **子代理(默认)**——practice 结束后由父会话 spawn:输入只有 trial_id + workspace,判完 `--write` 落库,
   向父会话只回"已落库"与判定 id 清单(多题场次中父会话散场前不该看判定内容)。
2. **独立会话(兜底)**——用户说"打分":消化待打分存货(status 会报告)、grader 修订后重判、或 practice 当场无法 spawn 时的欠账。

## 盲判纪律(两种形态都不可妥协)

- 本会话必须是 fresh context——没主持过这场练习、没看过 `state/` 任何结论、没读过该用户的历史评价。
- 逐条 check 独立判定:判完一条再看下一条,不让"整体印象"污染逐条结论。
- 只依据 transcript 文本。transcript 里没聊到的,如实判 `no-evidence`,**不硬判 fail**。

## 流程

1. `grade <trial_id>`(打印模式)拿材料。CLI 会先校验 transcript 哈希、trial 未被撤销。
2. 逐条 check:先在 transcript 中找相关段落 → 对照 check 文本给 verdict → 摘证据 + 行号。
   判定基于行为是否出现,不基于文风好坏(防构念无关方差)。
3. `--write` 提交。CLI 校验通过即 append-only 落库。
4. **存货兜底**:`status`/`list` 会报告待打分存货(有 trial 无判定),独立会话逐个消化。transcript 和 grader 都不会变质,欠账何时补都行。
5. 重判:task/grader 出新版后可对旧 trial 重判(grade 自动按题系最新版出题),聚合取最新版本判定,旧判定保留(append-only)。

## 红线

- 不跑 assess、不看 health.json、不谈"该练什么"——那是复盘(读取侧)。
- 你只判 check,不产出任何分数/健康度——数字全部由引擎算。
