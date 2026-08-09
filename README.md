# Codex-DeepSeek-Handoff

在 Codex 桌面应用里保留你的 DeepSeek 聊天记录。

这个项目解决的是一个很具体的问题：同一个 Codex 任务先用 ChatGPT/OpenAI，
再用官方 DeepSeek Responses API，之后还能回到 OpenAI 继续聊。切换模型时，
任务的项目目录、可见消息、名称和交接关系会保留；DeepSeek 产生的、OpenAI
不接受的推理 `content` 数组会在交回 OpenAI 前清理为 `null`，联网搜索记录的
关联 ID 也会按目标协议对齐。

它不是新的聊天客户端，也不是中转站。它调用本机已经安装的 Codex
`app-server`，只操作本机任务状态；不会把聊天内容上传到本项目的服务器，
也不会自动发起模型请求。

## 直观结果

```text
关闭 Codex
    ↓
DeepSeek 入口：先完成 GPT → DeepSeek 的任务交接，再打开同一个 Codex 应用
    ↓
DeepSeek 工作
    ↓
关闭 Codex
    ↓
任务交接GPT：先完成 DeepSeek → GPT 的清理、复制、验证，再打开 Codex 应用
```

因此两种模型看到的是各自可接受格式的同一条“任务接力棒”，而不是两个
互不相干的镜像任务。

## 已实现的安全边界

- 优先使用 `thread/fork`；只有协议不支持时才按既定顺序降级。
- 每个任务先生成 dry-run 报告，再执行写入。
- 使用迁移 manifest 去重，支持多任务流水线和单任务验收。
- 在写入前生成带时间戳的 SQLite 一致性备份。
- 不直接修改 `state_5.sqlite`、`session_index.jsonl` 或源 rollout。
- 检查 Codex app-server schema，发现不匹配就停止。
- 启动器有每用户锁；重复点击不会排队生成重复会话。
- DeepSeek 默认思考强度为 `max`，联网搜索为 `live`。

## 环境要求

- Windows 10/11
- 已安装并可正常打开的 Codex 桌面应用
- Node.js 18 或更高版本
- PowerShell 7（推荐用于启动器和安装脚本）
- 已开通 DeepSeek 官方 API，并自行在本机保存 API key
- 已先通过 DeepSeek 官方 Codex 脚本完成基础接入，并确认 DeepSeek 能单独启动

项目不会把 API key 写入 Git。DPAPI 密文文件也被 `.gitignore` 排除。

## 本地安装

### 1. 先完成 DeepSeek 官方接入

本项目不重新分发 DeepSeek 官方模型目录。先从官方地址下载脚本，阅读内容后
再执行；不要把 API key 写入仓库：

```powershell
$officialSetup = Join-Path $env:TEMP 'codex-deepseek-setup-en.ps1'
Invoke-WebRequest `
  -Uri 'https://cdn.deepseek.com/api-docs/codex-deepseek-setup-en.ps1' `
  -OutFile $officialSetup
Get-Content -LiteralPath $officialSetup
pwsh -NoProfile -ExecutionPolicy Bypass -File $officialSetup
```

完全退出并重新打开一次 Codex，确认 DeepSeek 基础接入可用，然后关闭 Codex。

### 2. 安装任务交接层（先 dry-run）

在仓库根目录执行。下面的第一条只检查将要复制的文件，不会改动你的
Codex 配置或任务；确认输出无误后再去掉 `-WhatIf`。

```powershell
$repo = (Get-Location).Path
pwsh -NoProfile -ExecutionPolicy Bypass `
  -File "$repo\work\thread-localizer\launcher\install.ps1" `
  -SourceRoot $repo -WhatIf

pwsh -NoProfile -ExecutionPolicy Bypass `
  -File "$repo\work\thread-localizer\launcher\install.ps1" `
  -SourceRoot $repo
```

安装器会复用官方模型目录，复制交接 CLI，备份并初始化受管配置，严格验证
候选 `config.toml`，然后创建桌面的“DeepSeek交接”和“任务交接GPT”两个入口。
它不会迁移任务数据库、覆盖源 rollout、自动发送模型请求或自动启动 Codex。

### 3. 使用

切换前完全退出 Codex。进入 DeepSeek 时点击“DeepSeek交接”；回到 ChatGPT
登录模式时点击“任务交接GPT”。启动器会等待全部任务交接完成，成功后才
显示桌面应用；工作期间重复点击不会创建重复会话。

卸载只移除本项目安装的工具文件，不删除 Codex 任务、配置或加密 API key：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass `
  -File "$env:USERPROFILE\.codex\model-switcher\uninstall.ps1" -WhatIf

pwsh -NoProfile -ExecutionPolicy Bypass `
  -File "$env:USERPROFILE\.codex\model-switcher\uninstall.ps1"
```

卸载器只删除受管配置区块、两个快捷方式和程序文件；官方 DeepSeek 模型目录、
加密 API key、任务交接 manifest、报告和备份默认保留。

## 开发与验证

```powershell
npm test
npm run schema-check
npm run dry-run:deepseek
npm run dry-run:openai
```

`schema-check` 只检查或缓存 app-server 协议，不启动模型回合。dry-run 只
生成报告；第一次实际迁移应使用 `--only-task-id` 做单任务验收，再扩大范围。
命令行细节见 [work/thread-localizer/README.md](work/thread-localizer/README.md)。

## 配置模型

唯一的提供商默认设置在
[work/thread-localizer/data/handoff-settings.json](work/thread-localizer/data/handoff-settings.json)：

- OpenAI 使用 `preserve-existing`，尽量回到任务此前记住的 GPT 模型。
- DeepSeek 使用 `global`，修改 `activeModel` 后下一次交接统一使用新模型。
- DeepSeek 模型 slug 必须先出现在本机的 `models-deepseek.json` 中。

启动器支持以下环境变量，便于从其他目录运行：

- `CODEX_HOME`：替代默认的 `%USERPROFILE%\.codex`。
- `CODEX_MODEL_SWITCHER_ROOT`：指定模型切换器安装目录。
- `CODEX_HANDOFF_ROOT`：指定包含 `src\cli.mjs` 和 `data\handoff-settings.json`
  的交接工具目录。

## 文档

- [架构说明](docs/architecture.md)
- [兼容性矩阵](docs/compatibility.md)
- [故障排查](docs/troubleshooting.md)
- [安全边界](docs/safety.md)
- [English README](README.en.md)

## 许可

本项目采用 MIT License。DeepSeek 官方模型目录和品牌图标不会随仓库重新
分发；安装器复用用户本机的官方安装结果。不要把个人图标、API key 或任务
数据提交到公开仓库。
