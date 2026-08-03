# ADR-0013: 读路径的新鲜度保证——会话前 pull 下沉到 CLI,欠账检查双向化

- 状态:Accepted
- 日期:2026-08-03

## 背景

ADR-0011 把跨设备同步织进 skill 流程:会话前 `git pull --ff-only`、会话后
`sync`,并靠 `assess`/`list` 报告同步欠账使静默欠账可见。第二次真实使用
(harness-interview,一台机器建目标 + push,另一会话 `list`)暴露:执行者
跳过了"会话前 pull"这一步,`list` 直接在陈旧本地上跑,回答"你没有任何目标"
——而目标就在远程,本地只是落后 2 个 commit。

拆开看是三层结构性盲区:

1. **会话前 pull 是软约定,不是硬保证。** ADR-0011 第 2 条写在 SKILL.md 里,是
   给 Agent 看的自然语言提示,不是代码。任何执行者(漏了一步的 Agent、不走
   skill 直接调 CLI 的场景)都能跳过。而 `list`/`assess` 这些读命令**自己不
   pull**,于是拿旧数据当事实,还答得自信。**测量系统给出自信但错误的结论,比
   报错更严重**——直接违背 SPEC §1.1-4 的"测量诚实"。

2. **欠账检查方向是反的。** ADR-0011 第 3 条的欠账警告只看"本地领先远程"(未
   commit / 未 push),不看"本地落后远程"(未 pull)。恰好漏掉本次这个 case。

3. **自动发现只在 home 为空时触发。** ADR-0011 换机流程的自愈逻辑绑定"home
   不存在/为空"。本次场景是 home 存在、是 git 仓库、但落后于远程——不空、也非
   新机,正好掉进发现逻辑的盲区。骨架建好反而挡住了自我修复。

## 决策

把"新鲜度"从 Agent 自觉下沉为 CLI 可执行代码,读路径 fail-loud 而非静默用旧数据:

1. **读命令读前主动 `git fetch` + 双向比对。** `list`/`assess` 在读 data 之前,
   若 home 是 git 仓库且有 remote → `git fetch`(8s 超时,离线/失败则跳过并标注
   "freshness unverified")后比对 ahead/behind:
   - `behind N` 且工作树干净 → 默认 `pull --ff-only` **自愈**,打印"pulled N ✓"。
   - `behind N` 但有未提交改动 → **不自动 pull**(避免 ff 撞未提交事实),显式告警
     "run sync to reconcile"。
   - `--no-pull` → 不自愈,退为顶部告警"⚠ behind N — remote has newer data"。
   - `--no-fetch` → 完全离线:不 fetch 也不 pull(pull 本身要联网),只按本地
     tracking ref 报状态。
   - 与 ADR-0011 的 ahead 欠账合并成一行固定的同步状态输出。

2. **欠账检查双向化。** `gitDebt()` 从"只算 ahead"(`@{u}..HEAD`)扩成一次
   `rev-list --left-right --count @{u}...HEAD` 同时拿 ahead+behind;`syncStatusLine()`
   固定输出一行——`in sync ✓` / `⚠ behind N` / `ahead N` / `⚠ diverged`——让陈旧和
   分叉都永远可见。

3. **`evalme sync --pull-only`。** 只跑 incoming 半程(fetch 由 pull 隐含),不 commit
   不 push,供写侧 skill 会话开始时 freshening 调用,取代散写的 `git pull --ff-only`
   (同 ADR-0011 用 `sync` 收敛 git 命令的思路)。

4. **自动发现覆盖"落后"分支。** 读命令的 freshen 在 home 存在但 behind 时同样自愈
   (先 pull 再扫 goal),而非只在空目录 clone——补上"非空非新机但落后"这个盲区。

## 理由

- 事实层 append-only + `state/` 可再生 → `pull --ff-only` 冲突面天然极小,自愈
  安全;ff 失败(diverged)时显式报错停在安全侧,与 ADR-0011 一脉相承。
- 缺陷根因是"同步职责挂在会话礼仪上"。SPEC §6.9 已把 push 侧从散写 git 收敛进
  `sync`;本 ADR 是对称地把 pull 侧也收敛进读命令,补齐另一半。
- fail-loud 优先于自愈:即便某次不自动 pull,顶部那行同步状态也保证用户不会把
  陈旧结论当新鲜——守住测量诚实的底线。

## 后果

- CLI(已实现于 `plugins/evalme/scripts/evalme.mjs`):`gitDebt()` 双向化;新增
  `syncStatusLine()` 与读路径 `freshen()`;`list`/`assess` 在读数据前调 `freshen`
  (`assess` 先 pull 再 computeModel);`sync` 新增 `--pull-only`。全部只读或幂等,
  **不进入 §5 的任何测量计算**,INV-2/INV-5 不受牵连(与 ADR-0011 同一隔离原则;
  已回归验证:example workspace `rm -rf state && assess` 仍逐字节一致)。
- 两个起草时的待定项裁决:
  - **behind 默认自愈还是只告警** → 默认**自愈**(工作树干净时 `pull --ff-only`),
    `--no-pull` 退为告警。陈旧读是本 ADR 要消灭的病根,自愈优先;ff-only + append-only
    事实使自愈安全,失败即显式报分叉。
  - **每次读 fetch 的性能成本** → v1 每次读都 fetch(8s 超时),不做缓存。个人单仓库
    场景 fetch 很轻,过早加 TTL 缓存是伪精确;真成为体感问题再引入 `--fresh` 显式门控
    或 N 分钟缓存。
- SKILL.md:写侧 skill(drill/grade/forge/define)会话前的裸 `git pull --ff-only`
  改调 `sync --pull-only`(写命令不 freshen,仍需会话前拉);只读的 review skill 依赖
  `assess`/`list` 自动 freshen,不再要求手动 pull。
- 离线场景:fetch 失败或 `--no-fetch` → 静默/标注"freshness unverified",绝不阻塞
  测量命令(同 ADR-0011 无 git/无 remote 静默降级)。
- 遗留:顺序 ID 的多设备并发撞车(ADR-0011 后果第 2 条)不在本 ADR 范围——本 ADR
  降低陈旧读概率,不触碰 ID 生成;时间戳 ID 仍留待多设备成真实习惯时。
