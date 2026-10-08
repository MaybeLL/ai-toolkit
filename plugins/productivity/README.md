# Productivity

MaybeLL 的个人生产力技能合集。以 **skill** 为入口（无独立 CLI、无必需 MCP），部分制图 skill 附带模板、参考资料和辅助脚本。

## 包含的 skills

| Skill | 作用 | 触发 |
|---|---|---|
| `explain-clearly` | 结构化、可视化地解释概念/机制/设计 | `/explain-clearly` 手动触发 |
| `grilling` | 对计划/决策/想法做高强度拷问 | 手动触发 |
| `grill-me` | 逐问拷问以磨砺计划 | 手动触发 |
| `grill-with-docs` | 拷问过程中同步产出 ADR 与术语表 | 手动触发 |
| `domain-modeling` | 打磨领域模型 / 统一语言 / ADR | 手动触发 |
| `research` | 针对问题查一手资料并落盘 Markdown | 手动触发 |
| `tdd` | 测试驱动开发（red-green-refactor） | 手动触发 |
| `teach` | 在 workspace 内教练式教学 | 手动触发 |
| `drawio` | YAML-first 离线 draw.io 制图 | 手动触发 |
| `excalidraw-diagram-generator` | 从自然语言生成 Excalidraw 流程图、架构图、思维导图等 | 请求 Excalidraw 制图，或手动触发 |
| `wait-what` | 要求重新用更简单、带上下文的方式解释上一条信息 | 手动触发 |

## 定位

本插件是"开发者的个人工具层"：与 `evalme`（领域系统）不同，这里的 skill 与具体业务无关，属于跨场景的通用能力。新增个人 skill 时放到 `skills/<name>/SKILL.md` 即可，插件会自动发现。

## Excalidraw 制图

`excalidraw-diagram-generator` 从本机全局同名 skill 完整导入，包含 8 个 `.excalidraw` 模板、2 份格式参考和 3 个 Python 辅助脚本。基础制图直接生成 JSON，无额外依赖；运行添加箭头、添加图标和拆分图标库的脚本需要 Python 3.10+，仅使用标准库。第三方图标库按需自行提供。

资源路径以该 skill 的 `SKILL.md` 所在目录为基准。本仓库中的路径为 `plugins/productivity/skills/excalidraw-diagram-generator/`；说明中以 `skills/excalidraw-diagram-generator/` 开头的示例从插件根目录运行，以 `scripts/` 开头的示例从 skill 目录运行。安装到其他宿主后，按实际 skill 目录解析路径。
