# 以下のアプリを作ることができるか教えて　これは実装準備です。　まだ実装しない


マニュアルを作るアプリを作る

Gemini-APIとGASで作るとする。

**Gemini API**: 必ず最新の API（エンドポイント・モデル）を使用すること。実装時および運用中の更新時も、利用可能な最新版に合わせる。モデルは **Gemini 3.1 Pro Preview** を **思考モード（thinking mode）** で使用する。

**AIの選択（コストを気にする場合）**: お金を気にするなら、AI を **Groq**（Llama 4 Scout 等のビジョン対応モデル）に統一する選択肢がある。説明文生成（画像→JSON）も、表題・目次・ワークフロー・FAQ 付与（JSON→JSON）も、Groq API だけで実装可能。思考モードは使えないが、GAS から UrlFetchApp で Groq の OpenAI 互換エンドポイントを呼べばよい。1枚500KB程度の画像・5枚/リクエスト・JSON mode 対応済みなので、本仕様のプロンプトで処理できる。

**Groq で画像→説明を並列実行する場合**: Groq の公式 Rate Limits（[GroqDocs](https://console.groq.com/docs/rate-limits)）では、**同時接続数（concurrency）の上限は明示されていない**。制限は **RPM（Requests Per Minute）** と **TPM（Tokens Per Minute）** で、Llama 4 Scout（`meta-llama/llama-4-scout-17b-16e-instruct`）の Developer プランでは **RPM=30**、RPD=1,000、TPM=30,000、TPD=500,000。つまり「1分あたり最大30リクエスト」まで。同じ1分以内に送れるリクエストは最大30本なので、**画像を読んで説明を返す API 呼び出しは、最大で 30 並列まで**（30 バッチを同時に投げるとその分で RPM を消費）。本仕様の「5枚で1回」なら、20枚＝4リクエストなので 4 並列で余裕。画像が多くても、バッチ数が 30 以下ならその数だけ並列可能。Enterprise や Flex ではより高い制限が用意されている場合あり。

**Groq の 1 本の API キーで並列度を上げる場合**: 公式には「同時接続数」の上限は記載されていない。実質の上限は **RPM**。同一キーで **RPM を超えない範囲**（例: Llama 4 Scout なら 30）まで同時に送ってよい。30 を超えて同時に送ると 429 が返り、`retry-after` で待つ必要がある。**TPM** も別枠で存在するため、並列で重いリクエスト（画像多数など）を送ると TPM に先に当たる場合がある。並列度は **RPM 以下**に抑える設計とする。同一組織のキーはクォータを共有するため、複数クライアントで同じキーを使う場合も RPM/TPM は合算される。

**Groq 無料枠（Free tier）**: クレジットカード不要の **Free tier でも利用可能**。公式には「Free tier の制限は Developer より低い」とされ、モデルごとの RPM/RPD/TPM/TPD は [Limits ページ](https://console.groq.com/settings/limits) で確認する必要がある。Llama 4 Scout も Free で使える場合が多く、本仕様程度（例: 20枚＝4リクエスト）なら無料枠内で収まる想定。並列を多くかけたり、1日あたりの利用回数が多い場合は RPD や TPM で足りなくなる可能性があるため、実運用前にコンソールで上限を確認すること。

**API キーをユーザーが自分で取得して Web に入れる場合**: API キーをユーザー各自が取得し、画面で入力してもらう運用にすると、利用はそのユーザーの Groq（または Gemini）アカウントに紐づく。レート制限はキー（アカウント）ごとなので、他人の利用で自分の枠が減ることはなく、1ユーザーあたり「20枚＝4リクエスト」程度なら無料枠でも余裕で収まる。サーバー側で1本のキーを共有するより、ユーザー持ちキーにした方が制限に余裕ができて安定して動く。

**API キー入力まわりのセキュリティ（厳格に作る）**: API キーは秘密情報のため、入力画面と扱いを厳格にする。
- **入力画面**: HTTPS 必須。入力欄はマスク表示（type=password または同等）。API キーを URL・クエリパラメータ・Referer に含めない。第三者スクリプト（分析タグなど）がフォーム周辺を取得しないよう配慮する。
- **保持・送信**: サーバー（GAS 等）に送る場合は、メモリ上または Script Properties 等の安全な保管に留め、**ログ・エラーメッセージ・レスポンス本文にキーを出力しない**。クライアントで API を呼ぶ場合は、キーをサーバーに送らずセッション・メモリ内に留め、用が済んだら破棄する設計を検討する。
- **保存方針**: キーを永続保存する場合は「ユーザーごと・暗号化」等の要件を決める。保存しない（毎回入力）なら漏洩リスクはその分減る。
- **ブラウザのDB（localStorage / sessionStorage / IndexedDB）に保存する場合**: XSS・同一オリジンの他ページ・拡張機能・端末の物理アクセスやマルウェアなどで漏洩の可能性がある。預かった秘密を守る責任が発生する。
- **責任回避したい場合**: API キーを**保存しない**（毎回入力）を採用する。キーを預からないので漏れても「預かっていない」と言いやすく、利用者自身の管理責任に寄せられる。保存する設計だと漏れたときに「保存していた」ことが問題にされやすい。責任を極力取りたくないなら「保存しない」一択とする。
- 実装時は上記を満たし、必要に応じてセキュリティチェックリストを別途用意する。

---

## マニュアル作成（画像を見せて文章を考えてもらう）の無料枠比較: Gemini API vs Groq

いずれも無料で使える範囲での目安。公式の最新数値は各コンソール（[Gemini Rate Limits](https://ai.google.dev/gemini-api/docs/rate-limits) / [Groq Limits](https://console.groq.com/settings/limits)）で要確認。

| 項目 | Gemini API（無料枠） | Groq（無料枠・オープンソースLLM） |
|------|----------------------|-----------------------------------|
| **主なモデル** | Gemini 2.5 Pro / Flash / Flash-Lite など | Llama 4 Scout 17B（ビジョン対応） |
| **画像入力** | 対応。画像はトークンとしてカウント。複数枚可（コンテキスト内）。 | 対応。1リクエスト最大 **5枚**。1枚あたり 20MB(URL) または リクエスト合計 4MB(base64)。 |
| **RPM（1分あたりリクエスト）** | Pro: **5** / Flash: **10** / Flash-Lite: **15**（2025年頃の無料枠。引き下げあり） | **30** 前後（Llama 4 Scout。アカウントにより異なる） |
| **RPD（1日あたりリクエスト）** | Pro: **100** / Flash: **250** / Flash-Lite: **1,000** 前後 | **1,000** 前後（モデル・アカウントで要確認） |
| **TPM（1分あたりトークン）** | 250,000（無料枠で共通の記載あり） | 6,000〜30,000 程度（Free は低めの可能性） |
| **思考モード** | Pro 系で利用可能な場合あり | なし |
| **JSON / 構造化出力** | 対応 | 対応（JSON mode、Structured Outputs） |
| **日本語** | 強い | 利用可能 |
| **制限の単位** | プロジェクト単位（同一プロジェクト内のキーはクォータ共有） | アカウント（APIキー）単位 |
| **本仕様の目安（20枚→4リクエスト）** | 4リクエストは 1 分に収まるが、Pro なら 5 RPM でギリギリ。RPD 100 なら 1 日 25 回まで同規模の実行が目安。 | 4 リクエストは 30 RPM 内で余裕。RPD 1K なら 1 日 250 回程度まで同規模が目安。 |

**まとめ（無料枠のみ）**: マニュアル用に「画像→文章」をたくさん回すなら、**Groq の方が 1 分・1 日あたりのリクエスト数に余裕が出やすい**。品質・思考モード・日本語の自然さを優先するなら **Gemini Pro** を選ぶ、というトレードオフになる。

### ハイブリッド案: 画像→文章は Groq、最終文章の校整だけ 1 回を Gemini

**前提**: Gemini は 1 日に 10 回程度しか使えない（無料枠等）が、レベルは高い。そこで **回数が多い部分は Groq に任せて必要回数を稼ぎ、最後にまとまった文章を Gemini で 1 回だけ校整して日本語らしくする** 構成を選択肢として持つ。

- **流れ**: (1) **Groq** で画像から下書き JSON（slides）を生成（複数回）。 (2) ユーザーが確認・必要なら修正。 (3) 表題・目次・ワークフロー・FAQ の付与は Groq でも可。 (4) **最後に、完成した JSON を Gemini に 1 回だけ送り「日本語を自然に校整する。内容・キー構造・steps / done の形式は変えない」** と依頼して校整した JSON を得る。
- **メリット**: Gemini を「校整 1 回」に集中させることで 1 日 10 回の枠内に収めつつ、日本語の品質を Gemini で確保できる。回数が必要な画像→文章は Groq で賄う。
- **注意**: 校整用プロンプトで「意味・構造は変えず日本語だけ整える」と明示する。実装では Groq 用と Gemini 用の両方の API キー入力（または片方だけ使うモード）を考慮する。

---

前提事項
- 画像数枚がある。
- 画像ファイルはページ順に番号を付ける　1.png 2.png ... 
- 人間が、その画像１つ１つにクリックして欲しい順番を①②③...　と書いたり、言葉を書いたりする　
- Googleスライドのテンプレートを作成し、ページのどこにどの文章や画像やナレーションを入れたいか予めプレースホルダを決めておく
- Googleスライドのテンプレートは、同じものを使いまわすので、そのテンプレートに上書きせず、別のスライドIDを新規に作成して、そこにスライドを完成させる

オプション（説明文生成のAPI呼び出し）:
- 「何枚の画像を1回のAPI呼び出しにまとめるか」をユーザーが選択できるようにする。
- 例: デフォルトは「5枚で1回」（画像20枚ならAPI 4回）。「1枚で1回」などに変更可能。APIの負荷や確実さのトレードオフで選べるようにする。

1. 人間に画像をアップロードさせる画面からアップロードする　「説明文生成」ボタンをクリックして実行開始
2. 以下のプロンプトで、説明文のJSONを作成する

---
# プロンプトスタート
【重要】あなたの返答は、JSON のオブジェクトのみにすること。説明文・構成案・提案・「〜しましょうか？」などの質問は一切書かない。```json のようなコードブロックも付けない。生のJSONだけを出力する。
# 【重要】画像ファイル1.png => JSONのslideNo: 1 、　画像ファイル2.png => JSONのslideNo: 2 、、、となるように処理せよ
# 画像内に解説や①②③、、、が有る場合は必ずそれを活かして処理せよ

役割: 
あなたは、画像を読み込み、その画像からマニュアル用スライドを生成するプロフェッショナルです。

画像ファイル（1.png〜20.png　）を見て、操作マニュアル用のスライド文言およびナレーションを、指定のJSON形式で作成してください。


ルール:
- slideNo　は、1～20とすること
# 画像1枚 = 1スライド。
# 添付の画像1.png → slideNo: 1、 2.png → slideNo: 2 … とする。
- **画像内の説明文・番号の扱い**: スクリーンショットに説明文や①②③...などの番号・ラベルが写っている場合は、その内容をくみ取り、スライド本文（title, steps, notes など）や narration に反映すること。①②③...などの番号を用いての順序や説明の意味を活かして記述する。
- 各スライドに次のキーを必ず含める: slideNo, title, purpose, role, steps[], notes[], done[], narration
- title: そのスライドのタイトル（短い見出し）
- purpose: このスライドで何ができるようになるか（1文）
- role: 読者が担う役割・理解すべきこと（1文）
- steps: 操作手順。# 【重要】画像内の説明や①②③...の内容があれば、活用すること。要素は「〜する」「〜してください」で統一。配列で複数可能
- notes: 注意事項。配列で複数可能
- done: 完了条件。各要素は必ず "[ ] " で始める（チェックボックス用）。絵文字は禁止
- narration: そのスライドを説明するナレーション原稿。2〜4文、話し言葉で。スピーカーが読み上げる想定。必須。空文字にしない。画像内の説明や①②③...の内容があれば、それも含めて自然な文で書く

出力形式（この形だけを返す）:
{ "version": 1, "slides": [ { "slideNo": 1, "title": "…", "purpose": "…", "role": "…", "steps": ["…"], "notes": ["…"], "done": ["[ ] …"], "narration": "このスライドでは…。まず…してください。…" }, … ] }

上記以外の文字は出力しないこと。

# プロンプトエンド
---

3. 画像ファイルとＡＩが作成した説明を一つのhtml画面に並べて、1.png の説明がこれだとわかるように　画像を左　説明を右に出力する　これを縦に画像枚数分続ける
4. 人間が、画像と説明を確認し、必要なら説明を修正する　ここで説明を確定させる
5. 人間が、画面の一番下の「Googleスライド作成」ボタンをクリックする
6. 画像＋説明に加えて、表題、目次、ワークフロー、FAQを考えてJSONを組み立て直す（画像の説明が1.png 2.png ... と続くので、AIは流れが分かり、表題、目次、ワークフロー、FAQを考えやすい ）
この時のプロンプトは以下

---
# プロンプトスタート

役割：
あなたはマニュアル構成の編集者です。
上記の slides(JSON) を読み、表題・目次・ワークフロー・FAQ を上記の形（それぞれ text と narration を持つ）で追加し、さらに各スライドに narration が無ければ追加したJSONを返してください。

条件:
- 出力はJSONのみ。既存の slides の内容は活かす。
- cover は { title, subtitle, narration } の形で出力する。
- toc / workflow / faq は { text, narration } の形で出力する（スライド本文＝text、スピーカーノート＝narration）。
- 各スライド（slides の各要素）に narration が無い、または空の場合は追加する。既に narration があるスライドはそのまま残してよい。


# プロンプトエンド
---

7. この実行で最終的なJSONができる
8. 新規Googleスライドのプレースフォルダを書き換えるなどして、Googleスライドに文章と画像を貼り付ける
9. 最後に、「Googleスライド表示」ボタンを表示させる
10. 「Googleスライド表示」をクリックすると、新規に作られたGoogleスライドが表示される　ここで、人間が最終の微修正をする


---

## テンプレート４（本文スライド）の設定

テンプレート４は「本文」用で、画像の枚数だけこのレイアウトが複製される。次のようにするとよい。

### すでにできていること
- 左側のテキスト用プレースホルダー: `{{SLIDE_NO}}`, `{{TITLE}}`, `{{PURPOSE}}`, `{{ROLE}}`, `{{STEPS}}`, `{{NOTES}}`, `{{DONE}}` はそのままでよい。GAS が置換する。
- スピーカーノート欄に `{{NARRATION}}` を書いておく必要はない（GAS がノート欄に直接ナレーションを書き込む）。

### 画像を入れる領域について
- 右側の「ここに画像を入れたい」の部分は、**Googleスライド上で「画像」として 1 枚入れておく**とよい。
- 具体的には: テンプレート４の右側に、**ダミー画像を 1 枚挿入**する（例: グレーの四角の画像、または「画像のプレースホルダ」と書いた画像）。GAS 実装時には、このスライド上の「画像オブジェクト」を 1 つ特定し、それを 1.png / 2.png / … の実画像に差し替える処理にする。
- いったん図形（四角）だけにしている場合は、**「挿入 → 画像 → 画像をアップロード」で 1 枚ダミー画像を置く**か、同じサイズの画像オブジェクトに差し替える。そうすると、GAS で `insertImage` や既存画像の差し替えで対応しやすい。
- まとめ: **「画像が 1 つあるスライド」にしておく**と、実装時に「その画像を差し替える」だけで済む。

### 運用上の注意
- テンプレート４は 1 枚だけ。実行時に GAS が「本文スライド数 = 画像枚数」になるようテンプレ４を複製し、各枚のプレースホルダを置換し、各枚の画像オブジェクトを 1.png, 2.png, … に差し替える想定。

---

現在、JSONをGoogleスライドに反映するGASアプリは以下の通り。（画像の貼り付けはできない）
---
# アプリスタート

/**
 * JSONで生成したスライド文言を、テンプレート（体裁固定）のGoogleスライドへ反映する。
 *
 * 前提:
 * - テンプレ側の各スライドに、以下のプレースホルダーが配置されている（テキストボックス等）。
 *   固定ページ: {{COVER_TITLE}}, {{COVER_SUBTITLE}}, {{TOC}}, {{WORKFLOW}}, {{FAQ}}
 *   本文: {{SLIDE_NO}}, {{TITLE}}, {{PURPOSE}}, {{ROLE}}, {{STEPS}}, {{NOTES}}, {{DONE}}, {{NARRATION}}
 * - 反映は「置換」方式。体裁（フォント/位置/サイズ）はテンプレに任せる。
 *
 * 使い方:
 * 【おすすめ】JSONは json.gs に入れる（GASエディタで「実行」だけ触る）:
 *   - 同じプロジェクトに json.gs を置き、getSlideJson() の return { } の中にJSONを入れる。
 *   - コード.gs で runApplyFromTemplateToNewFromJsonGs を実行する。
 * - JSONをDriveのファイルに書く: runApplyFromTemplateToNewFromFile() … JSON_FILE_ID を設定。
 * - コードに直接JSONを書く: runApplyFromJsonText() / runApplyFromTemplateToNew()。
 *
 * デバッグ: 下の DEBUG_NARRATION を true にすると、ナレーション置換のログが Logger に出力される。
 */
var DEBUG_NARRATION = true;

/**
 * 既存のプレゼン1本に、JSONファイルの内容を反映する。
 * 設定: PRESENTATION_ID（反映先）と JSON_FILE_ID（JSONを貼ったファイル）だけ入れればよい。
 */
function runApplyFromJsonFile() {
  const PRESENTATION_ID = "PUT_PRESENTATION_ID_HERE"; // 反映先のスライドID
  const JSON_FILE_ID = "PUT_JSON_FILE_ID_HERE";       // JSONを貼ったファイルのID

  const data = readJsonFromFile_(JSON_FILE_ID);
  applySlideJsonToPresentation_(PRESENTATION_ID, data, {
    autoResize: true,
    fixedHeadSlides: 3,
    fixedTailSlides: 1,
    templateSlideIndex0: 3,
    useReplaceMode: false, // ファイルから読む運用なら毎回テンプレからコピー（runApplyFromTemplateToNewFromFile）を推奨
  });
}

function runApplyFromJsonText() {
  const PRESENTATION_ID = "1R3R7Pg_RcvCHpDI4EDnqJDmCMjK_xDOz4NjsVl9F-Lw";
  const JSON_TEXT = ""; // 文字列（JSON）でもオブジェクト（{ ... }）でも可
  const data = typeof JSON_TEXT === "string" ? JSON.parse(JSON_TEXT) : JSON_TEXT;
  // 構成: 1=表題, 2=目次, 3=ワークフロー, 4〜=本文(テンプレ複製), 最終=FAQ
  applySlideJsonToPresentation_(PRESENTATION_ID, data, {
    autoResize: true,
    fixedHeadSlides: 3,   // 1:表題, 2:目次, 3:ワークフロー
    fixedTailSlides: 1,   // 最終: FAQ
    templateSlideIndex0: 3, // 4枚目＝本文テンプレ（ここを複製して本文を増やす）
    useReplaceMode: true, // 同じファイルを何度も更新するとき true（前回の内容を今回のJSONで置換）
  });
}

/**
 * 【おすすめ】JSONは json.gs に書いておく。テンプレをコピーして新規プレゼンに反映する。
 * GASエディタでは「json.gs を編集 → 実行で runApplyFromTemplateToNewFromJsonGs を選ぶ」だけ覚えればよい。
 */
function runApplyFromTemplateToNewFromJsonGs() {
  const TEMPLATE_PRESENTATION_ID = "1R3R7Pg_RcvCHpDI4EDnqJDmCMjK_xDOz4NjsVl9F-Lw"; // 元プレゼン（触らない）

  const data = getSlideJson();
  if (!data || !Array.isArray(data.slides)) {
    throw new Error("json.gs の getSlideJson() が正しい形式のJSONを返していません。version と slides を含むオブジェクトにしてください。");
  }
  const titlePart = (data.cover && (typeof data.cover === "string" ? data.cover : data.cover.title)) || "新規スライド";
  const copyName = Utilities.formatDate(new Date(), "JST", "yyyy-MM-dd HH-mm")  + " " + titlePart; 
  const file = DriveApp.getFileById(TEMPLATE_PRESENTATION_ID).makeCopy(copyName);
  const newId = file.getId();

  applySlideJsonToPresentation_(newId, data, {
    autoResize: true,
    fixedHeadSlides: 3,
    fixedTailSlides: 1,
    templateSlideIndex0: 3,
    useReplaceMode: false,
  });

  const url = "https://docs.google.com/presentation/d/" + newId + "/edit";
  Logger.log("新規プレゼンを作成しました:");
  Logger.log(url);
  return url;
}

/**
 * JSONはDriveの「ファイル」（Googleドキュメント等）に書いておき、GASはそのファイルを読む。
 * テンプレをコピーして新規プレゼンを作り、ファイルのJSONを反映する。
 * 設定: TEMPLATE_PRESENTATION_ID と JSON_FILE_ID だけ入れればよい。
 */
function runApplyFromTemplateToNewFromFile() {
  const TEMPLATE_PRESENTATION_ID = "1R3R7Pg_RcvCHpDI4EDnqJDmCMjK_xDOz4NjsVl9F-Lw"; // 元プレゼン（触らない）
  const JSON_FILE_ID = "PUT_JSON_FILE_ID_HERE";   // JSONを貼ったファイルのID（下記「JSONファイルの作り方」参照）

  const data = readJsonFromFile_(JSON_FILE_ID);
  const titlePart = (data.cover && (typeof data.cover === "string" ? data.cover : data.cover.title)) || "新規スライド";
  const copyName = titlePart + " " + Utilities.formatDate(new Date(), "JST", "yyyy-MM-dd HH-mm");
  const file = DriveApp.getFileById(TEMPLATE_PRESENTATION_ID).makeCopy(copyName);
  const newId = file.getId();

  applySlideJsonToPresentation_(newId, data, {
    autoResize: true,
    fixedHeadSlides: 3,
    fixedTailSlides: 1,
    templateSlideIndex0: 3,
    useReplaceMode: false,
  });

  const url = "https://docs.google.com/presentation/d/" + newId + "/edit";
  Logger.log("新規プレゼンを作成しました:");
  Logger.log(url);
  return url;
}

/**
 * テンプレ（元プレゼン）をDriveでコピーし、新規プレゼンIDに対してJSONを反映する。
 * 元のプレゼンは一切変更されず、実行のたびに「新しいプレゼン」が1本できる。
 * JSONはコード内（JSON_TEXT）に書く方式。
 */
function runApplyFromTemplateToNew() {
  const TEMPLATE_PRESENTATION_ID = "1R3R7Pg_RcvCHpDI4EDnqJDmCMjK_xDOz4NjsVl9F-Lw"; // 元プレゼン（触らない）
  const JSON_TEXT = "PUT_JSON_HERE"; // runApplyFromJsonText と同じ形式。同じJSONを使うなら変数を共通化しても可

  const data = typeof JSON_TEXT === "string" ? JSON.parse(JSON_TEXT) : JSON_TEXT;
  const titlePart = (data.cover && (typeof data.cover === "string" ? data.cover : data.cover.title)) || "新規スライド";
  const copyName = titlePart + " " + Utilities.formatDate(new Date(), "JST", "yyyy-MM-dd HH-mm");
  const file = DriveApp.getFileById(TEMPLATE_PRESENTATION_ID).makeCopy(copyName);
  const newId = file.getId();

  applySlideJsonToPresentation_(newId, data, {
    autoResize: true,
    fixedHeadSlides: 3,
    fixedTailSlides: 1,
    templateSlideIndex0: 3,
    useReplaceMode: false,
  });

  const url = "https://docs.google.com/presentation/d/" + newId + "/edit";
  Logger.log("新規プレゼンを作成しました:");
  Logger.log(url);
  return url;
}

/**
 * Drive上のファイルからJSONを読み込んでパースする。
 * - Googleドキュメント: 本文のテキストをそのままJSONとして読む。
 * - その他（.txt など）: ファイル内容をテキストとして読む。
 * JSONファイルの作り方:
 *   1. drive.google.com で「新規」→「Googleドキュメント」で空のドキュメントを作る。
 *   2. 中身をすべて削除し、Geminiなどで作ったJSONを貼り付ける（これだけ）。
 *   3. URLの d/ と /edit の間がファイルID。例: .../d/1abc...xyz/edit → 1abc...xyz
 *   4. そのIDを GAS の JSON_FILE_ID に入れる。
 */
function readJsonFromFile_(fileId) {
  if (!fileId || fileId === "PUT_JSON_FILE_ID_HERE") {
    throw new Error("JSON_FILE_ID を設定してください。Googleドキュメントを1つ作り、JSONを貼り、URLからIDをコピーしてここに入れます。");
  }
  const mimeType = DriveApp.getFileById(fileId).getMimeType();
  let raw;
  if (mimeType === "application/vnd.google-apps.document") {
    raw = DocumentApp.openById(fileId).getBody().getText();
  } else {
    raw = DriveApp.getFileById(fileId).getBlob().getDataAsString();
  }
  raw = (raw || "").trim();
  if (!raw) throw new Error("JSONファイルが空です。ファイルにJSONを貼り付けてください。");
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error("JSONの形式が正しくありません。前後に説明文が入っていないか、カンマの抜けなどを確認してください。詳細: " + e.message);
  }
}

function applySlideJsonToPresentation_(presentationId, data, opts) {
  if (!data || !Array.isArray(data.slides)) {
    throw new Error("Invalid JSON: data.slides[] が必要です");
  }

  const options = Object.assign(
    {
      autoResize: false,
      fixedHeadSlides: 0,
      fixedTailSlides: 0,
      templateSlideIndex0: 0,
      useReplaceMode: false,
    },
    opts || {}
  );

  const pres = SlidesApp.openById(presentationId);
  if (options.autoResize) {
    const requiredTotal = calcRequiredTotalSlides_(data, options);
    ensureSlideCount_(pres, requiredTotal, options);
  }
  const slides = pres.getSlides(); // resize後に再取得

  const headSlides = Math.max(0, Number(options.fixedHeadSlides || 0));
  const tailSlides = Math.max(0, Number(options.fixedTailSlides || 0));

  const useReplace = options.useReplaceMode === true;
  const lastApplied = useReplace ? loadLastApplied_(presentationId) : null;
  const canReplace = lastApplied && lastApplied.slides && lastApplied.slides.length === data.slides.length;

  if (useReplace && canReplace) {
    // 方法B: 前回の内容を今回のJSONで置換（同じファイルを何度も更新）
    applyByReplace_(slides, headSlides, tailSlides, lastApplied, data);
  } else {
    // 方法A（従来）: プレースホルダーを置換
    applyByPlaceholders_(slides, headSlides, tailSlides, data);
  }

  saveLastApplied_(presentationId, data);
}

function applyByPlaceholders_(slides, headSlides, tailSlides, data) {
  // 表題・目次・ワークフロー・FAQ は JSON のルートに cover, toc, workflow, faq が必要
  if (data.cover == null) Logger.log("【注意】JSON に cover がありません。表題ページを反映するには cover: { title, subtitle } を追加してください。");
  if (data.toc == null) Logger.log("【注意】JSON に toc がありません。目次ページを反映するには toc を追加してください。");
  if (data.workflow == null) Logger.log("【注意】JSON に workflow がありません。ワークフローページを反映するには workflow を追加してください。");
  if (data.faq == null) Logger.log("【注意】JSON に faq がありません。FAQページを反映するには faq を追加してください。");

  if (slides.length > 0 && headSlides >= 1 && data.cover != null) {
    const c = data.cover;
    replaceAll_(slides[0], "{{COVER_TITLE}}", String(typeof c === "string" ? c : (c.title ?? "")));
    replaceAll_(slides[0], "{{COVER_SUBTITLE}}", String(typeof c === "object" && c !== null ? (c.subtitle ?? "") : ""));
    if (slideContainsText_(slides[0], "{{COVER_TITLE}}") || slideContainsText_(slides[0], "{{COVER_SUBTITLE}}")) {
      Logger.log("【重要】1枚目(表題)にプレースホルダーが残っています。テンプレの表題スライドにテキストボックスを追加し「{{COVER_TITLE}}」「{{COVER_SUBTITLE}}」と入力してください。");
    }
  }
  if (slides.length > 1 && headSlides >= 2 && data.toc != null) {
    replaceAll_(slides[1], "{{TOC}}", toSingleString_(data.toc));
    if (slideContainsText_(slides[1], "{{TOC}}")) Logger.log("【重要】2枚目(目次)にプレースホルダーが残っています。テンプレの目次スライドに「{{TOC}}」と入力したテキストボックスを追加してください。");
  }
  if (slides.length > 2 && headSlides >= 3 && data.workflow != null) {
    replaceAll_(slides[2], "{{WORKFLOW}}", formatWorkflowWithLineBreaks_(toSingleString_(data.workflow)));
    if (slideContainsText_(slides[2], "{{WORKFLOW}}")) Logger.log("【重要】3枚目(ワークフロー)にプレースホルダーが残っています。テンプレに「{{WORKFLOW}}」と入力したテキストボックスを追加してください。");
  }
  if (tailSlides >= 1 && slides.length >= 1 && data.faq != null) {
    replaceAll_(slides[slides.length - 1], "{{FAQ}}", toSingleString_(data.faq));
    if (slideContainsText_(slides[slides.length - 1], "{{FAQ}}")) Logger.log("【重要】最終枚(FAQ)にプレースホルダーが残っています。テンプレのFAQスライドに「{{FAQ}}」と入力したテキストボックスを追加してください。");
  }
  data.slides.forEach((s) => {
    const contentIndex0 = toSlideIndex0_(s);
    const slideIndex0 = headSlides + contentIndex0;
    if (slideIndex0 < 0 || slideIndex0 >= slides.length) return;
    const slide = slides[slideIndex0];
    replaceAll_(slide, "{{SLIDE_NO}}", String(s.slideNo ?? s.pageNo ?? contentIndex0 + 1));
    replaceAll_(slide, "{{TITLE}}", String(s.title ?? ""));
    replaceAll_(slide, "{{PURPOSE}}", String(s.purpose ?? ""));
    replaceAll_(slide, "{{ROLE}}", String(s.role ?? ""));
    replaceAll_(slide, "{{STEPS}}", normalizeLines_(s.steps, { prefix: "" }));
    replaceAll_(slide, "{{NOTES}}", normalizeLines_(s.notes, { prefix: "- " }));
    replaceAll_(slide, "{{DONE}}", normalizeLines_(s.done, { prefix: "" }));
  });
  // 全ページ共通: スピーカーノートをいったん消してからナレーションを入れる
  for (let i = 0; i < slides.length; i++) {
    const narrationText = getNarrationForSlideIndex_(i, slides.length, headSlides, tailSlides, data);
    setNarrationToNotesPage_(slides[i], narrationText, i, "all");
  }
}

function applyByReplace_(slides, headSlides, tailSlides, lastApplied, data) {
  if (slides.length > 0 && headSlides >= 1 && data.cover != null && lastApplied.cover != null) {
    const oldC = lastApplied.cover;
    const newC = data.cover;
    const oldTitle = typeof oldC === "string" ? oldC : (oldC.title ?? "");
    const oldSubtitle = typeof oldC === "object" && oldC !== null ? (oldC.subtitle ?? "") : "";
    const newTitle = typeof newC === "string" ? newC : (newC.title ?? "");
    const newSubtitle = typeof newC === "object" && newC !== null ? (newC.subtitle ?? "") : "";
    if (oldTitle) replaceAll_(slides[0], oldTitle, String(newTitle));
    if (oldSubtitle) replaceAll_(slides[0], oldSubtitle, String(newSubtitle));
  }
  if (slides.length > 1 && headSlides >= 2 && data.toc != null && lastApplied.toc != null) {
    const oldToc = toSingleString_(lastApplied.toc);
    if (oldToc) replaceAll_(slides[1], oldToc, toSingleString_(data.toc));
  }
  if (slides.length > 2 && headSlides >= 3 && data.workflow != null && lastApplied.workflow != null) {
    const oldWf = formatWorkflowWithLineBreaks_(toSingleString_(lastApplied.workflow));
    const newWf = formatWorkflowWithLineBreaks_(toSingleString_(data.workflow));
    if (oldWf) replaceAll_(slides[2], oldWf, newWf);
  }
  if (tailSlides >= 1 && slides.length >= 1 && data.faq != null && lastApplied.faq != null) {
    const oldFaq = toSingleString_(lastApplied.faq);
    if (oldFaq) replaceAll_(slides[slides.length - 1], oldFaq, toSingleString_(data.faq));
  }
  data.slides.forEach((s, i) => {
    const contentIndex0 = toSlideIndex0_(s);
    const slideIndex0 = headSlides + contentIndex0;
    if (slideIndex0 < 0 || slideIndex0 >= slides.length) return;
    const last = lastApplied.slides[i];
    if (!last) return;
    const slide = slides[slideIndex0];
    const oldSteps = normalizeLines_(last.steps, { prefix: "" });
    const newSteps = normalizeLines_(s.steps, { prefix: "" });
    const oldNotes = normalizeLines_(last.notes, { prefix: "- " });
    const newNotes = normalizeLines_(s.notes, { prefix: "- " });
    const oldDone = normalizeLines_(last.done, { prefix: "" });
    const newDone = normalizeLines_(s.done, { prefix: "" });
    const oldSlideNo = String(last.slideNo ?? last.pageNo ?? i + 1);
    const oldTitle = String(last.title ?? "");
    const oldPurpose = String(last.purpose ?? "");
    const oldRole = String(last.role ?? "");
    if (oldSlideNo) replaceAll_(slide, oldSlideNo, String(s.slideNo ?? s.pageNo ?? contentIndex0 + 1));
    if (oldTitle) replaceAll_(slide, oldTitle, String(s.title ?? ""));
    if (oldPurpose) replaceAll_(slide, oldPurpose, String(s.purpose ?? ""));
    if (oldRole) replaceAll_(slide, oldRole, String(s.role ?? ""));
    if (oldSteps) replaceAll_(slide, oldSteps, newSteps);
    if (oldNotes) replaceAll_(slide, oldNotes, newNotes);
    if (oldDone) replaceAll_(slide, oldDone, newDone);
  });
  // 全ページ共通: スピーカーノートをいったん消してからナレーションを入れる
  for (let i = 0; i < slides.length; i++) {
    const narrationText = getNarrationForSlideIndex_(i, slides.length, headSlides, tailSlides, data);
    setNarrationToNotesPage_(slides[i], narrationText, i, "all");
  }
}

function loadLastApplied_(presentationId) {
  try {
    const key = "slides_apply_json_" + presentationId;
    const raw = PropertiesService.getScriptProperties().getProperty(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveLastApplied_(presentationId, data) {
  try {
    const key = "slides_apply_json_" + presentationId;
    PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(data));
  } catch (e) {
    // プロパティ保存失敗は無視（次回はプレースホルダー方式にフォールバック）
  }
}

function calcRequiredTotalSlides_(data, options) {
  const head = Math.max(0, Number(options.fixedHeadSlides || 0));
  const tail = Math.max(0, Number(options.fixedTailSlides || 0));
  // 本文は data.slides の件数分。JSON の slideNo は本文内の通し（1,2,3,...）を想定。
  const contentCount = data.slides.length;
  return head + contentCount + tail;
}

/**
 * プレゼン全体の枚数を requiredTotal に合わせる。
 * - 足りない場合：templateSlideIndex0 のスライドを複製して増やす
 * - 多い場合：末尾側から削除する（fixedTailSlides を守る）
 */
function ensureSlideCount_(pres, requiredTotal, options) {
  const fixedHead = Math.max(0, Number(options.fixedHeadSlides || 0));
  const fixedTail = Math.max(0, Number(options.fixedTailSlides || 0));

  // まずは増やす
  while (pres.getSlides().length < requiredTotal) {
    const slides = pres.getSlides();
    const templateIdx = Math.min(
      Math.max(0, Number(options.templateSlideIndex0 || 0)),
      slides.length - 1
    );
    const template = slides[templateIdx];

    // 複製位置：末尾の fixedTail より前（= 本体末尾）に差し込む
    const insertAfterIdx = Math.max(
      fixedHead - 1,
      slides.length - fixedTail - 1
    );
    if (insertAfterIdx < 0) {
      // スライドが0枚のケースは通常起きないが念のため
      template.duplicate();
    } else {
      slides[insertAfterIdx].duplicate();
    }
  }

  // 次に減らす（末尾側から削除）
  while (pres.getSlides().length > requiredTotal) {
    const slides = pres.getSlides();
    const deleteIdx = slides.length - fixedTail - 1;
    if (deleteIdx < fixedHead) break; // 固定領域しか残らないので停止
    pres.removeSlide(slides[deleteIdx]);
  }
}

function toSlideIndex0_(s) {
  const no = Number(s.slideNo ?? s.pageNo ?? NaN);
  if (!Number.isFinite(no)) return -1;
  return Math.max(0, Math.floor(no) - 1);
}

function replaceAll_(slide, placeholder, value) {
  if (placeholder == null || String(placeholder) === "") return; // 空文字での置換は行わない
  slide.replaceAllText(placeholder, value == null ? "" : String(value));
}

/** スライド上のいずれかのテキストに指定文字列が含まれるか */
function slideContainsText_(slide, searchText) {
  if (!searchText) return false;
  try {
    const shapes = slide.getShapes();
    for (let i = 0; i < shapes.length; i++) {
      try {
        const textRange = shapes[i].getText();
        if (textRange && textRange.asString().indexOf(searchText) !== -1) return true;
      } catch (e) { /* テキストのないシェイプは無視 */ }
    }
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * ナレーションをスピーカーノート（ノート欄）にだけ書き込む。スライド本体は触らない。
 * ノートのスピーカーノート用シェイプのテキストをクリアし、ナレーション文で上書きする。
 * @param slide - スライド
 * @param narrationText - 書き込むナレーション文
 * @param slideIndex0 - デバッグ用（0始まり）
 * @param mode - デバッグ用 "placeholders" | "replaceMode"
 * @param oldNarrForReplace - replaceMode のとき、ノート欄の既存テキスト（あれば置換を試す）
 */
function setNarrationToNotesPage_(slide, narrationText, slideIndex0, mode, oldNarrForReplace) {
  slideIndex0 = slideIndex0 != null ? slideIndex0 : -1;
  mode = mode || "";
  const text = narrationText == null ? "" : String(narrationText);
  try {
    const notesPage = slide.getNotesPage();
    if (!notesPage) {
      if (DEBUG_NARRATION) Logger.log("[NARRATION] ノート欄 index=" + slideIndex0 + " getNotesPage()=null");
      return;
    }
    const notesShape = notesPage.getSpeakerNotesShape();
    if (!notesShape) {
      if (DEBUG_NARRATION) Logger.log("[NARRATION] ノート欄 index=" + slideIndex0 + " getSpeakerNotesShape()=null");
      return;
    }
    const textRange = notesShape.getText();
    if (!textRange) {
      if (DEBUG_NARRATION) Logger.log("[NARRATION] ノート欄 index=" + slideIndex0 + " getText()=null");
      return;
    }
    // 既存テキストを削除してからナレーションを先頭に挿入（スピーカーノートを上書き）
    textRange.clear();
    if (text.length > 0) {
      textRange.insertText(0, text);
    }
    if (DEBUG_NARRATION) Logger.log("[NARRATION] ノート欄 index=" + slideIndex0 + " mode=" + mode + " 書き込み長=" + text.length);
  } catch (e) {
    if (DEBUG_NARRATION) Logger.log("[NARRATION] ノート欄 index=" + slideIndex0 + " エラー: " + e.message);
  }
}

function toSingleString_(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((s) => String(s ?? "").trim()).join("\n");
  if (typeof value === "object" && value !== null && "text" in value) return toSingleString_(value.text);
  return String(value);
}

/** ワークフロー用。「 → 」の手前で改行し、目次と同様に1行1ステップで表示する。 */
function formatWorkflowWithLineBreaks_(str) {
  if (str == null || String(str).trim() === "") return "";
  return String(str).trim().replace(/\s*→\s*/g, "\n→ ").trim();
}

/** toc / workflow / faq が { text, narration } のとき narration を返す。文字列や null のときは空文字 */
function getNarrationFromField_(value) {
  if (value == null || typeof value !== "object") return "";
  const n = value.narration;
  return n != null && String(n).trim() !== "" ? String(n).trim() : "";
}

/**
 * スライドインデックスに対応するナレーション文字列を返す（全ページ共通ナレーション用）。
 * @param slideIndex0 - 0始まりのスライド番号
 * @param totalSlides - スライド総数
 * @param headSlides - 先頭固定枚数（表題・目次・ワークフロー）
 * @param tailSlides - 末尾固定枚数（FAQ）
 * @param data - applySlideJsonToPresentation_ の data
 */
function getNarrationForSlideIndex_(slideIndex0, totalSlides, headSlides, tailSlides, data) {
  if (!data) return "";
  if (slideIndex0 === 0 && headSlides >= 1 && data.cover != null) {
    const c = data.cover;
    if (typeof c === "object" && c !== null && c.narration != null && String(c.narration).trim() !== "") return String(c.narration).trim();
    return "";
  }
  if (slideIndex0 === 1 && headSlides >= 2 && data.toc != null) return getNarrationFromField_(data.toc);
  if (slideIndex0 === 2 && headSlides >= 3 && data.workflow != null) return getNarrationFromField_(data.workflow);
  if (tailSlides >= 1 && slideIndex0 === totalSlides - 1 && data.faq != null) return getNarrationFromField_(data.faq);
  const bodyIndex0 = slideIndex0 - headSlides;
  if (bodyIndex0 >= 0 && Array.isArray(data.slides) && bodyIndex0 < data.slides.length) {
    const s = data.slides[bodyIndex0];
    const n = s && s.narration != null ? String(s.narration).trim() : "";
    return n || "";
  }
  return "";
}

function normalizeLines_(value, opts) {
  const prefix = (opts && opts.prefix) || "";
  if (value == null) return "";
  const arr = Array.isArray(value) ? value : String(value).split(/\r?\n/);
  return arr
    .map((s) => String(s ?? "").trim())
    .filter((s) => s.length > 0)
    .map((s) => prefix + s)
    .join("\n");
}



# アプリエンド
---

---

# 実現可能性の評価（追記）

仕様を読んだうえで、「できるか」の結論だけ簡潔に書きます。

## 結論：**可能です**

Gemini API と GAS の組み合わせで、仕様に書かれている流れは実現できます。

---

### 実現できる点

| 項目 | 評価 |
|------|------|
| 画像アップロード＋「説明文生成」 | 可能。GAS の HtmlService や Web アプリでアップロードを受け取り、画像を Drive 等に保存してから Gemini に渡せばよい。 |
| 画像→説明文 JSON（1〜2のプロンプト） | 可能。Gemini の画像入力＋構造化出力で、仕様の JSON 形式を返させることは現実的。 |
| 画像と説明を左右に並べて表示・編集（3〜4） | 可能。HTML で 1 枚ごとに「左：画像」「右：説明」を出し、テキストを編集可能にすればよい。 |
| 表題・目次・ワークフロー・FAQ の付与（5〜7のプロンプト） | 可能。既存の slides JSON を入力に、cover / toc / workflow / faq を追加するだけの LLM 呼び出しで対応できる。 |
| テンプレをコピーして新規スライド作成（8） | 可能。既存 GAS の「テンプレをコピーして JSON を反映」と同じ方式でよい。 |
| 「Googleスライド表示」ボタンで開く（9〜10） | 可能。作成したプレゼンの ID から編集 URL を組み、リンクや `window.open` で開けばよい。 |

---

### 追加で必要な検討（仕様の補足レベル）

1. **画像の貼り付け**  
   現状の GAS は「画像の貼り付けはできない」とあるので、**新規に「画像挿入」処理を足す**必要があります。  
   - SlidesApp で `insertImage(blob)` や `insertImage(url)` が使える。  
   - テンプレ側に「ここにスクショを入れる」ための**画像用のプレースホルダ（枠やダミー画像）を 1 スライド1つ**用意し、その位置に差し替え／挿入する形にすると実装しやすいです。

2. **画像枚数と Gemini の制限**  
   Google AI Studio で画像20枚を投げて順番を間違えずに処理できた実績がある。  
   - デフォルトは「5枚で1回」のAPI呼び出しにするとAPIも楽に処理しやすい。  
   - **オプションで変更可能にする**: 1枚で1API、5枚で1API などをユーザーが選べるようにするとよい（仕様の「オプション」に記載済み）。

3. **Gemini の返答が JSON 以外になる場合**  
   「JSON のみ」と指定しても、まれにコードブロック（\`\`\`json ... \`\`\`）で囲まれることがあります。  
   - レスポンスからコードブロック用の記号を除去してから `JSON.parse` する処理を入れておくとよいです。

4. **画像の保持**  
   「説明文生成」から「Googleスライド作成」まで、同じ 1.png, 2.png, … を参照する必要があります。  
   - アップロード時に Drive の一時フォルダなどに保存し、スライド作成時にそのファイルを読んで挿入する形にすれば一貫して扱えます。

---

### まとめ

- フロー全体（アップロード → 説明生成 → 確認・編集 → 表題・目次・ワークフロー・FAQ 付与 → 新規スライド作成 → 表示）は**実装可能**です。  
- 既存の「JSON をスライドに反映する GAS」をベースに、  
  - **画像の保存・挿入**  
  - **テンプレの画像用プレースホルダ**  
  を仕様に明記し、上記の制限対策（バッチ分割・JSON パース・画像の保持）を設計に含めれば、実装準備として十分現実的です。

---

# 仕様がまだ固まっていない部分（要検討）

実装前に決めておくとよい項目を挙げる。

| 項目 | 現状 | 決めるとよいこと |
|------|------|------------------|
| **UI のホスティング** | 未記載 | アップロード・確認・編集画面を「GAS の Web アプリ（HtmlService）」で出すか、別サーバーで出すか。 |
| **画像の最大枚数** | プロンプトで「1.png〜20.png」とあるのみ | 上限は 20 枚固定か、可変か。可変なら上限値（例: 50 枚）を決めるか。 |
| **バッチオプションの UI** | 「5枚で1回」「1枚で1回」と例のみ | 選択肢は 1 / 3 / 5 / 10 などどれを用意するか。設定は画面のドロップダウンか、設定ファイルか。 |
| **Gemini API キー** | 未記載 | どこに保持するか（GAS の Script Properties、環境変数など）。 |
| **画像の一時保存** | 「Drive の一時フォルダ」とだけ記載 | どのフォルダか（固定フォルダ名／ID）。保存した画像の削除タイミング（スライド作成後すぐ／一定時間後／手動）。 |
| **説明の編集 UI** | 「必要なら説明を修正」とあるのみ | 編集対象は全フィールドか。入力形態はフォーム項目ごとか、JSON 直接編集か。 |
| **表題・目次・ワークフロー・FAQ 用プロンプト** | 「上記の slides(JSON) を読み」とある | API 呼び出し時に slides をどう渡すか（プロンプト本文に JSON を埋め込む等）を仕様に書いておくと実装が揃う。 |
| **エラー時** | 未記載 | 説明文生成失敗時・API 制限到達時の表示やリトライ方針。 |
| **新規スライドの保存場所** | 未記載 | テンプレをコピーした新規プレゼンを Drive のルートに作るか、指定フォルダに作るか。 |
| **toc / workflow / faq の詳細形式** | 「text と narration」とあるのみ | toc の text は目次項目の配列か 1 文か。workflow は「→」区切り 1 文か。FAQ は 1 ブロックの文か Q&A 配列か。既存 GAS の `toSingleString_` の扱いと合わせて決める。 |
