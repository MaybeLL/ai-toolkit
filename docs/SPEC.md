# EvalMe — v2 Spec(task 中心模型)

> 状态:Draft(待评审)
> 版本:spec-v0.2
> 前版:spec-v0.1(能力轴模型,已被 ADR-0001 整体取代)
> 术语表:[/CONTEXT.md](../CONTEXT.md);决策记录:[docs/adr/](./adr/)

---

## 1. 定位

**一个对人的能力评测系统:让用户对"我到底什么水平"的判断有据可查。**

它借用 agent 评测的组织方式(task + 预注册 grader + trial + transcript)来评测人:
每道题自带评分标准,每次表现留下逐字稿,每个结论能回溯到逐字稿的具体行。

> 核心问题:我距离目标还有多远?——答案必须可信、可查、可复算。
> "下一步练什么"(next)是这套测量基础设施之上的便利视图,不是系统灵魂。

### 1.1 核心原则

1. **任务驱动** — 评价标准跟随任务(task 自带 grader),不是一把通用尺子量一切。
2. **证据更新** — 结论不能主观填写,必须由 grading(按 grader 逐条判定的表现证据)驱动。
3. **预注册** — 评分标准在表现发生之前写定,想偏袒都没有素材(`imported-live` 除外,如实标注)。
4. **测量诚实** — 不输出假精确:无数值分数线、无 ΔCapability 预估、展示压粗档位、不确定就标 stale。
5. **本地优先** — 纯文本文件 + Git 即全部事实源;任何 Agent 都可接入;用户拥有完整数据主权。

### 1.2 三层分离(继承 v0.1)

- **历史表现是事实**(Trial + Transcript)
- **能力结论是对事实的推断**(Grading → Assess 投影)
- **下一步计划是基于推断的决策**(Gap → Plan)

### 1.3 v1 场景

只做一个极窄场景:**后端工程师系统设计面试**。不做通用考试、不做通用求职、不做能力本体。

---

## 2. 系统不变量(架构验收标准)

违反任何一条即为架构级 bug:

- **INV-1(事实不可变)** `transcripts/`、`data/trials.jsonl`、`data/gradings.jsonl` 只允许追加,永不覆盖、删除、改写。纠错唯一路径是追加 `retraction`(§4.6),而非修改历史。
- **INV-2(投影可再生)** `state/` 中的确定性投影(`health.json`、`task-index.json`)整体可再生:`rm -rf state/ && evalme assess` 从 trials + gradings 完整重建,逐字节一致(recency 用数据自身时钟)。`state/plan.json` 是决策产物,由 `next` 重建,不在逐字节保证内。
- **INV-3(证据链完整)** 每条 grading 引用一个 trial_id 与 grader_ref;每条 trial 引用 transcript 路径并记录内容哈希。grading 的 `transcript_ref` 在写入时校验为指向该 trial transcript 内真实存在、非空的行段。读取时重算哈希,不匹配即报错。任何结论都能沿链回溯到逐字稿具体行。
- **INV-4(标准与事实皆带版本)** task 与 common grader 一经有 grading 引用即不可变,修订开新版本文件;每条 grading 记录 grader_ref(含版本)+ 判定模型 + prompt 版本;每份投影记录 estimator 版本。数值变化必须能区分"用户变了"还是"标准变了"。schema 只加字段、只加版本,旧数据就地保留,永不迁移。
- **INV-5(职责分离)** LLM 负责出题、主持、按 check 判定、解释措辞;确定性引擎负责折算、加权、聚合、置信度、选题排序。LLM 永远不直接产出健康度结论。
- **INV-6(无外部依赖)** 全部状态存于纯文本(JSONL / YAML / JSON / Markdown)。无数据库、无账号、无云同步。Git 即同步机制。SQLite 永不做事实源(至多做可重建的派生索引)。

---

## 3. Workspace 布局

每个目标一个独立目录,集中存于 **goal home**(ADR-0010)。唯一的位置开关是 `EVALME_HOME` 环境变量(不设则默认 `~/evalme/`),无配置文件。CLI 从任意 cwd 自动解析:单目标自动选中,多目标用 `--goal <id>`。数据位置与使用位置解耦:用户在任何项目仓库里都能直接使用,数据永不落入当前项目。跨设备同步 = goal home 配 git 私有远端(ADR-0011):evalme-define 建目标时引导闭环,各 skill 会话自动会话前 pull、会话后 push;读命令(assess/list)读前双向 freshen 自愈陈旧(ADR-0013);无 git 时静默跳过,单机使用零打扰。

```
<workspace>/
  goal.yaml                     # M1 定标:topics(weight)= 优先级 + label 权威词表
  tasks/                        # M2 量具:一题一文件,版本化(题系名-v<N>)
    coupon-idempotency-v1.yaml
  graders/                      # M2 量具:common grader(横切行为),独立版本化
    communication-v1.yaml
  transcripts/                  # M3 事实:逐字稿,只增不改,SHA-256 公证
    2026-03-01-coupon.md
  data/
    trials.jsonl                # M3 事实:每行一次尝试,append-only
    gradings.jsonl              # M4 判定:每行一条 check 判定,append-only
  state/                        # M5 派生:随时可重建;gitignore 可选
    health.json                 #   ↳ 每 topic 的外延式健康度(assess,逐字节一致)
    task-index.json             #   ↳ suite 视图/覆盖/待打分存货(assess,逐字节一致)
    plan.json                   #   ↳ next 选题结果(决策产物,非逐字节)
  reports/                      # M6:explain 的人类可读输出
```

存储位置是约定不是行为:独立成长仓库(推荐)或寄居宿主项目 dotdir,同 v0.1 §3。

---

## 4. 数据契约

### 4.1 goal.yaml — 定标(M1)

```yaml
goal_id: backend-system-design
title: 后端系统设计面试
created_at: 2026-07-01
target_date: 2026-10-01            # 可选

# topics 清单 = 优先级声明 + label 权威词表(ADR-0005)
topics:
  - id: idempotency
    weight: 0.9                    # 相对重要度(排序用,不装测量;建议 0.1 步长)
  - id: caching
    weight: 0.7
  - id: rate-limiting
    weight: 0.5
  - id: communication
    weight: 0.6
    cross_cutting: true            # 只由 common grader 产生证据,不做题目内容
```

规则:

- **没有数值分数线**(`required` 已随 requirement 消亡,ADR-0005)。达标判据是外延式的(§5.4)。
- topics 清单是 label 的**权威词表**:task 与 common grader 的 label 必须出自此清单;要用新词,先加进清单(git commit)。防开放词汇同义漂移(`idempotency` vs `幂等`)。
- 人工定义、git 版本化;Agent 辅助起草、用户批准。

### 4.2 tasks/*.yaml — 题(M2)

一题一文件,文件名 = `题系名-v<版本>`。**一经有 grading 引用即不可变**,修订开新版(INV-4)。

```yaml
task: coupon-idempotency          # 题系名(novelty 按题系统计,§4.5)
version: 1
origin: generated                 # generated | imported | imported-live(ADR-0003)
labels: [idempotency, concurrency]   # 必须出自 goal.yaml topics 词表
difficulty: 0.6                   # 题目固有属性,一次标定,跨 trial 一致
variant_of: payment-idempotency   # 可选:声明本题是某题系的变式(novelty 派生用)
prompt: |
  设计优惠券领取接口,要求防重复领取。用户可能连点、可能网络重试……
grader:
  checks:
    - id: c1
      text: 无提示主动识别重复提交风险
      must_pass: true             # 可选:本条 fail 则整题不过(ADR-0006)
    - id: c2
      text: 方案覆盖并发窗口(而非仅唯一索引一句带过)
    - id: c3
      text: 区分 request_id 与业务幂等键
reference_solution: |             # 出题质检:一份应当能通过全部 checks 的参考答案
  ……
```

规则:

- **origin 三值语义**(ADR-0003):`generated` = LLM 按缺口出题,grader 预注册;`imported` = 用户上传题面,作答前补 grader(用户确认),仍预注册;`imported-live` = 从已发生的表现(真实面试)反推,grader 事后写,**非**预注册——estimator 的 reliability 因子区分对待(§5.1)。
- **预注册时序**:generated/imported 的 grader 必须在用户作答之前定稿。这是反锚定的第一道墙(§7)。
- **入库审批**:generated/imported 的 task 草案(题面、labels、difficulty、grader 与参考答案)必须先展示给用户，并在得到对该具体草案的明确确认后才能 `task add` 入库；“帮我出题”不是入库确认。
- **reference_solution 质检**:入库前,判定 Agent(fresh context)对参考答案跑一遍 grader,应全 pass——证明题可解、grader 没配错(0% 通过多半是题坏了,不是人差)。质检结果不入库,是 evalme-create 的门禁步骤。
- CLI 校验(`evalme task add`):labels 在词表内、checks 非空、必需字段齐全、题系版本号连续。语义质量由 Agent + 用户负责(INV-5)。

### 4.3 graders/*.yaml — common grader(M2)

承载横切行为(跨题一致的评价标准),与 task grader 并行打分(ADR-0005)。

```yaml
grader: communication
version: 1
label: communication              # 其判定聚合到该 topic
applies_to: [mock_interview, real_interview]   # v1 全适用,字段先留
checks:
  - id: m1
    text: 先给结构(要点框架)再展开细节
  - id: m2
    text: 主动澄清模糊需求而非直接假设
  - id: m3
    text: tradeoff 明示(说出放弃了什么),而非暗含
```

一经引用即不可变,修订开新版。**它是 v0.1 通用 rubric 的归宿**:不是兜底打分路径(一切 grading 必锚 task,ADR-0003),而是与 task grader 并行的横切打分层。

### 4.4 trials.jsonl — 尝试(M3,第一层:事实)

**粒度:trial = 对一个 task 的一次尝试。** 一场 60 分钟 5 道题的模拟面试 = 5 条 trial,共享 `session_id`。transcript 可整场一份,不同 trial 的 grading 引用不同行段。

```json
{
  "schema": "trial-v1",
  "trial_id": "trl_000042",
  "task_ref": "coupon-idempotency-v1",
  "type": "mock_interview",
  "occurred_at": "2026-07-28T20:30:00+08:00",
  "session_id": "ses_2026-07-28-mock",
  "novelty": "unseen",
  "duration_minutes": 45,
  "conditions": {
    "time_limit": true,
    "hints": false,
    "external_materials": false,
    "evaluator": "agent"
  },
  "transcript": ["transcripts/2026-07-28-coupon.md"],
  "transcript_sha256": ["<sha256>"]
}
```

- `type` 枚举(v1):`mock_interview` | `practice` | `real_interview` | `retraction`。
- `task_ref` 必须指向已存在的 task 文件。**trial 不含任何评价**(评价在 grading 层)。
- `novelty` 由 record 派生,不接受自报(§4.5)。
- `difficulty` 不在 trial 上——它是 task 的固有属性(v0.1 "记录时声明"的修复)。
- 同一 task 的 trial 序列 = 该题上的成长曲线切片(explain 消费,§6.6)。

### 4.5 novelty 派生规则

以**题系**(task 名,不含版本)为键,从既往 trial(不含 retraction、不含被撤销者)确定性推导:

```
该题系既往 trial 数:0 → unseen;1 → familiar;≥2 → repeat
若 task 声明 variant_of,且被指题系已有 trial → variant
```

同题系换版本(v1 做过、v2 再做)按 familiar/repeat 计——题系是同一个,只是尺子换了。

### 4.6 retraction — 事实层纠错

```json
{ "schema": "trial-v1", "trial_id": "trl_000043", "type": "retraction",
  "occurred_at": "...", "refers_to": "trl_000042", "reason": "conditions 记错:实际有提示" }
```

被撤销 trial 及其**全部 gradings** 不参与聚合;纠错流程 = retract + 重新 record。不支持字段级 patch、不支持撤销的撤销。

### 4.7 gradings.jsonl — 判定(M4,第二层:推断的中间产物)

**粒度:一行 = 一条 check 的判定**(v0.1 一行一个能力综合判定的细化)。

```json
{
  "schema": "grading-v1",
  "grading_id": "grd_000107",
  "trial_id": "trl_000042",
  "grader_ref": "coupon-idempotency-v1#c2",
  "verdict": "fail",
  "evidence": "方案仅用唯一索引,未讨论查询-插入间隙的并发写入",
  "transcript_ref": "transcripts/2026-07-28-coupon.md#L120-L145",
  "grader_model": "claude-sonnet-4-5",
  "prompt_version": "grade-v0.1",
  "graded_at": "2026-07-28T21:00:00+08:00"
}
```

- `grader_ref` = `task引用#check_id` 或 `common grader引用#check_id`(如 `communication-v1#m1`)——单一管道,判定行标明依据出处(ADR-0005)。
- `verdict` ∈ `pass | partial | fail | no-evidence`。**no-evidence 是给 judge 的退路**:transcript 未涉及该 check 时如实说没有,不硬判(ADR-0006)。此时 `transcript_ref` 可空,其余情况必填且行段校验(INV-3)。
- append-only:task/grader 出新版后可对旧 trial 重判(追加),聚合时同一 `(trial_id, 题系#check)` 只取最新版本的判定。
- **判定纪律**(§7):fresh context;每条 check 独立上下文(不让整体印象污染逐条判定);判定者看不到任何历史结论。**默认紧随 record**(practice 会话 spawn fresh-context 子代理即时判,反馈按 session 粒度,ADR-0008);也可延后攒批——trial 一落地事实即安全,grading 何时补都行。

### 4.8 state/health.json — topic 健康度(第三层:完全派生)

```json
{
  "estimator_version": "extensional-v0.1",
  "generated_at": "...",
  "source_trial_until": "trl_000042",
  "topics": {
    "idempotency": {
      "band": "uneven",
      "coverage": { "tasks_in_suite": 6, "attempted": 4 },
      "by_novelty": {
        "unseen":  { "trials": 3, "passed": 1 },
        "variant": { "trials": 1, "passed": 1 },
        "repeat":  { "trials": 2, "passed": 2 }
      },
      "confidence": 0.54,
      "stale": false,
      "last_verified": "2026-07-28",
      "must_pass_failures": ["coupon-idempotency-v1#c1 @ trl_000042"]
    }
  }
}
```

- `band` 是展示档位(`weak | uneven | solid | strong`),由引擎内部连续值映射;**对外不展示两位小数**(测量诚实,§1.1-4)。
- `stale`:曾达标但 confidence 因 recency 跌破阈值 → 标注提醒,不自动排复测(ADR-0004)。

### 4.9 state/task-index.json — suite 视图(派生)

按 label 分组的题库索引:每 topic 有几题(在库/做过/未做)、no-evidence 计数(题未引出考点的信号)、**待打分存货**(有 trial 无 grading 的清单)、**覆盖盲区**(有 weight 但一题都没有的 topic)。纯派生,assess 顺手重建。运行进度没有状态机——一切进度由既有文件推导(ADR-0002)。

### 4.10 state/plan.json — 选题结果(决策产物)

```json
{
  "generated_at": "...",
  "against": "health.json",
  "actions": [
    { "rank": 1,
      "task_ref": "flash-sale-idempotency-v1",
      "topic": "idempotency",
      "reason": "weight 最高的 topic;unseen 通过 1/3;本题未做过且为 unseen",
      "create_needed": false }
  ]
}
```

`next` 是**选题器**:从题库选"weight 高 × 健康差 × 未做过(优先 unseen/variant)"的题;题库无合适题时输出 `create_needed: true`,由 evalme-create 补题。至多 3 条;只排序 + 文字理由,**不输出 ΔCapability 预估**。

---

## 5. 确定性估计引擎(estimator: extensional-v0.1)

全部计算无 LLM 参与(INV-5)。

### 5.1 check 折算与题级通过(ADR-0006)

对一条 trial 的全部有效判定(剔除 no-evidence、剔除被撤销者;同 check 取最新版本):

```
verdict 折算:pass=1.0,partial=0.5,fail=0.0(无 ±微调,类别值)
题级得分 r = 有效 check 折算均值(task grader 与适用的 common grader 分开算:
             task checks → 题所属各 label;common checks → 该 grader 的 label)
题级通过  = r ≥ 0.7(阈值,派生层参数,可调、待校准)
             且无 must_pass check 判 fail(一票否决)
```

### 5.2 单条证据权重

```
w = difficulty × independence × novelty × reliability × recency
```

| 因子 | 来源 | 映射 |
|---|---|---|
| difficulty | task.difficulty(题目属性) | 直接取值,下限 0.2 |
| independence | trial.conditions | 无提示不查资料=1.0;有提示=0.5;跟随材料=0.2 |
| novelty | trial.novelty(派生,§4.5) | unseen=1.0,variant=0.8,familiar=0.5,repeat=0.25 |
| reliability | trial.type × task.origin | real_interview=1.0;mock_interview=0.9;practice=0.7;origin=imported-live 的事后 grader 额外 ×0.8(非预注册,如实降权) |
| recency | occurred_at | exp(−Δdays/90),下限 0.3 |

### 5.3 label 聚合与置信度

对每个 topic(label),证据单元 = 每条 trial 在该 label 上的题级得分 r:

```
内部连续分 = Σ(wᵢ × rᵢ) / Σ(wᵢ)        → 仅映射为展示档位 band,不外显数值

confidence = saturation(Σwᵢ) × diversity
saturation(W) = 1 − exp(−W / 1.5)
diversity     = 0.5 + 0.5 × min(unique_contexts, 4) / 4
unique_contexts = min(unique_题系, unique_sessions)
```

乘积结构刻意保留(继承 v0.1 §5.3):同一场刷 5 题不构成 5 个独立场景,单场景封顶 0.625——多场景验证不足就不给高置信度。

### 5.4 外延式健康度与优先级(ADR-0005)

topic 达标不再是"分数 ≥ 分数线",而是可观察的题级事实组合:

```
健康 = coverage 足(suite 内已尝试题数 ≥ 下限)
     ∧ unseen/variant 题近期通过情况良好(recency 加权通过率 ≥ 阈值)
     ∧ 无未解决的 must_pass 失败
     ∧ 非 stale(confidence 未因 recency 跌破阈值)

priority = weight × 缺口程度 × (0.5 + 0.5 × confidence)
mode     = "diagnose"(confidence < 0.4,先做题探明)| "train"(其余)
stale    = 曾健康、现仅因 recency 失格 → 只标注,不排复测(ADR-0004)
```

各阈值为派生层参数(不入事实),v1 拍初值、标"待校准",随真实数据调。

---

## 6. 命令契约

写入侧(只追加事实):`task add → record → grade`;纠错:`retract`。
读取侧(读派生视图):`assess → explain → next`;组卷:`exam`;跨目标:`list`。

**assess 与摄取解耦**(继承 v0.1):record/grade 一提交事实即安全;assess 是全量读模型刷新,读取前懒触发或一批摄取后统一跑;失败绝不影响已落地事实。

### 6.1 `evalme init --goal-id <id>`

建骨架:在 `<goal home>/<goal-id>` 建 workspace:`tasks/ graders/ transcripts/ data/` + `goal.yaml` 模板(含中立占位 topic)。已存在 `goal.yaml` 拒绝覆盖。Agent 随后陪用户起草真实 topics(用户确认生效)。

### 6.2 `evalme task add [--stdin]`

入库一道题(M2 出口)。校验:labels 在词表内、checks 非空、题系版本连续、schema 合法 → 写入 `tasks/`。reference_solution 质检(判定 Agent 跑 grader 应全 pass)是 evalme-create 的前置门禁,CLI 不执行 LLM 步骤。`evalme task show <ref> [--prompt-only]`:取题;**`--prompt-only` 是 practice 主持的强制形态——主持人不许看 checks**(§7)。

### 6.3 `evalme record`

登记一次尝试。输入:task_ref、type、conditions、可选 session、transcript 路径。行为:校验 task 存在、transcript 存在 → 算哈希 → 派生 novelty → 追加 trial → 返回 trial_id。禁止:novelty 自报;修改已有 trial。

### 6.4 `evalme grade <trial_id>`

打分(M4)。前置:校验 transcript 哈希、trial 未撤销。CLI 输出 transcript + 该 task 的 grader + 适用的 common graders;**判定 Agent(fresh context)逐条 check 独立判定**,草稿经 CLI 校验(grader_ref 存在、verdict 合法、transcript_ref 行段真实非空)后追加 gradings。默认由 practice spawn 的子代理紧随 record 执行(ADR-0008);也可延后攒批,`assess`/`list` 报告待打分存货。

### 6.5 `evalme assess`

读模型刷新:读全部 trials + gradings → 排除被撤销 → §5 计算 → 覆写 `state/health.json`、`state/task-index.json`。纯确定性、幂等(INV-2)。**读前 freshen(ADR-0013)**:home 是 git 仓库且有 remote 时,先 `git fetch` + 双向比对,`behind` 且工作树干净则 `pull --ff-only` 自愈后再计算——避免在陈旧本地上算出自信但过时的结论。`--no-pull` 退为告警,`--no-fetch` 完全离线。freshen 只动工作树(ff-only),不进入 §5 计算,INV-2 不受牵连。

### 6.6 `evalme explain <topic>`

证据链(M6 核心)。输出:band + confidence + stale;novelty 分层通过情况("unseen 1/3 过,repeat 3/3 过"——dimension 轴的继承人,ADR-0005);按权重排序的正负证据(每条含日期、check 文本、verdict、evidence、transcript_ref);同题系 trial 序列的成长曲线;置信度为何不更高(场景数、证据分布);must_pass 失败与撤销附注。确定性生成,LLM 只可选润色。

### 6.7 `evalme next [--write]`

选题器。`next`(打印):确定性输出 priority 短名单 + 每 topic 候选题(suite 内未做、优先 unseen/variant;无题则 `create_needed`)。`next --write`:Agent 包装成至多 3 条 action(CLI 校验 task_ref 存在、topic 在词表、reason 非空)写入 plan.json。

### 6.8 `evalme exam [--size N]`

组卷器(ADR-0009):确定性组一场整卷模拟面试。按 topic weight 降序轮转取题,每 topic 优先未尝试题系(would-be unseen/variant),跨 topic 去重;输出卷面(task_ref/topic/would_be_novelty)、建议 session_id、无题可选的 topic(create_needed)。纯读、无 LLM、不写文件;与 next 的分工:next 答"单点练什么"(补最弱),exam 答"整场考什么"(加权覆盖)。消费方为 evalme-practice 的整场模拟流程。

### 6.9 `evalme sync [--message <m>] [--pull-only]`

同步封装(ADR-0011):对 goal home 所在 git 仓库依次 commit(有未提交改动时)→ pull --ff-only → push。非 git 仓库 → 提示如何启用;无 remote → 仅本地 commit;pull 分叉/push 失败 → 明确报错但本地数据安全。`--pull-only`(ADR-0013):只跑 incoming 半程(pull --ff-only),不 commit 不 push,供写侧 skill 会话开始时 freshening 调用。配套:`assess`/`list` **读前双向 freshen**(ADR-0013:fetch + 比对 ahead/behind,behind 自愈或告警,固定打印一行同步状态),把 ADR-0011"只报 ahead 欠账"扩成双向,陈旧读不再静默。与测量计算完全无关(INV-2/INV-5 不受牵连)。

### 6.10 `evalme retract <trial_id> --reason <text>` / `evalme list --root <dir>`

同 v0.1 语义:retract 追加撤销;list 跨目标只读总览(按 top priority 排序,不触发 assess),另报告各目标待打分存货与覆盖盲区。

---

## 7. Agent 接入:五个 Skill 与反锚定(ADR-0007)

系统 = 确定性 CLI + 五个 Skill(对应考试制度五环节;M5 assess 无 skill,纯 CLI):

| Skill | 活动 | 模块 |
|---|---|---|
| **evalme-define** | 定标:topics(weight)起草与修订、词表治理;跨目标 list | M1 |
| **evalme-create** | 创建题目:按缺口出题 / 用户素材导入 / 任意材料抽题(工作收获→task) / imported-live 归一化 / grader(含 common)修订 / 参考答案质检 | M2 |
| **evalme-practice** | 练习:取题(`--prompt-only`)→ 主持面试 → 产 transcript → **顺手 record** → spawn 盲判子代理,按 session 粒度反馈(ADR-0008) | M3 |
| **evalme-grade** | 判定:fresh context 盲判,逐 check 独立;默认作为 practice 的子代理即时执行,独立会话消存货/重判为兜底;含 retract 支线 | M4 |
| **evalme-review** | 复盘:assess → explain → next;stale 与存货提醒 | M6 |

**反锚定靠两道结构性隔离,不靠口头约定:**

1. **预注册(时序隔离)**:grader 在作答前写定(generated/imported)。出题者想 teaching-to-test 也改不了已冻结的标准;`imported-live` 无此保护,以 origin 降权如实标注。
2. **上下文边界(空间隔离)**:practice 主持人只见 `--prompt-only`(见了 checks 会无意识朝检查点引导);grade 判定者必须 fresh context(不继承主持过面试或看过 state/ 的上下文),且逐 check 独立判定。**隔离是上下文的,不是时间的**(ADR-0008):practice 会话 record 后即可 spawn fresh-context 子代理当场盲判(只传 trial_id),单题当场反馈、多题场次散场后统一反馈。真实面试在 skill 外发生,经 evalme-create 归一化 + evalme-grade 入管。

真人面试流:用户拿到 transcript → evalme-create 归一化(反推题面、按词表起草 grader、用户确认)→ record(type=real_interview)→ grade。全程单一管道(ADR-0003)。

---

## 8. v1 范围裁决

### 做

- 单场景:后端系统设计面试
- task 中心闭环:定标 → 制题(三 origin)→ 施测 → 逐 check 盲判 → 外延式健康度 → 证据链 → 选题
- 双 grader(task + common)、novelty 分层视图、stale 标注、展示档位
- 五 Skill + goal home 自动解析的 CLI(任意 cwd 可用,ADR-0010)

### 不做(明确推迟/拒绝)

| 项 | 裁决 | 依据 |
|---|---|---|
| run 状态机 | 拒绝 | ADR-0002:进度由文件推导,无服务对象 |
| 数值分数线(required) | 拒绝 | ADR-0005:凭空绝对数值,外延式取代 |
| dimension 轴(recall/application/transfer) | 拒绝 | ADR-0005:novelty 分层视图接任 |
| regression 复测池 | 推迟 | ADR-0004:参数无数据,先 stale 标注 |
| ΔCapability 预估 | 拒绝 | 假精确(继承 v0.1) |
| SQLite 事实源 | 拒绝 | INV-6;至多派生索引 |
| 外显两位小数 | 拒绝 | 展示档位,精度声明与效度对齐 |
| 阈值自动校准、题库跨 goal 共享、UI | 推迟 | 先积累真实数据;文件即接口 |

---

## 9. v1 要验证的四个假设

1. **判分稳定性**:同一 transcript 重复盲判,check 级 verdict 一致率 > 80%?(含换文风重判——防构念无关方差)
2. **判断可认可性**:用户能否通过 `explain` 的证据链理解并认可结论?(测量系统的命门)
3. **创建题目可用性**:evalme-create 产出的题 + grader,经参考答案质检后,一次可用率够高吗?imported-live 归一化的 grader 用户改动大吗?
4. **端到端摩擦**:create → practice → grade → review 一整轮,用户第三周还在喂数据吗?(个人系统头号死因是弃用)

验证优先级高于:精确评分模型、通用本体、统一分。
