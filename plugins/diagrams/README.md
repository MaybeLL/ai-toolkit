# Diagrams

Create editable Excalidraw diagrams and interactive HTML visual explanations.

包含：[excalidraw-diagram-generator](skills/excalidraw-diagram-generator)、[visual-explainer](skills/visual-explainer)、[html-doc](skills/html-doc)。

安装方式见[仓库说明](../../README.md)，开发和发布见[维护说明](../../docs/MAINTAINING.md)。每个 Skill 的源码只在本插件中维护，单独安装与插件安装共用这些文件。

Excalidraw 文档中以 `skills/excalidraw-diagram-generator/` 开头的示例从插件根目录运行；以 `scripts/` 开头的示例从该 Skill 目录运行。

`visual-explainer` 生成可在浏览器中阅读的 HTML 图解，适合系统架构、代码变更、方案比较、数据和状态回放。示例：`使用 visual-explainer 解释这个项目的请求流程，输出到指定目录`。基础渲染需要 Node.js 22.20+，无需 npm 安装；[可选浏览器检查、MCP 和导出依赖](skills/visual-explainer/RUNTIME.md)按需配置。图解 Skill 默认走本地 CLI，未自动注册上游 Pi 扩展或斜杠命令。

`html-doc` 用于以图和交互为主的 HTML 说明、原理讲解、方案比较、研究报告和知识文档。示例：`使用 html-doc 将这些材料制作成可交互的 HTML 文档`。默认输出内联必要 CSS/JS 的独立 HTML，以总览、探索和按需展开的证据组织内容；交付前实际打开页面验证主要交互、窄屏和键盘操作。
