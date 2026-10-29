# Productivity

AI Toolkit 的通用 Skill 插件，包含 13 个 Skill。完整的用途、依赖与安装命令维护在 [仓库目录](../../README.md#skill-目录)，开发和发布见 [维护说明](../../docs/MAINTAINING.md)。

`skills/` 是各安装渠道共用的唯一源码。新增 Skill 放在 `skills/<name>/SKILL.md`，无需复制到其他宿主目录；添加后更新目录并运行仓库检查。

资源路径相对于各自的 Skill 目录解析。Excalidraw 文档中以 `skills/excalidraw-diagram-generator/` 开头的示例从插件根目录运行，以 `scripts/` 开头的示例从该 Skill 目录运行；安装后以宿主实际 Skill 目录为准。
