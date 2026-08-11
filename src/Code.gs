/**
 * 20260811 21:00
 * スライド起動時にメニューを追加。メニューから「タロショットを開く」でモーダルダイアログを表示。
 * コンテナバインド（スライドに紐付けたスクリプト）で使用すること。
 */

function onOpen() {
  var ui = SlidesApp.getUi();
  ui.createMenu("タロショット")
    .addItem("タロショットを開く", "showTaroshotDialog")
    .addToUi();
}

/**
 * タロショット用モーダルダイアログを表示する。
 */
function showTaroshotDialog() {
  var html = createTaroshotHtml()
    .setWidth(720)
    .setHeight(520);
  SlidesApp.getUi().showModalDialog(html, "タロショット (YouTube)");
}

/**
 * 本体 UI を生成する。Config のヘルプ URL を HTML に渡す。
 * @returns {GoogleAppsScript.HTML.HtmlOutput}
 */
function createTaroshotHtml() {
  return HtmlService.createHtmlOutputFromFile("TaroshotDialog")
    .setTitle("タロショット")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * API キーをマスクして返す（クライアントに実キーを渡さない）。
 * @param {string} key - 保存済みの API キー
 * @returns {string} 空またはマスク文字列（例: "sk12***xyz1"）
 */
function maskApiKey(key) {
  if (!key || typeof key !== "string") return "";
  var k = key.trim();
  if (k.length === 0) return "";
  if (k.length <= 8) return "********";
  return k.substring(0, 4) + "***" + k.substring(k.length - 4);
}

/**
 * 利用者ごとの設定ストア（設計 Step 3）。
 * Script Properties は使わない（オーナーの Key / フォルダ ID が全員に見えるため。フォールバックなし）。
 * @returns {GoogleAppsScript.Properties.Properties}
 */
function getAppProperties() {
  return PropertiesService.getUserProperties();
}

/**
 * User Properties からフォルダ ID を取得（URL が保存されていても ID に正規化）
 * @param {GoogleAppsScript.Properties.Properties} props
 * @param {string} propKey
 * @returns {string}
 */
function getFolderIdFromProps(props, propKey) {
  return DriveHelper.normalizeFolderId(props.getProperty(propKey) || "");
}

/**
 * ダイアログ用: 保存済み設定を返す。API キー文字列はクライアントに渡さない。
 * @returns {{ hasApiKey: boolean, driveReady: boolean, driveLabel: string }}
 */
function getConfigForDialog() {
  var props = getAppProperties();
  var rawKey = props.getProperty(CONFIG.PROP_GEMINI_API_KEY) || "";
  var imageId = getFolderIdFromProps(props, CONFIG.PROP_IMAGE_FOLDER);
  var slideId = getFolderIdFromProps(props, CONFIG.PROP_OUTPUT_FOLDER);
  var driveReady = !!(imageId && slideId);
  var driveLabel = driveReady
    ? (CONFIG.FOLDER_ROOT_NAME + "/" + CONFIG.FOLDER_IMAGE_NAME + " と " +
      CONFIG.FOLDER_ROOT_NAME + "/" + CONFIG.FOLDER_SLIDE_NAME)
    : "";
  return {
    hasApiKey: !!(rawKey && String(rawKey).trim()),
    driveReady: driveReady,
    driveLabel: driveLabel,
    geminiApiKeyUrl: CONFIG.GEMINI_API_KEY_URL || "https://aistudio.google.com/api-keys",
    apiKeyHowtoVideoUrl: CONFIG.API_KEY_HOWTO_VIDEO_URL || ""
  };
}

/**
 * ダイアログ用: Gemini API キーだけを User Properties に保存する（フォルダ ID は Drive 準備で保存）。
 * @param {string} apiKey - Gemini API キー
 */
function saveConfigFromDialog(apiKey) {
  var props = getAppProperties();
  var keyToSave = typeof apiKey === "string" ? apiKey.trim() : "";
  var isMasked = !keyToSave || /^\*+$/.test(keyToSave) || /^.{4}\*\*\*.{4}$/.test(keyToSave);
  if (!keyToSave || isMasked) {
    throw new Error("Gemini API Key を入力してください。");
  }
  props.setProperty(CONFIG.PROP_GEMINI_API_KEY, keyToSave);
}

/**
 * Drive 準備結果を User Properties に保存し、UI 用の表示情報を返す。
 * @param {GoogleAppsScript.Drive.Folder} imageFolder
 * @param {GoogleAppsScript.Drive.Folder} slideFolder
 * @param {boolean} recreated
 * @returns {{ success: boolean, error: string, imageFolderId: string, slideFolderId: string, driveLabel: string, recreated: boolean }}
 */
function saveTaroshotFoldersAndDescribe_(imageFolder, slideFolder, recreated) {
  var props = getAppProperties();
  props.setProperty(CONFIG.PROP_IMAGE_FOLDER, imageFolder.getId());
  props.setProperty(CONFIG.PROP_OUTPUT_FOLDER, slideFolder.getId());
  var label = CONFIG.FOLDER_ROOT_NAME + "/" + CONFIG.FOLDER_IMAGE_NAME + " と " +
    CONFIG.FOLDER_ROOT_NAME + "/" + CONFIG.FOLDER_SLIDE_NAME;
  return {
    success: true,
    error: "",
    imageFolderId: imageFolder.getId(),
    slideFolderId: slideFolder.getId(),
    driveLabel: label,
    recreated: !!recreated
  };
}

/**
 * マイドライブに タロショット/画像 と タロショット/スライド が無ければ作成し、User Properties に保存する。
 * 既存があればそれを使う（重複作成しない）。
 * @returns {{ success: boolean, error: string, imageFolderId?: string, slideFolderId?: string, driveLabel?: string, recreated?: boolean }}
 */
function ensureTaroshotFolders() {
  try {
    var root = DriveHelper.getOrCreateRootAppFolder();
    var imageFolder = DriveHelper.findOrCreateChildFolder(root, CONFIG.FOLDER_IMAGE_NAME);
    var slideFolder = DriveHelper.findOrCreateChildFolder(root, CONFIG.FOLDER_SLIDE_NAME);
    return saveTaroshotFoldersAndDescribe_(imageFolder, slideFolder, false);
  } catch (e) {
    return { success: false, error: e.message || String(e) };
  }
}

/**
 * 新しい 画像 / スライド フォルダを作り ID を上書きする。旧フォルダは残す。
 * @returns {{ success: boolean, error: string, imageFolderId?: string, slideFolderId?: string, driveLabel?: string, recreated?: boolean }}
 */
function recreateTaroshotFolders() {
  try {
    var root = DriveHelper.getOrCreateRootAppFolder();
    var imageFolder = DriveHelper.createChildFolder(root, CONFIG.FOLDER_IMAGE_NAME);
    var slideFolder = DriveHelper.createChildFolder(root, CONFIG.FOLDER_SLIDE_NAME);
    return saveTaroshotFoldersAndDescribe_(imageFolder, slideFolder, true);
  } catch (e) {
    return { success: false, error: e.message || String(e) };
  }
}

/**
 * ダイアログ用: 画像フォルダ内のファイルをすべてゴミ箱に移動する（画像登録の前に呼ぶ）。
 * @returns {{ success: boolean, error: string }}
 */
function clearImageFolderForDialog() {
  var props = getAppProperties();
  var folderId = getFolderIdFromProps(props, CONFIG.PROP_IMAGE_FOLDER);
  if (!folderId) {
    return { success: false, error: "Drive が未準備です。「Drive を準備」を押してください。" };
  }
  try {
    var folder = DriveHelper.getFolderByIdOrThrow(folderId, "画像用フォルダ");
    var files = folder.getFiles();
    while (files.hasNext()) {
      files.next().setTrashed(true);
    }
    return { success: true, error: "" };
  } catch (e) {
    return { success: false, error: e.message || String(e) };
  }
}

/**
 * ダイアログ用: 画像 1 枚を画像フォルダに保存する（Upload と同じ処理）。
 * @param {string} base64Data - Base64 エンコードされた画像データ
 * @param {string} fileName - 保存するファイル名（例: 1.png）
 * @param {string} mimeType - MIME タイプ（image/png または image/jpeg）
 */
function saveImageFromDialog(base64Data, fileName, mimeType) {
  saveImageToFolder(base64Data, fileName, mimeType);
}

/**
 * 画像を CONFIG.IMAGES_PER_REQUEST ごとに分割して Gemini を呼び、全スライドを結合して返す。
 * 2 回目以降のバッチでは「1〜N 枚目は処理済み」をプロンプトで伝える。
 * @param {string} apiKey - Gemini API キー
 * @param {string} model - モデル ID
 * @param {GoogleAppsScript.Drive.File[]} files - 画像ファイル配列（名前昇順）
 * @returns {{ success: boolean, slides?: Array<{slideNo: number, narration: string}>, error: string, statusCode?: number }}
 */
function collectSlidesFromGemini(apiKey, model, files) {
  "use strict";
  var total = files.length;
  var batchSize = (CONFIG.IMAGES_PER_REQUEST > 0 && CONFIG.IMAGES_PER_REQUEST < total)
    ? CONFIG.IMAGES_PER_REQUEST
    : total;
  var allSlides = [];
  var start;
  for (start = 0; start < total; start += batchSize) {
    var chunk = files.slice(start, start + batchSize);
    var startSlideNo = start + 1;
    var alreadyProcessedMessage = (start === 0)
      ? ""
      : "すでに 1 〜 " + start + " 枚目（slideNo 1 〜 " + start + "）は処理済みです。今回の画像だけを処理してください。";
    var prompt = Gemini.buildPromptForBatch(chunk.length, startSlideNo, total, alreadyProcessedMessage);
    var images = DriveHelper.getImageBlobsAsBase64(chunk);
    Logger.log("Gemini 送信: " + chunk.length + " 枚（slideNo " + startSlideNo + " 〜 " + (startSlideNo + chunk.length - 1) + "）");
    var result = Gemini.callGemini(apiKey, model, images, prompt);
    if (!result.success) {
      return {
        success: false,
        slides: null,
        error: result.error || "不明",
        statusCode: result.statusCode
      };
    }
    var slides = result.data && result.data.slides;
    if (!Array.isArray(slides) || slides.length === 0) {
      return { success: false, slides: null, error: "スライドが 1 件も返ってきていません。", statusCode: null };
    }
    for (var i = 0; i < slides.length; i++) {
      var item = slides[i];
      allSlides.push({
        slideNo: startSlideNo + i,
        narration: typeof item.narration === "string" ? item.narration : ""
      });
    }
  }
  allSlides.sort(function(a, b) {
    return (a.slideNo || 0) - (b.slideNo || 0);
  });
  return { success: true, slides: allSlides, error: "" };
}

/**
 * ダイアログ用: 画像→Gemini→ナレーションJSON まで（Step1）。進捗表示用に分割。
 * @returns {{ success: boolean, merged?: Object, error: string }}
 */
function runSlideGenerationStep1() {
  "use strict";
  var props = getAppProperties();
  var apiKey = props.getProperty(CONFIG.PROP_GEMINI_API_KEY);
  var imageFolderId = getFolderIdFromProps(props, CONFIG.PROP_IMAGE_FOLDER);
  var outputFolderId = getFolderIdFromProps(props, CONFIG.PROP_OUTPUT_FOLDER);

  if (!apiKey) {
    return { success: false, error: "Gemini API Key が未登録です。左側で登録してください。" };
  }
  if (!imageFolderId || !outputFolderId) {
    return { success: false, error: "Drive が未準備です。「Drive を準備」を押してください。" };
  }

  var model = props.getProperty(CONFIG.PROP_GEMINI_MODEL) || CONFIG.DEFAULT_GEMINI_MODEL;
  var files = DriveHelper.getImageFilesFromFolder(imageFolderId);
  if (!files || files.length === 0) {
    return { success: false, error: "画像が 0 枚です。画像フォルダに PNG/JPEG を入れてください。" };
  }

  Logger.log("画像 " + files.length + " 枚を Gemini に送信中… モデル=" + model);
  var collected = collectSlidesFromGemini(apiKey, model, files);
  if (!collected.success) {
    Logger.log("Gemini API エラー詳細: " + Gemini.redactSecrets(collected.error));
    return {
      success: false,
      error: "Gemini エラー: " + (collected.statusCode === 429 ? "レート制限です。しばらく後に再実行してください。" : collected.error)
    };
  }

  var allSlides = collected.slides;
  var merged = { version: 1, slides: allSlides };
  var fileName = CONFIG.OUTPUT_FILE_PREFIX + Utilities.formatDate(new Date(), "JST", CONFIG.OUTPUT_DATE_FORMAT) + ".json";
  var jsonString = JSON.stringify(merged, null, 2);
  var saved = DriveHelper.saveJsonToFolder(outputFolderId, fileName, jsonString);
  Logger.log("ナレーションJSON 保存完了。スライド " + allSlides.length + " 件。");
  return { success: true, merged: merged, jsonFileId: saved.id || "", error: "" };
}

/**
 * ダイアログ用: ナレーションJSON から新規スライドを作成（Step2）。進捗表示用に分割。
 * スライド作成成功後、その回で保存した JSON ファイルをゴミ箱に移動する。
 * @param {Object} merged - runSlideGenerationStep1 で返った merged
 * @param {string} jsonFileId - Step1 で保存した JSON のファイル ID（省略可）
 * @returns {{ success: boolean, url: string, error: string }}
 */
function runSlideGenerationStep2(merged, jsonFileId) {
  "use strict";
  if (!merged || !merged.slides || !Array.isArray(merged.slides) || merged.slides.length === 0) {
    return { success: false, url: "", error: "ナレーションデータがありません。" };
  }
  var props = getAppProperties();
  var outputFolderId = getFolderIdFromProps(props, CONFIG.PROP_OUTPUT_FOLDER);
  var imageFolderId = getFolderIdFromProps(props, CONFIG.PROP_IMAGE_FOLDER);
  if (!outputFolderId || !imageFolderId) {
    return { success: false, url: "", error: "Drive が未準備です。「Drive を準備」を押してください。" };
  }
  var slidesUrl = SlidesHelper.createNewSlidesWithNarration(merged, outputFolderId, imageFolderId);
  if (slidesUrl) {
    Logger.log("新規スライド: " + slidesUrl);
    if (jsonFileId && typeof jsonFileId === "string" && jsonFileId.trim()) {
      try {
        DriveApp.getFileById(jsonFileId.trim()).setTrashed(true);
        Logger.log("ナレーションJSON をゴミ箱に移動しました。");
      } catch (e) {
        Logger.log("JSON 削除時のログ: " + (e.message || e));
      }
    }
    return { success: true, url: slidesUrl, error: "" };
  }
  return { success: false, url: "", error: "スライドの作成に失敗しました。" };
}

/**
 * 画像フォルダ→Gemini→JSON→新規スライド作成。URL を返す（Logger 出力も行う）。
 * @returns {{ success: boolean, url: string, error: string }}
 */
function runImageToJsonAndReturnUrl() {
  "use strict";
  var props = getAppProperties();
  var apiKey = props.getProperty(CONFIG.PROP_GEMINI_API_KEY);
  var imageFolderId = getFolderIdFromProps(props, CONFIG.PROP_IMAGE_FOLDER);
  var outputFolderId = getFolderIdFromProps(props, CONFIG.PROP_OUTPUT_FOLDER);

  if (!apiKey) {
    return { success: false, url: "", error: "Gemini API Key が未登録です。左側で登録してください。" };
  }
  if (!imageFolderId || !outputFolderId) {
    return { success: false, url: "", error: "Drive が未準備です。「Drive を準備」を押してください。" };
  }

  var model = props.getProperty(CONFIG.PROP_GEMINI_MODEL) || CONFIG.DEFAULT_GEMINI_MODEL;
  var files = DriveHelper.getImageFilesFromFolder(imageFolderId);
  if (!files || files.length === 0) {
    return { success: false, url: "", error: "画像が 0 枚です。画像フォルダに PNG/JPEG を入れてください。" };
  }

  Logger.log("画像 " + files.length + " 枚を Gemini に送信中… モデル=" + model);
  var collected = collectSlidesFromGemini(apiKey, model, files);
  if (!collected.success) {
    Logger.log("Gemini API エラー詳細: " + Gemini.redactSecrets(collected.error));
    return {
      success: false,
      url: "",
      error: "Gemini エラー: " + (collected.statusCode === 429 ? "レート制限です。しばらく後に再実行してください。" : collected.error)
    };
  }

  var allSlides = collected.slides;
  var merged = { version: 1, slides: allSlides };
  var fileName = CONFIG.OUTPUT_FILE_PREFIX + Utilities.formatDate(new Date(), "JST", CONFIG.OUTPUT_DATE_FORMAT) + ".json";
  var jsonString = JSON.stringify(merged, null, 2);
  var saved = DriveHelper.saveJsonToFolder(outputFolderId, fileName, jsonString);
  Logger.log("完了。スライド " + allSlides.length + " 件。JSON保存先: " + (saved.url || ""));

  var slidesUrl = SlidesHelper.createNewSlidesWithNarration(merged, outputFolderId, imageFolderId);
  if (slidesUrl) {
    Logger.log("新規スライド: " + slidesUrl);
    if (saved.id) {
      try {
        DriveApp.getFileById(saved.id).setTrashed(true);
        Logger.log("ナレーションJSON をゴミ箱に移動しました。");
      } catch (e) {
        Logger.log("JSON 削除時のログ: " + (e.message || e));
      }
    }
    return { success: true, url: slidesUrl, error: "" };
  }
  return { success: false, url: "", error: "スライドの作成に失敗しました。" };
}

/**
 * Web アプリ入口（設計 Step 2: 本体 UI を返す）。
 * デプロイは「実行するユーザー = ウェブアプリにアクセスしているユーザー」で行うこと。
 */
function doGet() {
  return createTaroshotHtml();
}

/**
 * クライアント（Upload.html）から呼ばれる。画像 1 枚を画像フォルダに保存する。
 * @param {string} base64Data - Base64 エンコードされた画像データ
 * @param {string} fileName - 保存するファイル名（例: 1.png）
 * @param {string} mimeType - MIME タイプ（image/png または image/jpeg）
 */
function saveImageToFolder(base64Data, fileName, mimeType) {
  var props = getAppProperties();
  var folderId = getFolderIdFromProps(props, CONFIG.PROP_IMAGE_FOLDER);
  if (!folderId) {
    throw new Error("Drive が未準備です。「Drive を準備」を押してください。");
  }
  var folder = DriveHelper.getFolderByIdOrThrow(folderId, "画像用フォルダ");
  var bytes = Utilities.base64Decode(base64Data);
  var blob = Utilities.newBlob(bytes, mimeType || "image/png", fileName);
  folder.createFile(blob);
}

/**
 * エントリポイント: 画像→Gemini API→JSON（トリガー実行用）
 * 設計方針: 設計方針_画像toJSON_GAS.md
 *
 * 画像フォルダ内の画像をすべて 1 リクエストで Gemini に送り、ナレーション専用 JSON を保存する。
 * 事前に User Properties に GEMINI_API_KEY, IMAGE_FOLDER_ID, OUTPUT_FOLDER_ID を設定すること。
 */
function runImageToJson() {
  var result = runImageToJsonAndReturnUrl();
  if (!result.success) {
    Logger.log("エラー: " + result.error);
  } else if (result.url) {
    Logger.log("新規スライド（画像全面＋スピーカーノート＝Google Vids 読み上げ用）: " + result.url);
  }
}
