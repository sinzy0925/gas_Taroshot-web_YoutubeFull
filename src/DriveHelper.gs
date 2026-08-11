/**
 * Drive 操作: 画像フォルダから画像一覧取得、バッチサイズチェック、JSON 保存
 * 設計方針: 設計方針_画像toJSON_GAS.md
 */
var DriveHelper = (function() {
  "use strict";

  /**
   * フォルダ ID を正規化する（URL 全体が貼られていても ID 部分だけ取り出す）
   * @param {string} raw
   * @returns {string}
   */
  function normalizeFolderId(raw) {
    if (!raw || typeof raw !== "string") return "";
    var id = raw.trim();
    if (!id) return "";
    // https://drive.google.com/drive/folders/ID?usp=sharing
    // https://drive.google.com/drive/u/0/folders/ID
    var m = id.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (m && m[1]) return m[1];
    // https://drive.google.com/open?id=ID
    m = id.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m && m[1]) return m[1];
    return id.replace(/\/+$/, "");
  }

  /**
   * フォルダ ID から Folder を取得。失敗時は原因が分かる日本語メッセージを投げる。
   * @param {string} folderId
   * @param {string} label - エラー表示用（例: "画像用フォルダ"）
   * @returns {GoogleAppsScript.Drive.Folder}
   */
  function getFolderByIdOrThrow(folderId, label) {
    var name = label || "フォルダ";
    var normalized = normalizeFolderId(folderId);
    if (!normalized) {
      throw new Error(name + " が未準備です。「Drive を準備」を押してください。");
    }
    try {
      return DriveApp.getFolderById(normalized);
    } catch (e) {
      throw new Error(
        name + " にアクセスできません（ID: " + normalized + "）。" +
        " フォルダの削除・共有権限（編集可）・別アカウントのフォルダでないか確認してください。"
      );
    }
  }

  /**
   * 画像フォルダ内の PNG/JPEG をファイル名昇順で取得（MAX_IMAGE_COUNT が 1 以上のときのみ上限適用）
   * @param {string} folderId - フォルダ ID
   * @returns {GoogleAppsScript.Drive.File[]} ファイルの配列（名前昇順）
   */
  function getImageFilesFromFolder(folderId) {
    var folder = getFolderByIdOrThrow(folderId, "画像用フォルダ");
    var files = folder.getFiles();
    var extList = CONFIG.IMAGE_EXTENSIONS;
    var list = [];
    while (files.hasNext()) {
      var file = files.next();
      var name = file.getName();
      var ext = name.indexOf(".") >= 0 ? name.split(".").pop().toLowerCase() : "";
      if (extList.indexOf(ext) !== -1) list.push(file);
    }
    list.sort(function(a, b) {
      return a.getName().localeCompare(b.getName(), undefined, { numeric: true });
    });
    if (typeof CONFIG.MAX_IMAGE_COUNT === "number" && CONFIG.MAX_IMAGE_COUNT > 0) {
      return list.slice(0, CONFIG.MAX_IMAGE_COUNT);
    }
    return list;
  }

  /**
   * 複数ファイルの Blob を取得し、base64 と MIME の配列を返す
   * @param {GoogleAppsScript.Drive.File[]} files - ファイル配列
   * @returns {{ base64: string, mimeType: string }[]}
   */
  function getImageBlobsAsBase64(files) {
    var out = [];
    for (var i = 0; i < files.length; i++) {
      var blob = files[i].getBlob();
      var mime = blob.getContentType();
      if (mime !== "image/png" && mime !== "image/jpeg") {
        mime = "image/png";
      }
      out.push({
        base64: Utilities.base64Encode(blob.getBytes()),
        mimeType: mime
      });
    }
    return out;
  }

  /**
   * 1バッチ分のファイルの合計サイズ（バイト）を返す
   * @param {GoogleAppsScript.Drive.File[]} files - 対象ファイル
   * @returns {number}
   */
  function getBatchTotalBytes(files) {
    var total = 0;
    for (var i = 0; i < files.length; i++) {
      total += files[i].getSize();
    }
    return total;
  }

  /**
   * 指定フォルダに JSON 文字列を新規ファイルとして保存
   * @param {string} folderId - 保存先フォルダ ID
   * @param {string} fileName - ファイル名（拡張子含む）
   * @param {string} jsonString - UTF-8 の JSON 文字列
   * @returns {{ url: string, id: string }} 作成したファイルの URL とファイル ID
   */
  /**
   * 親フォルダ直下で同名フォルダを探す。無ければ作成する。
   * @param {GoogleAppsScript.Drive.Folder} parent
   * @param {string} name
   * @returns {GoogleAppsScript.Drive.Folder}
   */
  function findOrCreateChildFolder(parent, name) {
    var it = parent.getFoldersByName(name);
    if (it.hasNext()) return it.next();
    return parent.createFolder(name);
  }

  /**
   * 親フォルダ直下に同名でも新規フォルダを作る（再作成用。旧フォルダは残す）。
   * @param {GoogleAppsScript.Drive.Folder} parent
   * @param {string} name
   * @returns {GoogleAppsScript.Drive.Folder}
   */
  function createChildFolder(parent, name) {
    return parent.createFolder(name);
  }

  /**
   * マイドライブ直下の「タロショット」を探すか作成する。
   * @returns {GoogleAppsScript.Drive.Folder}
   */
  function getOrCreateRootAppFolder() {
    return findOrCreateChildFolder(DriveApp.getRootFolder(), CONFIG.FOLDER_ROOT_NAME);
  }

  function saveJsonToFolder(folderId, fileName, jsonString) {
    var folder = getFolderByIdOrThrow(folderId, "スライド用フォルダ");
    var blob = Utilities.newBlob(jsonString, "application/json", fileName);
    var file = folder.createFile(blob);
    return { url: file.getUrl(), id: file.getId() };
  }

  return {
    normalizeFolderId: normalizeFolderId,
    getFolderByIdOrThrow: getFolderByIdOrThrow,
    getImageFilesFromFolder: getImageFilesFromFolder,
    getImageBlobsAsBase64: getImageBlobsAsBase64,
    getBatchTotalBytes: getBatchTotalBytes,
    saveJsonToFolder: saveJsonToFolder,
    findOrCreateChildFolder: findOrCreateChildFolder,
    createChildFolder: createChildFolder,
    getOrCreateRootAppFolder: getOrCreateRootAppFolder
  };
})();
