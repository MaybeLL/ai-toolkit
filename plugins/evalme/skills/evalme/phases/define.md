# EvalMe 定标(目标 + topics 词表)

目标的全生命周期:建 workspace、起草/修订 topics 清单、跨目标总览、归档删除。

**topics 清单是两样东西合一:**

1. **优先级声明** — 每个 topic 的 weight(相对重要度,0.1 步长足够;没有"critical 必挂"门槛字段——"这项不行是否必挂"的裁决属于复盘时的人,不属于 schema)。
2. **label 权威词表** — 题与 common grader 的 label 必须出自此清单;要用新词,先加进清单。这是防同义漂移(`idempotency` vs `幂等`)的唯一治理点。

**没有数值分数线。** 达标是外延式的:该 topic 下没做过/变式题的通过情况 + 覆盖 + 无必过项失败 + 非久未验证。不要替用户发明 `required: 0.75` 这类字段。

## 建目标

1. `init --goal-id <id>` 在 goal home 搭骨架(已存在 goal.yaml 会拒绝覆盖)。
2. **git 引导闭环**:检测 home 非 git 仓库 → 陪用户当场做完,用户只需确认:
   - `git init` + 写 `.gitignore`(内容:各 workspace 的 `state/`——它可再生)+ 首次 commit;
   - 有 `gh` 且已登录 → `gh repo create evalme-data --private --source . --push` 一步建私有远端。**仓库名固定为 `evalme-data`**——它是新设备自动发现的锚点,不要改名;没有 gh → 告知远端可后补,本地先用不耗事。
   - 用户明确拒绝则尊重——单机使用完全合法,同步是可选增强。
3. **陪用户起草 topics**:问清楚这个目标真正考什么(内容领域)、哪些横切行为也算数(如 communication,标 `cross_cutting: true`)。weight 是用户的决策——你起草,**用户确认后生效**。
4. 检查 common grader 模板(`graders/communication-v1.yaml`)是否贴合,不贴合陪用户改(生效前可自由改;一经判定引用即不可变)。
5. 交接:出题去出题流程(没有题,一切都测不了)。

## 换机 / 新设备接入(自动发现,接近无感)

三个坐标全固定:仓库名 `evalme-data`(约定)、owner = gh 登录用户、本地路径 = goal home。因此**用户唯一需要的前提是 gh 已登录**,地址可完全推导,零输入。

发现 home 不存在/为空时:

1. `gh auth status` 已登录?未登录 → 引导 `gh auth login`(或退回:手动给 repo 地址 / 纯单机模式)。
2. `gh repo view <user>/evalme-data` 存在?
   - 存在 → 告知"发现你的数据仓库,克隆到 home?"——**确认后**克隆,即刻可用(老用户换机)。保留这一次确认:防撞上用户不相干的同名仓库。
   - 不存在 → 新用户,走正常建目标流程(上方 git 引导闭环会顺手建好 evalme-data,为未来设备留好锚点)。

用户心智模型一句话:**登录 gh,evalme 的数据就自动跟着你**。多设备交替使用时,各会话自动 pull/sync;若 pull 报冲突,先解决再练。

## 修订 topics

- 加 topic / 调 weight:直接编辑 goal.yaml + git commit(git 即版本机制)。
- **删 topic 前先查**:是否有题/grader 还在用这个 label。有引用就别删,先讨论。

## 归档删除

删 workspace 目录 + git 记录即可,无破坏性命令。提醒用户:数据自持,卸载插件不删数据。

## 红线

- 不代填 weight——起草可以,定稿必须用户确认。
- `list`/`status` 是只读的,展示最近一次算的结果,可能滞后;要最新数值走复盘流程。
