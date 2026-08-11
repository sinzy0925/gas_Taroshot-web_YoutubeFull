# 画像→Gemini API→JSON（GAS）セットアップ

**このアプリを入れているスライド**: プレゼンテーション ID `1UP2Uclvs7hEkWNWqTzyBGWQxIKwfeiiLNUAt_wAsy9o`  
（スライドの「拡張機能」→「Apps Script」で開いたプロジェクトに、以下 4 ファイルを入れる）  
**Gemini 2.5 Pro Preview / 3.1 Pro Preview 想定。全画像を 1 リクエストで送り、ナレーション専用 JSON を生成する。**

---

## clasp でローカルの .gs を GAS エディタに送る

1. **clasp を入れる**  
   `npm install -g @google/clasp`
2. **Script ID を用意する**  
   スライド → 拡張機能 → Apps Script で開いた画面の URL の  
   `https://script.google.com/home/projects/【ここが Script ID】/edit` の「ここが Script ID」をコピーする。  
   または GAS エディタで **プロジェクトの設定** を開き、「スクリプト ID」をコピーする。
3. **.clasp.json に Script ID を書く**  
   リポジトリ直下の `.clasp.json` の `"scriptId": "YOUR_SCRIPT_ID"` の `YOUR_SCRIPT_ID` を、コピーした Script ID に書き換える。
4. **ログイン**  
   `clasp login`（ブラウザで Google ログイン）
5. **送る**  
   リポジトリ直下で `clasp push` を実行する。  
   `src/` 以下の `*.gs` と `Upload.html`、`appsscript.json` が GAS プロジェクトに送られる。
6. **引き寄せる（任意）**  
   GAS 側を別で編集したあと、ローカルに反映したいときは `clasp pull`。

※ `.clasp.json` の `rootDir` が `./src` なので、送られるのは `src/` 内のファイルだけです。`README_GAS.md` などは `.claspignore` で除外しています。

---

## clasp push のあとの手順（次にやること）

1. **GAS エディタを開く**  
   スライドを開く → **拡張機能** → **Apps Script**。push したファイル（Code.gs, Config.gs, DriveHelper.gs, Gemini.gs, Upload.html）が並んでいることを確認する。

2. **スクリプト プロパティを設定する**  
   左の **プロジェクトの設定**（歯車アイコン）→ **スクリプト プロパティ** → **プロパティを追加** で、次の 3 つを追加する。

   | プロパティ | 値 |
   |------------|-----|
   | `GEMINI_API_KEY` | Gemini の API キー（[Google AI Studio](https://aistudio.google.com/) で取得） |
   | `IMAGE_FOLDER_ID` | 画像を入れる Drive フォルダの ID（フォルダを開いたときの URL の `folders/` の後ろ） |
   | `OUTPUT_FOLDER_ID` | JSON を保存する Drive フォルダの ID |

   （任意）`GEMINI_MODEL` を設定すると既定の `gemini-3.5-flash-lite` を上書きできます（例: `gemini-3.5-flash`）。

3. **動作確認（画像→JSON）**  
   - 画像フォルダに **1.png, 2.png** など（PNG/JPEG、ファイル名昇順）を入れておく。  
   - GAS エディタで **Code.gs** を開き、関数で **runImageToJson** を選んで **実行**。  
   - **実行ログ**（表示 → ログ）で「完了。スライド N 件。保存先: https://...」が出れば OK。

4. **（任意）トリガーを設定する**  
   **トリガー**（左の時計アイコン）→ **トリガーを追加** → 実行する関数 **runImageToJson**、イベント **時間主導型** で希望のスケジュールを選ぶ。

5. **（任意）画像アップロード用 Web アプリを出す**  
   **デプロイ** → **新しいデプロイ** → 種類 **ウェブアプリ** → 実行ユーザー「自分」、アクセス「全員」→ **デプロイ**。表示された URL を開くと Upload.html の画面になり、ブラウザから画像をアップロードできる。

---

## 出力 JSON（YouTube ナレーション専用）

`runImageToJson` の結果は **ナレーション専用** です。Google Vids など動画用にそのまま使えます。

```json
{
  "version": 1,
  "slides": [
    { "slideNo": 1, "narration": "この画面では…。まず…してください。" },
    { "slideNo": 2, "narration": "…" }
  ]
}
```

- 各スライドは `slideNo` と `narration` のみ。title / steps / notes 等は出力しません。

---

## ファイル

- **Config.gs** - 定数・既定値（Gemini モデル名など）
- **DriveHelper.gs** - 画像フォルダ取得、base64 取得、JSON 保存
- **Gemini.gs** - ナレーション専用プロンプト、Gemini API（REST）呼び出し、パース・リトライ
- **SlidesHelper.gs** - ナレーション JSON から新規スライド作成、スピーカーノート（Google Vids 読み上げ用）に反映
- **Code.gs** - `runImageToJson`（トリガー用）、`doGet`（Web アプリ）、`saveImageToFolder`（アップロード用）
- **Upload.html** - 画像アップロード用の Web 画面（Google のツールでブラウザからアップロード）

## 手順（スライド ID `1UP2Uclvs7hEkWNWqTzyBGWQxIKwfeiiLNUAt_wAsy9o` にアプリを入れる場合）

1. そのスライドを開く → **拡張機能** → **Apps Script** で、スライドに紐づいた GAS プロジェクトを開く。
2. 左側のファイル一覧で、既定の `Code.gs` だけ残すか、すべて削除してから次のファイルを **追加** する。
   - **Config.gs** … このリポジトリの `src/Config.gs` の内容を貼り付け
   - **DriveHelper.gs** … `src/DriveHelper.gs` の内容を貼り付け
   - **Gemini.gs** … `src/Gemini.gs` の内容を貼り付け
   - **SlidesHelper.gs** … `src/SlidesHelper.gs` の内容を貼り付け
   - **Code.gs** … `src/Code.gs` の内容で上書き（または新規作成して貼り付け）
   - **Upload.html** … 左の **＋** → **HTML** で「Upload」という名前の HTML を追加し、`src/Upload.html` の内容を貼り付け
3. 以降、下記「スクリプト プロパティ」「トリガー」を設定する。

4. **プロジェクトの設定** → **スクリプト プロパティ** で次を追加する。

   | プロパティ | 値 |
   |------------|-----|
   | `GEMINI_API_KEY` | （Gemini の API キー。[Google AI Studio](https://aistudio.google.com/) で取得） |
   | `IMAGE_FOLDER_ID` | 画像を置く Drive フォルダの ID（1.png, 2.png ... を名前昇順で置く） |
   | `OUTPUT_FOLDER_ID` | JSON を保存する Drive フォルダの ID |

   任意で変更する場合のみ:

   | プロパティ | 値（例） |
   |------------|----------|
   | `GEMINI_MODEL` | `gemini-3.5-flash-lite`（AI Studio で利用中のモデル ID に合わせて変更可） |

4. **トリガー** を設定する。
   - **トリガー** → **トリガーを追加**
   - 実行する関数: **runImageToJson**
   - イベントのソース: **時間主導型**（例: 日付ベースのタイマー、1 日 1 回など）

5. 画像の入れ方（どちらか）:
   - **Google のツールでアップロード**: Web アプリをデプロイして URL を開く（下記「画像アップロード用 Web アプリ」参照）。ブラウザでファイルを選んで「画像フォルダへアップロード」を押すと、Script Properties で指定した画像フォルダに保存される。
   - **Drive で直接**: 画像フォルダに **1.png, 2.png, ...**（PNG または JPEG、ファイル名昇順）をドラッグ＆ドロップや「アップロード」で入れる。
6. トリガーまたは手動で `runImageToJson` を実行する。実行後は **実行ログ** で進捗と保存先リンクを確認できる。

### 画像アップロード用 Web アプリ（Google のツールでアップロード）

1. GAS エディタで **デプロイ** → **新しいデプロイ** → 種類で **ウェブアプリ** を選択。
2. **説明**（任意）、**実行ユーザー** を「自分」に、**アクセス** を「全員」または「組織内」に設定して **デプロイ**。
3. 表示された **ウェブアプリの URL** を開くと、画像アップロード画面が表示される。ファイルを選んで「画像フォルダへアップロード」を押すと、Script Properties の `IMAGE_FOLDER_ID` で指定したフォルダに保存される。
4. 事前に Script Properties で **IMAGE_FOLDER_ID** を設定しておくこと。未設定の場合はエラーメッセージが表示される。

## 注意

- 画像は **全枚数を 1 リクエスト** で Gemini に送る。枚数が多いとリクエストサイズ制限に当たる場合があるので、その場合は画像を圧縮するか枚数を減らす。
- 画像枚数の上限はアプリ側では設けない（ただし Gemini の入力サイズ制限に当たる場合がある）。
- API キーはログ・エラーメッセージに出力しない。
