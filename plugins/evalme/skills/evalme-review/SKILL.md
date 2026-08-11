---
name: evalme-review
description: 复盘(M6,读取侧):assess 刷新投影 → explain 证据链(band/novelty 分层/成长曲线/stale)→ next 选题。当用户想看自己现在什么水平、为什么是这个结论、接下来该练哪道题时使用。只读事实,不摄取、不打分、不出题(缺题时输出 create_needed 交给 evalme-create)。
---

# EvalMe Review(复盘:assess → explain → next)

读取侧三步:先刷新投影(assess,幂等、便宜),再看证据链(explain),最后选题(next)。

## CLI 协议

`<scripts>` = 本 SKILL.md 上两级的 `scripts/` 目录。

**数据位置(ADR-0010)**:数据住在 goal home——唯一的位置开关是 `EVALME_HOME` 环境变量(不设则默认 `~/evalme/`),无配置文件。与当前所在项目仓库无关,任何目录直接使用,不需要任何路径参数。CLI 自动选中唯一目标;多目标时加 `--goal <id>`。

**同步(ADR-0011 / ADR-0013)**:本 skill 只读,跑的 `assess`/`list` 已由 CLI **读前双向 freshen**(自动 `git fetch` + 比对,`behind` 且工作树干净则 `pull --ff-only` 自愈,并固定打印一行同步状态)——无需手动 pull。离线/分叉时 CLI 会标注"freshness unverified"或"⚠ diverged",转告用户结论可能滞后。本 skill 不主动 commit;若输出「sync debt」(未推送/未提交)警告,转告用户并跑 `node <scripts>/evalme.mjs sync` 清欠账。

```
node <scripts>/evalme.mjs assess  [--as-of <ISO>]
node <scripts>/evalme.mjs explain <topic>
node <scripts>/evalme.mjs next    [--top N]          # 打印候选
node <scripts>/evalme.mjs next    --write            # stdin 传 actions
```

## 流程

1. **assess 先行**(读前必刷):注意输出的两类警告——待打分存货(转告用户去 evalme-grade)、无题可测的 topic(create needed)。
2. **explain**:向用户转述时忠于引擎输出——
   - 用 **band 档位**(weak/uneven/solid/strong)描述水平,**不要引用内部小数**当作能力值;
   - **novelty 分层**是重点("unseen 1/3 过,repeat 3/3 过"——陌生场景才见真章);
   - stale 标注要点破("上次验证是 4 个月前,现在不确定了"),但**只提醒,不自动排复测**(ADR-0004);
   - 每个结论给出 transcript 行号出处,用户质疑时带他看原文。
3. **next**:打印模式给出按 priority 排序的 topic + 候选题(优先 unseen/variant)。你把它包装成至多 3 条 action(`{topic, task_ref, reason}` 或 `{topic, create_needed: true, reason}`)从 stdin `--write`。
   - `mode: diagnose`(confidence < 0.4)= 证据不足,先做题探明,别急着"训练";
   - `create_needed` = 题库没合适的题,建议用户开 evalme-create 会话补题;
   - 只排序 + 文字理由,**不编造"预计提升 +0.x"**。

## 红线

- 本 skill 不摄取(record/grade)、不制题、不改 goal.yaml。
- 数字全部来自引擎;你只解释和措辞,不修正、不脑补。
- 不向后续的 practice/grade 会话泄露本会话看到的结论(反锚定:主持人和判定者都必须是未被污染的上下文)。
