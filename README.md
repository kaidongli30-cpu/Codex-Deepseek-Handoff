# Codex-DeepSeek-Handoff

在 Codex 桌面应用中，让 GPT 和 DeepSeek 接着同一个任务继续聊。

> 这是一个目前只支持 Windows 的本地任务交接工具。第一次使用命令行也没关系，
> 下面会从“怎么下载项目”开始，一步一步说明。

## 这个项目解决什么问题？

DeepSeek 官方已经提供了接入 Codex 的方式，但切换配置后，经常会出现这样的情况：

- GPT 模式里原来能看到的任务，在 DeepSeek 模式里看不到；
- DeepSeek 新回复的内容，切回 GPT 后不能接着使用；
- DeepSeek 产生的推理记录或联网搜索记录，可能让 GPT 报格式错误。

本项目在 GPT 和 DeepSeek 之间增加了一层本地“任务交接”。直观过程如下：

```text
在 GPT 中工作
    ↓
完全关闭 Codex
    ↓
点击桌面的“DeepSeek交接”
    ↓
工具先交接任务，再打开 DeepSeek 模式的 Codex
    ↓
在 DeepSeek 中继续原任务
    ↓
完全关闭 Codex
    ↓
点击桌面的“任务交接GPT”
    ↓
工具先清理并交接任务，再打开 GPT 模式的 Codex
```

两边看到的是同一个工作过程的接力版本。DeepSeek 的回复可以交回 GPT，GPT 的
新回复也可以继续交给 DeepSeek。

## 使用前必须知道的三件事

1. **本项目不是 Codex，也不提供 DeepSeek API key。** 你需要先安装 Codex，
   并拥有自己的 DeepSeek 官方 API key。
2. **切换前必须完全关闭 Codex。** 不要让 GPT 模式和 DeepSeek 模式同时运行。
3. **交接过程中只点击一次快捷方式。** 聊天记录较多时可能需要等待；工具完成
   交接后才会显示 Codex 窗口。

## 安装前准备

### 第 1 项：确认你使用的是 Windows

目前支持：

- Windows 10
- Windows 11

macOS 和 Linux 目前没有经过本项目验证。

### 第 2 项：确认 Codex 可以正常打开

先用你平时的方式打开 Codex，确认能够登录 ChatGPT/OpenAI，并能进入一个现有
任务。确认后完全关闭 Codex。

如果你还没有安装 Codex，请先从 [OpenAI 官方入口](https://developers.openai.com/)
完成安装和登录，再回来继续。

### 第 3 项：安装 PowerShell 7

PowerShell 是下面用来复制和运行安装命令的窗口。Windows 自带的旧版叫
“Windows PowerShell”，本项目推荐使用 **PowerShell 7**。

打开 Windows 开始菜单，搜索并打开 `PowerShell 7`。在窗口中复制下面这条命令，
然后按回车：

```powershell
$PSVersionTable.PSVersion
```

只要第一行显示的主版本号是 `7`，这一项就通过了。

如果找不到 PowerShell 7，可以按照微软官方说明安装：

- [微软：在 Windows 上安装 PowerShell 7](https://learn.microsoft.com/powershell/scripting/install/install-powershell-on-windows)

Windows 11 用户也可以在终端中执行：

```powershell
winget install --id Microsoft.PowerShell --source winget
```

安装完成后关闭旧窗口，重新打开 `PowerShell 7`。

### 第 4 项：安装 Node.js

在 PowerShell 7 中执行：

```powershell
node --version
```

如果出现类似 `v20...`、`v22...` 或 `v24...` 的版本号，说明已经安装。

如果提示无法识别 `node`，请到 Node.js 官方网站下载 **LTS（长期支持版）**：

- [Node.js 官方下载页面](https://nodejs.org/en/download)

安装时保持默认选项即可。安装完成后重新打开 PowerShell 7，再执行一次
`node --version`。

### 第 5 项：准备 DeepSeek API key

你需要拥有自己的 DeepSeek 官方 API key。不要把 API key 发给别人，也不要写进
本项目的文件或提交到 GitHub。DeepSeek 官方说明见：

- [DeepSeek API 官方文档](https://api-docs.deepseek.com/api/deepseek-api/)

如果你已经能通过 DeepSeek 官方方式打开 Codex，可以直接进入下一节。

## 下载本项目

### 方法 A：下载 ZIP（推荐新手使用）

1. 打开本项目的 GitHub 页面。
2. 点击页面上方绿色的 `Code` 按钮。
3. 点击 `Download ZIP`。
4. 下载完成后，在资源管理器中找到这个 ZIP 文件。
5. 右键 ZIP 文件，选择“全部解压”。
6. 进入解压后的文件夹。

请继续进入文件夹，直到你能同时看到下面这些内容：

```text
README.md
package.json
work 文件夹
scripts 文件夹
```

看到这些文件，才说明你位于正确的“项目根目录”。

### 在正确的文件夹中打开 PowerShell 7

1. 保持上面的项目根目录窗口打开。
2. 点击资源管理器顶部的地址栏。
3. 删除地址栏中原来的文字。
4. 输入 `pwsh`。
5. 按回车。

系统会打开一个 PowerShell 7 窗口，而且它已经位于正确的项目文件夹中。

执行下面这条命令检查：

```powershell
Test-Path ".\work\thread-localizer\launcher\install.ps1"
```

如果输出：

```text
True
```

说明位置正确。如果输出 `False`，请关闭 PowerShell，回到资源管理器继续进入真正
包含 `README.md`、`package.json` 和 `work` 的那一层文件夹，再重新输入 `pwsh`。

## 第一次安装

### 第 1 步：先完成 DeepSeek 官方接入

本项目不会重新分发 DeepSeek 官方模型目录，因此必须先运行 DeepSeek 官方 Codex
配置脚本。

在刚才打开的 PowerShell 7 中，复制下面整段命令，然后按回车：

```powershell
$officialSetup = Join-Path $env:TEMP 'codex-deepseek-setup-en.ps1'
Invoke-WebRequest `
  -Uri 'https://cdn.deepseek.com/api-docs/codex-deepseek-setup-en.ps1' `
  -OutFile $officialSetup
notepad $officialSetup
```

记事本会打开刚下载的官方脚本。检查下载地址确实是
`cdn.deepseek.com`，看完后关闭记事本，再回到 PowerShell 7 执行：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File $officialSetup
```

按照官方脚本的提示配置 DeepSeek API key。

完成后：

1. 完全关闭 PowerShell 和 Codex。
2. 用 DeepSeek 官方脚本创建的方式打开一次 Codex。
3. 确认 DeepSeek 能正常回复一条测试消息。
4. 再次完全关闭 Codex。

如果 DeepSeek 本身还不能正常回复，请先不要安装本项目。只有官方基础接入已经
成功，本项目的任务交接层才能正常工作。

### 第 2 步：预览本项目将执行的安装操作

重新回到项目根目录，按照前面的方式在地址栏输入 `pwsh`，打开 PowerShell 7。

复制下面整段命令并按回车：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass `
  -File ".\work\thread-localizer\launcher\install.ps1" `
  -SourceRoot "$PWD" `
  -WhatIf
```

这里的 `-WhatIf` 意思是“只预览，不真正修改”。窗口中会出现多行
`What if:`，最后还会看到：

```text
"whatIf": true
```

这一步不会迁移任务、不会启动 Codex，也不会发送任何模型请求。

如果这里直接出现红色错误，请先查看本文后面的“常见问题”，不要反复执行正式
安装命令。

### 第 3 步：正式安装

预览没有报错后，在同一个 PowerShell 7 窗口执行下面这段命令。它和上一步的
区别是没有 `-WhatIf`：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass `
  -File ".\work\thread-localizer\launcher\install.ps1" `
  -SourceRoot "$PWD"
```

安装器会：

- 备份 Codex 的相关配置；
- 检查新配置能否被当前 Codex 读取；
- 安装任务交接工具；
- 在桌面创建两个快捷方式。

安装器不会直接修改 Codex 的任务数据库，不会删除原任务，也不会自动发送消息。

### 第 4 步：确认桌面快捷方式

安装成功后，桌面上应该出现：

```text
DeepSeek交接
任务交接GPT
```

它们的作用分别是：

| 快捷方式 | 什么时候点击 | 会做什么 |
| --- | --- | --- |
| `DeepSeek交接` | 当前使用 GPT，下一次想用 DeepSeek | 先把 GPT 任务交给 DeepSeek，再打开 Codex |
| `任务交接GPT` | 当前使用 DeepSeek，下一次想回到 GPT | 先清理并交接 DeepSeek 任务，再打开 Codex |

## 第一次进行任务交接

建议第一次使用一个不重要的测试任务完成验收。

### 从 GPT 切换到 DeepSeek

1. 先用正常的 GPT 登录方式打开 Codex。
2. 新建一个测试任务，发送一句容易辨认的话，例如：

   ```text
   这是 GPT 和 DeepSeek 交接测试。
   ```

3. 等 GPT 回复完成。
4. 完全关闭 Codex。
5. 等待几秒，确认 Codex 窗口已经全部消失。
6. 双击桌面的 `DeepSeek交接`。
7. **只点击一次，然后等待。**
8. 交接完成后，Codex 会自动以 DeepSeek 配置打开。
9. 在“最近”或对应项目中找到刚才的测试任务。
10. 确认能看到 GPT 的测试消息和回复。
11. 在同一个任务中让 DeepSeek 再回复一句。

### 从 DeepSeek 切回 GPT

1. 等 DeepSeek 回复完全结束。
2. 完全关闭 Codex。
3. 等待几秒。
4. 双击桌面的 `任务交接GPT`。
5. **只点击一次，然后等待。**
6. 工具会先处理 DeepSeek 与 GPT 不兼容的推理和联网搜索记录。
7. 完成后，Codex 会自动回到 GPT 登录配置。
8. 打开刚才的测试任务。
9. 确认能看到 DeepSeek 刚刚发送的内容。
10. 再给 GPT 发送一条消息，确认 GPT 能正常回复。

以上全部通过，就说明双向任务交接已经跑通。

## 日常应该怎么用？

以后只需要记住下面两条：

- **GPT → DeepSeek：**关闭 Codex，点击 `DeepSeek交接`。
- **DeepSeek → GPT：**关闭 Codex，点击 `任务交接GPT`。

不要在刚用完 DeepSeek 后直接点击任务栏里的官方 Codex 图标。那样会绕过交接
步骤，刚产生的 DeepSeek 内容可能暂时没有出现在 GPT 任务中。

## 为什么点击快捷方式后没有立刻出现 Codex？

这是正常设计，不代表快捷方式坏了。

工具必须先完成：

1. 查找需要交接的任务；
2. 检查是否已经交接过，防止重复任务；
3. 备份必要数据；
4. 转换不兼容的记录；
5. 验证交接结果；
6. 最后才打开 Codex。

任务越多，等待时间可能越长。交接期间再次点击快捷方式不会让它更快，也可能让
你误以为程序没有反应，所以请耐心等待第一次点击的结果。

## 常见问题

### 1. 安装器提示找不到 `models-deepseek.json`

说明 DeepSeek 官方基础配置还没有成功完成，或者官方模型目录不在预期位置。

处理方法：

1. 重新运行本文“先完成 DeepSeek 官方接入”中的官方脚本。
2. 确认 DeepSeek 能独立打开 Codex 并正常回复。
3. 完全关闭 Codex。
4. 再运行本项目安装器。

不要自己创建一个空的 `models-deepseek.json`，空文件不能代替官方模型目录。

### 2. 点击快捷方式后很久没有窗口

先不要连续点击。等待任务交接完成。如果出现错误弹窗，请记录：

- 弹窗里的完整文字；
- 弹窗提供的报告路径；
- 当前是从 GPT 切换到 DeepSeek，还是从 DeepSeek 切回 GPT。

详细排查方法见 [故障排查文档](docs/troubleshooting.md)。

### 3. 任务出现在“最近”里，没有自动置顶

只要任务能够打开、消息完整并且可以继续回复，就说明交接成功。是否置顶属于
Codex 界面状态，不影响任务上下文。需要时可以手动置顶。

### 4. 出现两个相同名字的旧任务

早期测试或失败交接可能留下旧任务。不要只根据名字判断；先打开并确认哪一个是
最新、可以继续回复的任务。不要直接修改 Codex 数据库或 rollout 文件。

### 5. GPT 报 `Invalid input[*].content ... maximum length 0`

这通常说明旧的 DeepSeek 推理记录没有完成兼容处理。当前版本会在
DeepSeek → GPT 交接时清理新目标中的不兼容 `content`。请保留错误报告和备份，
不要手动删除源任务记录。详见 [故障排查文档](docs/troubleshooting.md)。

### 6. 使用 DeepSeek 联网搜索后，切回 GPT 报错

DeepSeek 与 GPT 的联网搜索记录 ID 格式可能不同。本项目会在交回 GPT 时同步
调整检索调用和结果之间的关联 ID；发现冲突时会停止并报告，而不是删除记录。

### 7. DeepSeek 能回复，但看不懂图片

任务交接工具只负责保存和转换任务上下文，不会给模型增加视觉能力。能否看图取决于
你选择的 DeepSeek 模型及其接口能力。

## 如何卸载？

卸载前先完全关闭 Codex。

打开 PowerShell 7，先执行预览命令：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass `
  -File "$env:USERPROFILE\.codex\model-switcher\uninstall.ps1" `
  -WhatIf
```

确认预览没有异常后，正式卸载：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass `
  -File "$env:USERPROFILE\.codex\model-switcher\uninstall.ps1"
```

默认卸载只移除本项目安装的受管配置、两个快捷方式和程序文件。以下内容会保留：

- DeepSeek 官方模型目录；
- 已加密保存的 API key；
- 任务交接 manifest；
- 交接报告和备份。

## 默认设置

- DeepSeek 默认思考强度：`max`
- DeepSeek 默认联网搜索：`live`
- OpenAI/GPT：尽量保留任务原来使用的 GPT 模型

如果以后更换 DeepSeek 模型，新模型必须先由官方目录声明，并且支持 Codex 所需的
Responses API。普通用户不需要手动修改 `config.toml`。

## 隐私与安全边界

本项目在你的电脑本地调用 Codex 自带的 `app-server`：

- 不运营聊天中转服务器；
- 不把聊天记录上传到本项目作者的服务器；
- 不把 API key 写入 Git；
- 不直接修改 `state_5.sqlite`、`session_index.jsonl` 或源 rollout；
- 写入前生成 dry-run 报告和时间戳备份；
- 发现当前 Codex 协议不兼容时停止，而不是猜测字段继续操作；
- 使用交接 manifest 防止同一个任务被重复复制；
- 使用每用户锁防止重复点击造成多个交接程序同时运行。

详细说明见 [安全边界文档](docs/safety.md)。

## 给开发者的内容

如果你只想安装和使用，到这里就可以停止阅读。下面内容面向准备检查代码、调试协议
或参与开发的人。

### 本地测试

在项目根目录执行：

```powershell
npm test
pwsh -NoProfile -File ".\scripts\check-powershell.ps1"
```

### 协议检查与 dry-run

```powershell
npm run schema-check
npm run dry-run:deepseek
npm run dry-run:openai
```

`schema-check` 只检查或缓存 Codex app-server 协议，不启动模型回合。dry-run 只
生成报告；第一次修改迁移逻辑时，应先用单个任务验收，再扩大范围。

### 修改默认模型

提供商默认设置位于：

[work/thread-localizer/data/handoff-settings.json](work/thread-localizer/data/handoff-settings.json)

- OpenAI 使用 `preserve-existing`，尽量回到任务此前使用的 GPT 模型。
- DeepSeek 使用 `global`，修改 `activeModel` 后，下一次交接使用新模型。
- DeepSeek 模型 slug 必须存在于本机官方 `models-deepseek.json` 中。

### 进一步阅读

- [架构说明](docs/architecture.md)
- [兼容性矩阵](docs/compatibility.md)
- [故障排查](docs/troubleshooting.md)
- [安全边界](docs/safety.md)
- [命令行与协议细节](work/thread-localizer/README.md)
- [English README](README.en.md)

## 开源许可

本项目采用 [MIT License](LICENSE)。

DeepSeek 官方模型目录和品牌图标不会随本仓库重新分发；安装器复用用户本机已经
完成的官方配置。请不要把个人图标、API key、Codex 数据库、任务报告或聊天记录
提交到公开仓库。
