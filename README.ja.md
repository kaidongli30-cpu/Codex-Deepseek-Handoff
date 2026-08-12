# Codex-DeepSeek-Handoff

<p align="center"><a href="README.md">简体中文</a> | <a href="README.en.md">English</a> | <b>日本語</b></p>

Codex デスクトップアプリで、GPT と DeepSeek が同じタスクを続けて使えるようにするローカルツールです。

> このツールは現在 Windows のみ対応しています。コマンドラインを使うのが初めてでも大丈夫です。
> このガイドは「プロジェクトのダウンロード方法」から順番に説明します。

## このプロジェクトが解決する問題

DeepSeek 公式の連携で Codex で DeepSeek を使えるようになりますが、設定を切り替えると次のような問題がよく起きます:

- GPT モードで見えていたタスクが DeepSeek モードで表示されない
- DeepSeek の新しい返信を GPT に戻してから続きができない
- DeepSeek の推論記録や Web 検索記録が原因で GPT がフォーマットエラーを報告する

このプロジェクトは GPT と DeepSeek の間にローカルの「引き継ぎ（ハンドオフ）」層を追加します。流れは次のとおりです:

```text
GPT で作業する
    ↓
Codex を完全に閉じる
    ↓
デスクトップの「DeepSeek交接」をクリック
    ↓
タスクを引き継いでから、DeepSeek モードの Codex を開く
    ↓
DeepSeek で元のタスクを続ける
    ↓
Codex を完全に閉じる
    ↓
デスクトップの「任务交接GPT」をクリック
    ↓
整理と引き継ぎを行ってから、GPT モードの Codex を開く
```

両側は同じ作業のリレー版を見ることになります。DeepSeek の返信は GPT に戻せますし、GPT の新しい返信も DeepSeek に引き継げます。

## 始める前に知っておくべき3つのこと

1. **このプロジェクトは Codex ではありませんし、DeepSeek API key を提供するものでもありません。** Codex のインストールと、自分自身の DeepSeek 公式 API key が必要です。
2. **切り替える前に Codex を完全に閉じてください。** GPT モードと DeepSeek モードを同時に実行しないでください。
3. **引き継ぎ中はショートカットを1回だけクリックしてください。** 履歴が多いと時間がかかることがあります。引き継ぎが完了してから Codex が開きます。

## インストール前の準備

### 1. Windows を使っていることを確認する

対応:

- Windows 10
- Windows 11

macOS と Linux は現在このプロジェクトで検証していません。

### 2. Codex が正常に開けることを確認する

いつもの方法で Codex を開き、ChatGPT/OpenAI にログインできて、既存タスクを開けることを確認します。確認したら Codex を完全に閉じます。

Codex がまだインストールされていない場合は、[OpenAI 公式ページ](https://developers.openai.com/) からインストールとログインを済ませてから戻ってきてください。

### 3. PowerShell 7 をインストールする

PowerShell は、以下のインストールコマンドを貼り付けて実行するためのウィンドウです。Windows 標準の古いものは「Windows PowerShell」と呼ばれます。このプロジェクトでは **PowerShell 7** を推奨します。

Windows のスタートメニューから `PowerShell 7` を検索して開きます。ウィンドウに次のコマンドをコピーして Enter を押します:

```powershell
$PSVersionTable.PSVersion
```

最初の行のメジャーバージョンが `7` ならこの条件は満たされています。

PowerShell 7 が見つからない場合は、Microsoft 公式の手順に従ってください:

- [Microsoft: Windows への PowerShell 7 のインストール](https://learn.microsoft.com/powershell/scripting/install/install-powershell-on-windows)

Windows 11 ではターミナルで次のコマンドも実行できます:

```powershell
winget install --id Microsoft.PowerShell --source winget
```

インストール後、古いウィンドウを閉じて `PowerShell 7` を開き直します。

### 4. Node.js をインストールする

PowerShell 7 で実行:

```powershell
node --version
```

`v20...`、`v22...`、`v24...` のようなバージョンが表示されればインストール済みです。

`node` が認識されない場合は、Node.js 公式サイトから **LTS（長期サポート版）** をダウンロードします:

- [Node.js 公式ダウンロードページ](https://nodejs.org/en/download)

インストールは既定のオプションのままで構いません。インストール後、PowerShell 7 を開き直して `node --version` を再度実行します。

### 5. DeepSeek API key を準備する

自分自身の DeepSeek 公式 API key が必要です。API key を人に教えたり、このプロジェクトのファイルに書き込んだり、GitHub にコミットしたりしないでください。DeepSeek 公式ドキュメント:

- [DeepSeek API 公式ドキュメント](https://api-docs.deepseek.com/api/deepseek-api/)

すでに DeepSeek 公式の方法で Codex を開ける場合は、次のセクションに進んでください。

## このプロジェクトをダウンロードする

### 方法 A: ZIP をダウンロード（初心者向け）

1. このプロジェクトの GitHub ページを開く
2. 上部の緑色の `Code` ボタンをクリック
3. `Download ZIP` をクリック
4. ダウンロード後、エクスプローラーで ZIP ファイルを探す
5. ZIP を右クリックして「すべて展開」を選ぶ
6. 展開されたフォルダーを開く

次のものが一度にすべて見えるまでフォルダーを開いて進めてください:

```text
README.md
package.json
work フォルダー
scripts フォルダー
```

これらが見えたら、正しい「プロジェクトのルート」にいます。

### 正しいフォルダーで PowerShell 7 を開く

1. プロジェクトルートのウィンドウを開いたままにする
2. エクスプローラー上部のアドレスバーをクリック
3. アドレスバーの既存テキストを削除
4. `pwsh` と入力
5. Enter を押す

PowerShell 7 が正しいプロジェクトフォルダーで開きます。

次のコマンドで確認:

```powershell
Test-Path ".\work\thread-localizer\launcher\install.ps1"
```

出力:

```text
True
```

これなら場所は正しいです。`False` と表示されたら、PowerShell を閉じて、`README.md`、`package.json`、`work` が本当に入っているフォルダーまでエクスプローラーで進み、再度 `pwsh` と入力してください。

## 初回インストール

### 手順 1: まず DeepSeek 公式の設定を完了する

このプロジェクトは DeepSeek 公式モデルカタログを再配布しないため、先に DeepSeek 公式の Codex 設定スクリプトを実行する必要があります。

先ほど開いた PowerShell 7 で、次のブロックをまとめてコピーして Enter を押します:

```powershell
$officialSetup = Join-Path $env:TEMP 'codex-deepseek-setup-en.ps1'
Invoke-WebRequest `
  -Uri 'https://cdn.deepseek.com/api-docs/codex-deepseek-setup-en.ps1' `
  -OutFile $officialSetup
notepad $officialSetup
```

メモ帳でダウンロードした公式スクリプトが開きます。ダウンロード元が `cdn.deepseek.com` であることを確認し、メモ帳を閉じて、PowerShell 7 で実行:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File $officialSetup
```

公式スクリプトの案内に従って DeepSeek API key を設定します。

完了後:

1. PowerShell と Codex を完全に閉じる
2. DeepSeek 公式スクリプトが作成した方法で Codex を一度開く
3. DeepSeek がテストメッセージに正常に返信することを確認
4. もう一度 Codex を完全に閉じる

DeepSeek 自体がまだ正常に返信できない場合は、このプロジェクトをインストールしないでください。公式の基本設定が成功して初めて、引き継ぎ層が正常に動作します。

### 手順 2: インストーラーが行う操作をプレビューする

プロジェクトルートに戻り、前述の方法でアドレスバーに `pwsh` と入力して PowerShell 7 を開きます。

次のブロックをコピーして Enter:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass `
  -File ".\work\thread-localizer\launcher\install.ps1" `
  -SourceRoot "$PWD" `
  -WhatIf
```

`-WhatIf` は「プレビューのみで、実際には変更しない」という意味です。`What if:` の行が複数表示され、最後に次のように表示されます:

```text
"whatIf": true
```

この手順ではタスクを移行せず、Codex を起動せず、モデルリクエストも送信しません。

ここで赤いエラーが出た場合は、後述の「よくある質問」を先に確認してください。実際のインストールコマンドを繰り返し実行しないでください。

### 手順 3: インストール

プレビューでエラーがなければ、同じ PowerShell 7 ウィンドウで次を実行します。`-WhatIf` がないだけの同じコマンドです:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass `
  -File ".\work\thread-localizer\launcher\install.ps1" `
  -SourceRoot "$PWD"
```

インストーラーは次のことを行います:

- Codex の関連設定をバックアップ
- 新しい設定を現在の Codex が読めるか検証
- 引き継ぎツールをインストール
- デスクトップに2つのショートカットを作成

Codex のタスクデータベースを直接変更したり、元のタスクを削除したり、自動でメッセージを送信したりはしません。

### 手順 4: デスクトップのショートカットを確認する

インストールが成功すると、デスクトップに次の2つが表示されます:

```text
DeepSeek交接
任务交接GPT
```

それぞれの役割:

| ショートカット | いつクリックするか | 何をするか |
| --- | --- | --- |
| `DeepSeek交接` | GPT を使っていて DeepSeek に切り替えたいとき | GPT のタスクを DeepSeek に引き継いでから Codex を開く |
| `任务交接GPT` | DeepSeek を使っていて GPT に戻りたいとき | DeepSeek のタスクを整理して GPT に引き継いでから Codex を開く |

## 初めての引き継ぎ

最初は重要でないテストタスクで動作確認することをおすすめします。

### GPT から DeepSeek へ切り替える

1. 通常の GPT ログイン方法で Codex を開く
2. テストタスクを新規作成し、分かりやすいメッセージを送る。例:

   ```text
   これはGPTとDeepSeekの引き継ぎテストです。
   ```

3. GPT の返信が完了するまで待つ
4. Codex を完全に閉じる
5. 数秒待って、Codex のウィンドウが完全に消えたことを確認
6. デスクトップの `DeepSeek交接` をダブルクリック
7. **1回だけクリックして待つ**
8. 引き継ぎが完了すると、Codex が DeepSeek 設定で自動的に開く
9. 「最近」または対応するプロジェクトでテストタスクを探す
10. GPT のテストメッセージと返信が見えることを確認
11. 同じタスクで DeepSeek にもう一度返信させる

### DeepSeek から GPT へ戻る

1. DeepSeek の返信が完全に終わるまで待つ
2. Codex を完全に閉じる
3. 数秒待つ
4. デスクトップの `任务交接GPT` をダブルクリック
5. **1回だけクリックして待つ**
6. ツールがまず、GPT と互換性のない推論記録と Web 検索記録を処理する
7. 完了すると Codex が GPT ログイン設定に戻る
8. テストタスクを開く
9. DeepSeek が送信した内容が見えることを確認
10. GPT にもう一度メッセージを送り、正常に返信することを確認

すべて成功すれば、双方向の引き継ぎが動作しています。

## 日常的な使い方

これからは次の2つだけ覚えておけばよいです:

- **GPT → DeepSeek:** Codex を閉じて `DeepSeek交接` をクリック
- **DeepSeek → GPT:** Codex を閉じて `任务交接GPT` をクリック

DeepSeek を使った直後に、タスクバーの公式 Codex アイコンをクリックしないでください。引き継ぎ手順をスキップすることになり、新しい DeepSeek の内容が GPT のタスクにまだ表示されない可能性があります。

## ショートカットをクリックしても Codex がすぐに表示されないのはなぜ？

これは設計どおりの動作で、ショートカットが壊れているわけではありません。

ツールはまず次のことを行います:

1. 引き継ぎが必要なタスクを探す
2. すでに引き継がれていないか確認し、重複を防ぐ
3. 必要なデータをバックアップ
4. 互換性のないレコードを変換
5. 引き継ぎ結果を検証
6. その後で Codex を開く

タスクが多いほど待ち時間は長くなります。もう一度クリックしても速くはならず、プログラムが反応しないと誤解する原因になるので、最初のクリックの結果を待ってください。

## よくある質問

### 1. インストーラーが `models-deepseek.json` が見つからないと表示する

DeepSeek 公式の基本設定がまだ成功していないか、公式モデルカタログが想定された場所にありません。

対処方法:

1. 「手順 1: まず DeepSeek 公式の設定を完了する」の公式スクリプトを再実行
2. DeepSeek が単独で Codex を開いて正常に返信することを確認
3. Codex を完全に閉じる
4. このプロジェクトのインストーラーを再実行

空の `models-deepseek.json` を自分で作成しないでください。空ファイルは公式モデルカタログの代わりにはなりません。

### 2. ショートカットをクリックしても長時間ウィンドウが表示されない

連続クリックしないでください。引き継ぎが完了するのを待ちます。エラーダイアログが出た場合は、次の内容を記録してください:

- ダイアログの全文
- ダイアログが示すレポートパス
- GPT → DeepSeek の切り替えだったか、DeepSeek → GPT の切り替えだったか

詳しくは [トラブルシューティング](docs/troubleshooting.md) を参照してください。

### 3. タスクが「最近」に表示されるがピン留めされていない

タスクが開けて、メッセージが揃っていて、返信を続けられるなら、引き継ぎは成功しています。ピン留めは Codex の UI 状態であり、タスクのコンテキストには影響しません。必要なら手動でピン留めしてください。

### 4. 同じ名前の古いタスクが2つある

初期のテストや失敗した引き継ぎによって古いタスクが残ることがあります。名前だけで判断せず、開いてどちらが最新で返信を続けられるかを確認してください。Codex のデータベースや rollout ファイルを直接変更しないでください。

### 5. GPT が `Invalid input[*].content ... maximum length 0` を報告する

これは通常、古い DeepSeek 推論レコードが変換されていないことを意味します。現在のバージョンは DeepSeek → GPT の引き継ぎ時に、新しいターゲットの互換性のない `content` をクリーンアップします。エラーレポートとバックアップは保持し、ソースタスクのレコードを手動で削除しないでください。詳しくは [トラブルシューティング](docs/troubleshooting.md) を参照してください。

### 6. DeepSeek の Web 検索後に GPT へ戻すとエラーになる

DeepSeek と GPT では Web 検索レコードの ID 形式が異なる場合があります。このプロジェクトは GPT へ戻すときに検索呼び出しと結果の関連 ID を同期させます。衝突を見つけた場合はレコードを削除せず、停止して報告します。

### 7. DeepSeek は返信できるが画像を理解できない

引き継ぎツールはタスクコンテキストの保存と変換だけを行い、モデルに画像認識能力を追加するものではありません。画像が使えるかどうかは選択した DeepSeek モデルと API の機能次第です。

## アンインストール方法

アンインストール前に Codex を完全に閉じます。

PowerShell 7 を開き、まずプレビューコマンドを実行:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass `
  -File "$env:USERPROFILE\.codex\model-switcher\uninstall.ps1" `
  -WhatIf
```

プレビューに問題がなければ、正式にアンインストール:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass `
  -File "$env:USERPROFILE\.codex\model-switcher\uninstall.ps1"
```

既定では、このプロジェクトがインストールした管理設定、2つのショートカット、プログラムファイルだけを削除します。次のものは保持されます:

- DeepSeek 公式モデルカタログ
- 暗号化して保存された API key
- 引き継ぎマニフェスト
- 引き継ぎレポートとバックアップ

## 既定の設定

- DeepSeek の推論強度: `max`
- DeepSeek の Web 検索: `live`
- OpenAI/GPT: 可能な場合はタスクが以前使っていた GPT モデルを維持

今後 DeepSeek モデルを変更する場合、新しいモデルは公式カタログに宣言され、Codex が必要とする Responses API をサポートしている必要があります。一般ユーザーが `config.toml` を手動で編集する必要はありません。

## プライバシーと安全

このプロジェクトは、お使いの PC にある Codex の `app-server` をローカルで呼び出します:

- チャット中継サーバーは運営しない
- チャット履歴をこのプロジェクト作者のサーバーにアップロードしない
- API key を Git に書き込まない
- `state_5.sqlite`、`session_index.jsonl`、ソース rollout を直接変更しない
- 書き込み前に dry-run レポートとタイムスタンプ付きバックアップを生成
- 現在の Codex プロトコルと互換性がない場合は、推測して続行せず停止
- 引き継ぎマニフェストで同じタスクが二重コピーされるのを防ぐ
- ユーザーごとのロックで、連続クリックによる複数同時実行を防ぐ

詳しくは [安全ドキュメント](docs/safety.md) を参照してください。

## 開発者向け

インストールして使うだけならここで読み終えてください。以下はコードを確認したり、プロトコルをデバッグしたり、開発に参加したりする人向けです。

### ローカルテスト

プロジェクトルートで実行:

```powershell
npm test
pwsh -NoProfile -File ".\scripts\check-powershell.ps1"
```

### プロトコル確認と dry-run

```powershell
npm run schema-check
npm run dry-run:deepseek
npm run dry-run:openai
```

`schema-check` は Codex app-server プロトコルを確認・キャッシュするだけで、モデルターンを開始しません。dry-run はレポートを生成するだけです。移行ロジックを初めて変更するときは、範囲を広げる前に1つのタスクで検証してください。

### 既定モデルの変更

プロバイダー既定設定は次にあります:

[work/thread-localizer/data/handoff-settings.json](work/thread-localizer/data/handoff-settings.json)

- OpenAI は `preserve-existing` を使い、タスクが以前使っていた GPT モデルに戻す
- DeepSeek の既定値は `deepseek-v4-pro + max`。DeepSeek モードで Codex を開いている間は、Codex 標準のモデルメニューから現在のタスクを V4 Pro/V4 Flash と Low/High/Max の間で切り替えられる
- 引き継ぎツールはタスクごとに最後に使用した DeepSeek モデルと思考強度を記憶し、GPT から戻るときに復元する。DeepSeek を一度も使用していないタスクだけが既定値を使う
- DeepSeek のモデル slug はローカルの公式 `models-deepseek.json` に存在する必要がある

### 関連ドキュメント

- [アーキテクチャ](docs/architecture.md)
- [互換性マトリックス](docs/compatibility.md)
- [トラブルシューティング](docs/troubleshooting.md)
- [安全](docs/safety.md)
- [CLI とプロトコルの詳細](work/thread-localizer/README.md)
- [中文 README](README.md)
- [English README](README.en.md)

## ライセンス

このプロジェクトは [MIT License](LICENSE) です。

DeepSeek 公式モデルカタログとブランドアイコンはこのリポジトリで再配布しません。インストーラーはユーザー PC にある公式設定を再利用します。個人のアイコン、API key、Codex データベース、タスクレポート、チャット履歴を公開リポジトリにコミットしないでください。
