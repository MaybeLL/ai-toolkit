# 维护与发布

## 唯一来源

通用 Skill 只在 `plugins/<plugin>/skills/<name>/` 修改。四个插件为 `engineering`、`learning`、`diagrams`、`media`；每个 Skill 只归属一组，名称在仓库内唯一。`skills.sh.json` 和 Pi 配置指向相同目录，校验器与打包器遍历这些插件。不要另建 Skill 副本或跨插件软链接。

组合入口与依赖放在同一插件：`grill-me` 需要 `grilling`，`grill-with-docs` 需要 `grilling` 和 `domain-modeling`。分组不改变 Skill 的触发条件和适用领域。0.4.0 删除旧 `productivity` 插件及 `drawio`，不提供过渡入口。

每个 Skill 至少包含 `SKILL.md`；按实际需要增加 `references/`、`scripts/`、`assets/` 和 `agents/openai.yaml`。入口保持简短，详细依据放本地参考文档。原书内容使用自己的转述并标明出处，不打包整本书或研究中间产物。

与具体产品一起演进的 Skill 留在产品仓库，例如 [EvalMe](https://github.com/MaybeLL/evalme)。第三方 Skill 记录上游与许可证；不要将本机服务地址、凭据和安装缓存作为通用 Skill 发布。

开发时从仓库路径加载 Skill，或在宿主支持时手动链接到稳定的源码目录。链接前先检查同名安装：有修改则备份并合并回源码，再移走旧安装；不要让全局、项目和插件渠道同时加载同名 Skill。`skills add` 的默认软链接通常连接安装器自己的副本，不能当作开发仓库的实时链接。

## 修改与验证

需要 Node.js 22.20+、npm 和 Python 3.10+。安装器测试固定使用 `skills@1.7.4`；版本升级与其他开发依赖一样，经 PR、lockfile 和测试更新。

```bash
npm ci --ignore-scripts
npm run check
npm test
npm run package
```

- `check`：四个插件及两个 marketplace 的版本/路径一致性、Skill 名称唯一性和组合依赖，Skill YAML、命名、描述、UI 字段，本地 Markdown 链接，以及机器专属 home 路径。
- `test`：验证器与重名反例；所有 ZIP 的校验和、可重复构建、解压检查及来源路径；从临时目录运行解压后的媒体检查器和 Excalidraw 脚本；skills CLI 发现全部 Skill、逐组抽样单独安装、按插件目录安装且不混入其他组；依赖检查器回归测试。
- `package`：写入空的 `dist/`，每个 Skill 一个 ZIP，附 `release.json`、`SHA256SUMS`。每个包内有来源提交、发布版本和许可证。脏工作区可以本地试打包，但标记 `dirty: true`；正式发布拒绝脏状态。

重复打包请指定新的空目录：`python3 scripts/package-skills.py --output /tmp/ai-toolkit-release-check`。打包器不会清空已有目录。ZIP 包含运行资源，排除测试文件、测试 fixtures、reports、缓存和开发依赖；源码安装会保留仓库中的完整 Skill 目录。

本地链接检查解析 Markdown 链接和图片，忽略代码块中的示例，验证目标文件存在且位于本 Skill 内；不验证网页可达性、章节锚点或所有代码片段内的路径。动态资源由运行测试补充。历史报告和 vendored 文档并不代表本次验证。

新增/修改 Skill 时更新目录说明和 `tests/behavior-cases.json` 中有区分度的场景；不必为文字变化写逐字匹配测试。行为场景需要在目标宿主的新会话中运行，记录模型、版本、输出和失败原因；结构检查通过不等于模型效果通过。见 [行为验收](../tests/README.md)。

## 原生插件验收

CI 的 skills CLI 测试不代替 Claude Code、Codex、Pi 原生插件验收。涉及插件清单、marketplace 或目录拆分时，在隔离配置或测试账号中检查：发现四个新插件且没有旧入口；安装一组后只加载该组 Skill；更新后仍能定位资源；卸载后不再加载。Claude Code 可额外运行 `claude plugin validate <插件目录>` 验证清单。记录宿主版本与实际结果，不把未运行的步骤记为通过。

Pi 的仓库安装提供全部 Skill，验收其 `pi.skills` 四个目录和 12 个 Skill；按需安装由 skills CLI 提供。不要用用户日常配置做破坏性的安装/卸载测试。

## 版本发布

仓库、四个插件和 Pi package 共用发布版本；导入 Skill 自带的上游版本保留，不与集合版本混淆。

1. 修改 `package.json`、`package-lock.json` 和 四个插件各自的 Claude Code / Codex manifest 中的集合版本，更新 `CHANGELOG.md` 对应版本条目。
2. 提交 PR，通过 CI，完成适用的行为验收，合并到 `main`。
3. 在已同步、干净的 `main` 上打同名标签，例如：

   ```bash
   git tag -a v0.4.0 -m "AI Toolkit 0.4.0"
   git push origin v0.4.0
   ```

4. `release.yml` 校验标签版本与 main 历史，重新测试和构建，并创建 **draft GitHub Release**，上传全部独立 Skill ZIP（当前 12 个）、校验和与来源清单。核对资源和版本说明后，在 GitHub 发布草稿。

版本标签只指向一次发布，不移动已有标签。修复用新版本；保留旧 Release 供回退。新增兼容能力升 minor，修复升 patch；改变调用方式、删除/重命名 Skill 时，在版本说明中明确不兼容变更及新入口。0.x 阶段的不兼容调整升 minor。

## 用户更新与回退

安装器的 `check`/`update` 跟随配置的来源，不等于版本锁定。更新前将安装目录中的本地改动移回自己的分支或备份；不要直接覆盖唯一副本。

需要可复现安装时，从指定 Release 下载 ZIP 和 `SHA256SUMS`，校验后解压，安装本地目录：

```bash
shasum -a 256 -c SHA256SUMS
unzip software-design-philosophy-0.4.0.zip -d extracted
npx skills@1.7.4 add ./extracted/software-design-philosophy -a codex -g
```

`SHA256SUMS` 包含全部资源；只下载一个包时，对比其对应一行，或先下载全部资源再运行上面的整体校验。回退时使用旧版本同样操作，先保存本地改动。ZIP 内的 `SOURCE.json` 和 Release 的提交可用于追溯。
