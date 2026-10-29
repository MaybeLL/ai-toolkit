# 维护与发布

## 唯一来源

通用 Skill 只在 `plugins/productivity/skills/<name>/` 修改。保留这个目录是为了兼容已有插件安装和外部链接；`skills.sh.json` 让通用安装器发现同一份源码。不要另建 `skills/` 副本。

每个 Skill 至少包含 `SKILL.md`；按实际需要增加 `references/`、`scripts/`、`assets/` 和 `agents/openai.yaml`。入口保持简短，详细依据放本地参考文档。原书内容使用自己的转述并标明出处，不打包整本书或研究中间产物。

与具体产品一起演进的 Skill 留在产品仓库，例如 [EvalMe](https://github.com/MaybeLL/evalme)。第三方 Skill 记录上游与许可证；不要将本机服务地址、凭据和安装缓存作为通用 Skill 发布。

开发时从仓库路径加载 Skill，或在宿主支持时手动链接到稳定的源码目录。链接前先检查同名安装：有修改则备份并合并回源码，再移走旧安装；不要让全局、项目和插件渠道同时加载同名 Skill。`skills add` 的默认软链接通常连接安装器自己的副本，不能当作开发仓库的实时链接。

## 修改与验证

需要 Node.js 22.20+、npm 和 Python 3.9+。安装器测试固定使用 `skills@1.7.4`；版本升级与其他开发依赖一样，经 PR、lockfile 和测试更新。

```bash
npm ci --ignore-scripts
npm run check
npm test
npm run package
```

- `check`：插件版本/路径一致性，Skill YAML、命名、描述、UI 字段，本地 Markdown 链接，以及机器专属 home 路径。
- `test`：验证器的反例；所有 ZIP 的校验和、可重复构建、解压检查；从独立临时目录运行 drawio；安装器发现全部 Skill 并只安装所选 Skill；已有 drawio DSL 回归测试。
- `package`：写入空的 `dist/`，每个 Skill 一个 ZIP，附 `release.json`、`SHA256SUMS`。每个包内有来源提交、发布版本和许可证。脏工作区可以本地试打包，但标记 `dirty: true`；正式发布拒绝脏状态。

重复打包请指定新的空目录：`python3 scripts/package-skills.py --output /tmp/ai-toolkit-release-check`。打包器不会清空已有目录。ZIP 包含运行资源，排除测试文件、测试 fixtures、reports、缓存和开发依赖；源码安装会保留仓库中的完整 Skill 目录。

本地链接检查解析 Markdown 链接和图片，忽略代码块中的示例，验证目标文件存在且位于本 Skill 内；不验证网页可达性、章节锚点或所有代码片段内的路径。动态资源由运行测试补充。历史报告和 vendored 文档并不代表本次验证。

新增/修改 Skill 时更新目录说明和 `tests/behavior-cases.json` 中有区分度的场景；不必为文字变化写逐字匹配测试。行为场景需要在目标宿主的新会话中运行，记录模型、版本、输出和失败原因；结构检查通过不等于模型效果通过。见 [行为验收](../tests/README.md)。

## 版本发布

仓库、productivity 插件和 Pi package 共用发布版本；导入 Skill 自带的上游版本保留，不与集合版本混淆。

1. 修改 `package.json`、`package-lock.json` 和 productivity 的两个插件 manifest 中的集合版本，更新 `CHANGELOG.md` 对应版本条目。
2. 提交 PR，通过 CI，完成适用的行为验收，合并到 `main`。
3. 在已同步、干净的 `main` 上打同名标签，例如：

   ```bash
   git tag -a v0.2.0 -m "AI Toolkit 0.2.0"
   git push origin v0.2.0
   ```

4. `release.yml` 校验标签版本与 main 历史，重新测试和构建，并创建 **draft GitHub Release**，上传 13 个独立 ZIP、校验和与来源清单。核对资源和版本说明后，在 GitHub 发布草稿。

版本标签只指向一次发布，不移动已有标签。修复用新版本；保留旧 Release 供回退。新增兼容能力升 minor，修复升 patch；改变调用方式、删除/重命名 Skill 时记录迁移方式。

## 用户更新与回退

安装器的 `check`/`update` 跟随配置的来源，不等于版本锁定。更新前将安装目录中的本地改动移回自己的分支或备份；不要直接覆盖唯一副本。

需要可复现安装时，从指定 Release 下载 ZIP 和 `SHA256SUMS`，校验后解压，安装本地目录：

```bash
shasum -a 256 -c SHA256SUMS
unzip software-design-philosophy-0.2.0.zip -d extracted
npx skills@1.7.4 add ./extracted/software-design-philosophy -a codex -g
```

`SHA256SUMS` 包含全部资源；只下载一个包时，对比其对应一行，或先下载全部资源再运行上面的整体校验。回退时使用旧版本同样操作，先保存本地改动。ZIP 内的 `SOURCE.json` 和 Release 的提交可用于追溯。
