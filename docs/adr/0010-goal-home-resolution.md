# ADR-0010: goal home——数据位置与使用位置解耦,workspace 自动解析

- 状态:Accepted
- 日期:2026-02-14

## 背景

CLI 一直位置无关(不探测项目根),但每条命令要求显式 `--workspace <dir>`——
解耦的成本转嫁给了用户。真实使用场景是:用户在任意项目仓库里干活,随手唤起
skill 练一题,不应背诵数据路径,数据也绝不能落进当前项目仓库。

## 决策

1. **goal home**:所有 goal workspace 集中在一个用户级目录(数据的家),
   与任何项目仓库物理隔离。git 同步只发生在 home,项目仓库零污染。
2. **workspace 自动解析**(高→低):
   - `--workspace <dir>` 显式覆盖(原语义不变);
   - `GOAL_OPTIMIZER_HOME` 环境变量;
   - `~/.goal-optimizer/config.json` 的 `root` 字段(支持 `~` 展开);
   - 默认 `~/goal-optimizer/`。
3. **目标选择**:home 下多目标时用 `--goal <id>`;单目标自动选中;
   config 可设 `default_goal`。都没有则报错并列出候选(确定性,不猜)。
4. `init` 免 `--workspace`:默认在 `<home>/<goal-id>` 建 workspace,home 不存在
   则创建并提示 `git init`(异地备份 + 跨设备,ADR 讨论的同步方案)。
5. `list` 免 `--root`:默认扫描 home。

## 理由

- 系统本质是 skill + CLI,应当"在哪都能用";数据主权要求"数据只在一处"。
  两者由解析层撮合,互不妥协。
- 解析只影响"找到哪个目录",不影响任何计算——INV-2/INV-5 不受牵连。
- 环境变量 + config 保留高级用户(多机、自定义位置)的自由度;默认值让
  新用户零配置。

## 后果

- 五个 skill 的 CLI 协议简化:不再要求用户提供 workspace 路径。
- 多设备同步的操作对象明确为 goal home 这一个 git 仓库。
- ID 顺序编号的多设备并发风险(见同步讨论)不变,仍以"先 pull 后练"纪律兜底。
