# ADR-0011: 跨设备同步织进 skill 流程——git 引导闭环 + 会话前 pull / 会话后 push

- 状态:Accepted
- 日期:2026-02-14

## 背景

数据只存本机 goal home;跨设备靠用户自己会 git(init 只打一行 tip,纪律靠自觉)。
懂 git 的用户可行,不懂的没有路——与"用户不用关心数据问题"的目标有距离。

## 决策

同步动作从"用户的记性"移到"skill 的固定步骤",零 CLI 改动(第一档方案):

1. **建目标时引导闭环(goal-define)**:检测 home 非 git 仓库 → Agent 陪用户当场
   完成 `git init` + `.gitignore`(state/)+ 首次 commit;有 `gh` 则再
   `gh repo create --private` + push,没有则告知远端可后补。用户只做确认。
2. **会话前 pull**:每个 skill 会话开始、动数据之前,若 home 是 git 仓库且有
   remote → `git pull --ff-only`。失败(冲突/离线)则明确告知用户并停在安全侧:
   写侧 skill 建议先解决再练(避免在旧数据上分叉),读侧 skill 可继续(只读旧
   投影,如实标注可能滞后)。
3. **同步欠账可见化 + `goal sync`(A/B 加固)**:
   - `assess`/`list` 顺手报告 git 同步欠账("N 处未提交改动 / N 个 commit 未推送 — run: goal.mjs sync")——用户每次看结果都会被提醒,静默欠账变可见欠账,自愈闭环。纯只读,git 不可用时静默跳过,绝不阻塞测量命令。
   - `goal sync [--message <m>]`:commit + pull --ff-only + push 一步封装,失败语义统一(非 git 仓库→提示启用;无 remote→只本地 commit;pull 分叉/push 离线→明确报错但本地数据安全)。skill 调它而非散写 git 命令,降低 Agent 执行出错面。
4. **读侧(review)不 commit**:assess 产物在 state/(gitignore),无需入库;
   仅 plan.json 变更时随下次写侧会话一起提交。
5. **无 git / 无 remote 时全部静默跳过**——单机用户零打扰,同步是可选增强。

## 换机流程(用户视角)

新电脑:装插件 → 任意 skill 会话说"我的数据在 <repo>" → Agent
`git clone <repo> ~/goal-optimizer` → 即刻可用。此流程写入 goal-define。

## 理由

- 事实层 append-only + state/ 可再生,git 冲突面天然极小;ff-only 保证不产生
  意外合并,冲突永远显式暴露给用户。
- Agent 会话本来就能跑命令,"引导 + 自动执行"的成本≈0,却消除了纪律依赖。
- 不做内置云同步(第三档):违反 INV-6,git 远端已给出绝大部分收益。

## 后果

- 五个 SKILL.md 增加统一的"同步"段落;CLI 新增 `sync` 命令与 assess/list 的欠账警告(均不影响任何测量计算,INV-2/INV-5 不受牵连)。
- 顺序 ID 的多设备并发撞车风险仍在(A/B 离线各 record → 同 ID):由
  会话前 pull 大幅降低概率,根治(时间戳 ID)留待多设备成为真实习惯时。
