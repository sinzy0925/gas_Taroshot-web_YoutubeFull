/**
 * Gemini API（REST）: プロンプト組み立て、1回で全画像送信、レスポンスパース・リトライ
 * YouTube 動画用ナレーション専用。Gemini 2.5 Pro Preview 等で 1 実行で全スライドを生成。
 */
var Gemini = (function() {
  "use strict";

  var GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

  /**
   * ログ・画面用に API Key を伏せる（UrlFetch 例外の URL に ?key= が付くことがある）。
   * @param {string} text
   * @returns {string}
   */
  function redactSecrets(text) {
    if (text == null) return "";
    return String(text)
      .replace(/([?&]key=)[^&\s"'<>]+/gi, "$1***")
      .replace(/\bkey=[^&\s"'<>]+/gi, "key=***");
  }

  /**
   * 全画像を 1 リクエストで送る用のプロンプト（Gemini 向けに最適化）
   * @param {number} totalSlides - 画像枚数（= スライド数）
   * @returns {string}
   */
  function buildPrompt(totalSlides) {
    return buildPromptForBatch(totalSlides, 1, totalSlides, "");
  }

  /**
   * バッチ用プロンプト（2 回目以降は「1〜N 枚目は処理済み」を伝える）
   * @param {number} batchSize - このバッチの画像枚数
   * @param {number} startSlideNo - このバッチの先頭の slideNo（例: 11）
   * @param {number} totalSlides - 全体のスライド数
   * @param {string} alreadyProcessedMessage - 2 回目以降用。「すでに 1〜10 枚目は処理済みです。」など。1 回目は ""
   * @returns {string}
   */
  function buildPromptForBatch(batchSize, startSlideNo, totalSlides, alreadyProcessedMessage) {
    var endSlideNo = startSlideNo + batchSize - 1;
    var n = String(batchSize);
    var context = "";
    if (alreadyProcessedMessage && alreadyProcessedMessage.length > 0) {
      context = "【前回までの処理】\n" + alreadyProcessedMessage + "\n\n";
    }
    return (
      "あなたは YouTube 動画用のナレーション原稿を作成する専門家です。\n\n" +
      context +
      "【必須ルール】\n" +
      "- 返答は **JSON オブジェクト 1 つだけ** にすること。説明文・コメント・コードブロックは一切付けない。\n" +
      "- 添付されている画像は **今回の分のみ**で、**" + startSlideNo + ".png から " + endSlideNo + ".png まで、合計 " + n + " 枚**です。\n" +
      "- **画像の並び順 = slideNo**。1 枚目 → slideNo: " + startSlideNo + "、2 枚目 → slideNo: " + (startSlideNo + 1) + "、… " + n + " 枚目 → slideNo: " + endSlideNo + "。\n" +
      "- 各画像について、**ナレーション（読み上げ用の話し言葉）だけ**を日本語で 1 つ書く。\n" +
      "- 出力するキーは **slideNo と narration のみ**。title / purpose / steps 等は出力しない。\n\n" +
      "【ナレーションの書き方】\n" +
      "- **画像に説明文・キャプション・ラベル・手順テキストが写っている場合は、その文言をできるだけナレーションに反映する。** 書いてある内容を省略せず、聞き取りやすい話し言葉に整えて取り込む。\n" +
      "- 画像内に①②③や番号・ステップがあれば、**その順序と文言を活かして**自然な文にする。番号付きの説明はそのままナレーションの流れに組み込む。\n" +
      "- 画像に写っている操作・画面を、視聴者が聞いて分かるように 2〜4 文で説明する。です・ます調で、簡潔で聞き取りやすい口調にする。空文字は禁止。\n\n" +
      "【出力形式】この形だけを返す。slideNo は " + startSlideNo + " 〜 " + endSlideNo + " で出力すること。\n" +
      '{"version":1,"slides":[{"slideNo":' + startSlideNo + ',"narration":"…"},…]}\n\n' +
      "上記以外の文字は出力しないこと。"
    );
  }

  /**
   * レスポンス本文から ```json ... ``` を除去
   * @param {string} text
   * @returns {string}
   */
  function stripJsonCodeBlock(text) {
    if (typeof text !== "string") return "";
    var t = text.trim();
    var m = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m && m[1]) return m[1].trim();
    return t;
  }

  /**
   * テキストをパースしてオブジェクトを返す。失敗時は null
   * @param {string} text
   * @returns {Object|null}
   */
  function parseJsonResponse(text) {
    var raw = stripJsonCodeBlock(text);
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  /**
   * パース失敗時にリトライ
   * @param {string} text
   * @returns {Object|null}
   */
  function parseWithRetry(text) {
    var obj = parseJsonResponse(text);
    if (obj) return obj;
    var maxRetry = CONFIG.PARSE_RETRY_COUNT;
    var intervalMs = CONFIG.PARSE_RETRY_MS;
    for (var i = 0; i < maxRetry; i++) {
      Utilities.sleep(intervalMs);
      obj = parseJsonResponse(text);
      if (obj) return obj;
    }
    return null;
  }

  /**
   * Gemini API を 1 回呼び出す（全画像をまとめて送る）
   * @param {string} apiKey - Gemini API キー
   * @param {string} model - モデル ID（例: gemini-3.5-flash-lite）
   * @param {{ base64: string, mimeType: string }[]} images - base64 と MIME の配列
   * @param {string} promptText - プロンプト文字列
   * @returns {{ success: boolean, data?: Object, error?: string, statusCode?: number }}
   */
  function callGemini(apiKey, model, images, promptText) {
    var parts = [{ text: promptText }];
    for (var i = 0; i < images.length; i++) {
      parts.push({
        inlineData: {
          mimeType: images[i].mimeType,
          data: images[i].base64
        }
      });
    }
    var payload = {
      contents: [{
        role: "user",
        parts: parts
      }],
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: 8192,
        temperature: 0.2
      }
    };
    var url = GEMINI_BASE + "/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(apiKey);
    var options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    try {
      var response = UrlFetchApp.fetch(url, options);
      var code = response.getResponseCode();
      var body = response.getContentText();
      if (code !== 200) {
        var headers = response.getAllHeaders && response.getAllHeaders();
        var retryAfter = headers && (headers["Retry-After"] || headers["retry-after"] || "");
        var err = "API error: " + code;
        if (retryAfter) {
          err += " Retry-After=" + retryAfter;
        }
        err += " body=" + body.substring(0, 300);
        return {
          success: false,
          error: redactSecrets(err),
          statusCode: code
        };
      }
      var json = JSON.parse(body);
      var candidate = json.candidates && json.candidates[0];
      if (!candidate || !candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
        return { success: false, error: "No content in response" };
      }
      var text = candidate.content.parts[0].text;
      if (!text) {
        return { success: false, error: "Empty text in response" };
      }
      var parsed = parseWithRetry(text);
      if (!parsed) {
        return { success: false, error: "JSON parse failed after retry" };
      }
      return { success: true, data: parsed };
    } catch (e) {
      return {
        success: false,
        error: redactSecrets((e.message || String(e)).substring(0, 300))
      };
    }
  }

  return {
    buildPrompt: buildPrompt,
    buildPromptForBatch: buildPromptForBatch,
    stripJsonCodeBlock: stripJsonCodeBlock,
    parseJsonResponse: parseJsonResponse,
    parseWithRetry: parseWithRetry,
    callGemini: callGemini,
    redactSecrets: redactSecrets
  };
})();
