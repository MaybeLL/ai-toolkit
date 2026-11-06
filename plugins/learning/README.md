# Learning

Research primary sources, learn topics and clarify difficult explanations.

包含：[research](skills/research), [teach](skills/teach), [explain-clearly](skills/explain-clearly), [wait-what](skills/wait-what), [discussion-map](skills/discussion-map), [book-to-skill](skills/book-to-skill), [build-on-prior-work](skills/build-on-prior-work)。

安装方式见[仓库说明](../../README.md)，开发和发布见[维护说明](../../docs/MAINTAINING.md)。每个 Skill 的源码只在本插件中维护，单独安装与插件安装共用这些文件。

`discussion-map` 根据对话上下文理解问题，生成展现概念与内在联系的 Mermaid 逻辑图。只需触发 `$discussion-map`，无需附加说明，默认直接整理当前可见讨论。

`book-to-skill` 将 PDF、EPUB、DOCX、Markdown 等书籍和文档转成含框架、原则、章节索引的 Skill。示例：`使用 book-to-skill 把 /path/to/book.md 转成 Skill`。提取器需要 Python 3.10+；其他格式依赖可用 `python3 skills/book-to-skill/scripts/extract.py --check` 查看。来源与本地适配见 [UPSTREAM.md](skills/book-to-skill/UPSTREAM.md)。

`build-on-prior-work` 在解决问题前调查已有研究、实现与经验，检查当前问题与经典问题或跨领域方法的联系及差异，必要时根据证据重审问题定义。示例：`使用 build-on-prior-work 调查这个问题有哪些已有解法，分析适用条件，给出方案与验证计划`。默认交付研究、方案建议与验证计划；若原任务已要求完整解决问题，则把结论带入后续验证与实现。适用范围不限于软件工程，使用宿主可用的检索和资料读取工具即可。
