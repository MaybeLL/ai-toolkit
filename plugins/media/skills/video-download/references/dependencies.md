# 依赖检查与安装

本文件随 Skill 安装，涵盖常见检查和安装决策。检查阶段只读；所有安装、升级或远程组件下载必须在用户确认具体方案之后执行。

## 按任务检查

| 任务 | 所需能力 |
|---|---|
| 所有下载 | yt-dlp 可运行 |
| 视频或音频成品 | ffprobe 验证；FFmpeg 用于默认最佳画质的音视频合并、音频提取与转码 |
| 仅下载字幕 | 不要求 FFmpeg/ffprobe；若另需转换字幕格式，再检查转换工具 |
| YouTube，包括其字幕 | 兼容的 JS 运行时和 yt-dlp 可用的 EJS 组件 |

运行 `python3 <skill目录>/scripts/check_dependencies.py --mode video`；YouTube 加 `--youtube`。脚本使用 Python 3.8+ 标准库，不下载、不安装、不读取 yt-dlp 配置或加载其插件，不访问视频 URL。结果是 JSON：退出码 0 表示所检查的本地组件可用，1 表示存在需要处理的项。

- `missing`：PATH 找不到工具，或隔离诊断未报告本地 EJS。先核实已有安装及配置中的自定义路径/远程组件设置，再判定是否真正缺失。
- `unusable`：找到命令但启动失败、版本无法识别或版本不满足最低要求；先诊断，不直接叠装另一套。
- `unverified`：证据不足，例如旧版 yt-dlp 不支持诊断选项、未运行 yt-dlp、或只有其他 JS 运行时；人工核实后再决定。
- `ready`：通过本地探测；EJS 仅证明包被发现，最终兼容性和站点可用性要通过本次用户链接验证。

脚本检查默认 PATH；它不代替配置检查。`runtime_args` 是本次 yt-dlp 命令需带的参数数组，尤其 Node 默认未启用，不能检查到 Node 后漏掉 `--js-runtimes node`。无需为一次任务持久修改配置。

### 没有 Python 或需人工核实

Unix 用 `command -v`，PowerShell 用 `Get-Command` 查路径，再逐项运行 `yt-dlp --ignore-config --no-plugin-dirs --version`、`ffmpeg -version`、`ffprobe -version`。检查操作系统/架构以及已有包管理器。工具的名字存在不能代替实际启动检查。

YouTube 优先复用已有 Deno 2.3+ 或 Node 22+；Node 需显式带 `--js-runtimes node`。若只有 QuickJS/Bun，按当前上游兼容范围核实，不默认再装 Deno。最低版本基线核对于 2026-10-30，遇到兼容问题时核对当前官方说明。

EJS 应在**当前 yt-dlp 自己的环境**中检查。可捕获无 URL 的隔离启动诊断：

```sh
yt-dlp --ignore-config --no-plugin-dirs --no-remote-components --verbose --simulate --js-runtimes node
```

这里的 Node 参数仅在选择 Node 时使用。无 URL 导致非零退出正常；只提取组件/运行时信息，不转发整段日志。不能用系统 Python 中的 `import yt_dlp_ejs` 证明另一个 pipx/uv/独立可执行版本可用，也不能用一次网络错误断言缺依赖。

## 用户确认

将缺失项合并成一次具体询问，例如：

> 缺少 FFmpeg（含 ffprobe），需要它合并音视频并验证成品。yt-dlp 和 Node 已可用。我计划通过现有 Homebrew 执行 `brew install ffmpeg`，是否安装？

用户确认后 agent 执行安装，不只把命令交给用户。若授权只覆盖部分依赖，只安装该部分。没有回答或拒绝都不是同意。需要新增包管理器、升级现有工具或改变安装范围时，先更新方案并取得对应确认。管理员认证通过系统正常界面完成，不要求用户在聊天提供密码。

## 确认后的安装选择

优先复用已存在的包管理器；只填入已确认需要的包。包管理器自动带入必要的传递依赖属于该方案，不能借此安装其他工具。

- **macOS / 已有 Homebrew**：缺 yt-dlp 用 `brew install yt-dlp`，缺 FFmpeg/ffprobe 用 `brew install ffmpeg`；确实没有可用 JS 运行时且已确认用 Deno 时，执行 `brew install deno`。不要无条件执行三个命令。
- **Linux**：通过系统发行版及已配置仓库确认包名。Debian/Ubuntu 的 FFmpeg 包可用 `sudo apt-get install ffmpeg`；其他发行版使用现有包管理器。安装前核实仓库提供的 yt-dlp 与运行时版本满足需要，不通过修改系统 Python 强行补包。
- **Windows**：复用 winget/Scoop/Chocolatey；先用对应搜索与详情命令确认官方来源、精确包 ID 和架构，再安装用户确认的包。没有包管理器时，可选择官方独立可执行版本与校验和，先确认保存目录和 PATH 处理方式。
- **Python 管理的 yt-dlp**：优先沿用其 pipx、uv tool 或虚拟环境。新安装选择 `yt-dlp[default]`；已有版本缺 EJS 时，在同一环境补齐该版本声明的 extras，例如已确认解释器上的 `python -m pip install "yt-dlp[default]==<已安装版本>"`。不要把组件安装到无关的系统 Python；若需要升级 yt-dlp 才能兼容，明确列入确认方案。
- **官方独立可执行版本**：EJS 通常已打包，不必另装 Python/EJS。第三方包的 EJS 是否包含取决于打包方式；若缺失，选择该渠道支持的配套包或调整安装来源。`--remote-components ejs:github` 会下载组件，不能在确认前当作探测手段偷偷启用。

安装后重新检查版本、路径和本地组件。若工具已装好但当前 shell 看不到它，先用已知绝对路径验证；只有用户同意持久配置时修改 PATH。安装失败则报告具体失败项及下一步，不无限重试，不顺便调整网络出口。

## 官方来源

- [yt-dlp 安装方式](https://github.com/yt-dlp/yt-dlp/wiki/Installation)
- [EJS 与运行时兼容说明](https://github.com/yt-dlp/yt-dlp/wiki/EJS)
- [FFmpeg 官方下载](https://ffmpeg.org/download.html)

日常执行按上述本地流程；平台差异、版本冲突或安装方式不确定时再查上游。
