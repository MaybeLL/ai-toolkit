# Productivity

MaybeLL 的个人生产力技能合集。只包含 **skill**（无常驻服务、无 MCP），部分 skill 自带确定性的本地辅助脚本。

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
| `wait-what` | 要求重新用更简单、带上下文的方式解释上一条信息 | 手动触发 |
| `read-config-center` | 项目感知地理解查询，并只读发现和读取 Shopee SCC 配置 | 自动或手动触发 |

## 定位

本插件是"开发者的个人工具层"：与 `evalme`（领域系统）不同，这里的 skill 与具体业务无关，属于跨场景的通用能力。新增个人 skill 时放到 `skills/<name>/SKILL.md` 即可，插件会自动发现。
