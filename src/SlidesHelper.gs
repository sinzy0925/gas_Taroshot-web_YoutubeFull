/**
 * Google スライド操作: ナレーション JSON から新規プレゼンを作成し、
 * 各スライドに画像を貼り付け（高さ上限 14.3cm・縦横比維持・横中央）、スピーカーノートにナレーションを反映する。
 */
var SlidesHelper = (function() {
  "use strict";

  /**
   * スライドのスピーカーノートにテキストを設定する（Google Vids の読み上げ元）
   * @param {GoogleAppsScript.Slides.Slide} slide
   * @param {string} text
   */
  function setSlideSpeakerNotes(slide, text) {
    if (!slide || typeof text !== "string") return;
    try {
      var notesPage = slide.getNotesPage();
      var shape = notesPage.getSpeakerNotesShape();
      if (!shape) return;
      var textRange = shape.getText();
      if (textRange) {
        textRange.setText(text);
      }
    } catch (e) {
      Logger.log("スピーカーノート設定でエラー: " + (e.message || String(e)));
    }
  }

  /**
   * スライド上の既存要素をすべて削除する
   * @param {GoogleAppsScript.Slides.Slide} slide
   */
  function clearSlideElements(slide) {
    if (!slide) return;
    try {
      var elements = slide.getPageElements();
      for (var i = elements.length - 1; i >= 0; i--) {
        elements[i].remove();
      }
    } catch (e) {
      Logger.log("スライド要素削除でエラー: " + (e.message || String(e)));
    }
  }

  /** スライド幅のフォールバック（pt）。取得できないときだけ使う */
  var SLIDE_WIDTH_PT_FALLBACK = 720;

  /**
   * cm をポイントに変換する（1 in = 2.54 cm = 72 pt）
   * @param {number} cm
   * @returns {number}
   */
  function cmToPt(cm) {
    return cm * 72 / 2.54;
  }

  /**
   * 画像を縦横比のまま貼る。高さが上限超なら縮小し、横方向は中央揃え。
   * @param {GoogleAppsScript.Slides.Slide} slide
   * @param {GoogleAppsScript.Base.Blob} blob
   * @param {number} pageWidthPt - スライド幅（pt）
   */
  function setSlideImageFitted(slide, blob, pageWidthPt) {
    if (!slide || !blob) return;
    try {
      var maxHeightPt = cmToPt(CONFIG.IMAGE_MAX_HEIGHT_CM || 14.3);
      var slideWidth = pageWidthPt > 0 ? pageWidthPt : SLIDE_WIDTH_PT_FALLBACK;
      var img = slide.insertImage(blob);
      var w = img.getWidth();
      var h = img.getHeight();
      if (h > maxHeightPt) {
        var scaleH = maxHeightPt / h;
        w = w * scaleH;
        h = maxHeightPt;
      }
      if (w > slideWidth) {
        var scaleW = slideWidth / w;
        w = slideWidth;
        h = h * scaleW;
      }
      img.setWidth(w);
      img.setHeight(h);
      img.setTop(0);
      img.setLeft(Math.max(0, (slideWidth - w) / 2));
    } catch (e) {
      Logger.log("画像貼り付けでエラー: " + (e.message || String(e)));
    }
  }

  /**
   * ナレーション JSON と画像フォルダから新規 Google スライドを作成する。
   * slideNo 1 → 1.png、slideNo 2 → 2.png … を各スライドに貼り（高さ上限・横中央）、スピーカーノートにナレーションを入れる。
   * @param {{ version: number, slides: Array<{ slideNo: number, narration: string }> }} merged
   * @param {string} outputFolderId - 保存先 Drive フォルダ ID
   * @param {string} imageFolderId - 画像フォルダ ID（1.png, 2.png … が名前昇順で入っていること）
   * @returns {string} 作成したプレゼンの URL（失敗時は空文字）
   */
  function createNewSlidesWithNarration(merged, outputFolderId, imageFolderId) {
    if (!merged || !merged.slides || !Array.isArray(merged.slides) || merged.slides.length === 0) {
      Logger.log("スライド作成: ナレーションが空のためスキップしました。");
      return "";
    }
    var slidesData = merged.slides;
    var imageFiles = [];
    if (imageFolderId) {
      imageFiles = DriveHelper.getImageFilesFromFolder(imageFolderId);
      if (imageFiles.length !== slidesData.length) {
        Logger.log("スライド作成: 画像枚数(" + imageFiles.length + ")とスライド数(" + slidesData.length + ")が一致しません。");
      }
    }
    var title = Utilities.formatDate(new Date(), "JST", "yyyy-MM-dd_HH-mm") + "_YoutubeFull";
    var pres;
    try {
      pres = SlidesApp.create(title);
    } catch (e) {
      Logger.log("スライド作成エラー（create）: " + (e.message || String(e)));
      return "";
    }
    var pageWidthPt = 720;
    try {
      pageWidthPt = pres.getPageWidth();
    } catch (e) {
      pageWidthPt = SLIDE_WIDTH_PT_FALLBACK;
    }
    var firstSlide = pres.getSlides()[0];
    clearSlideElements(firstSlide);
    if (imageFiles.length > 0 && imageFiles[0]) {
      setSlideImageFitted(firstSlide, imageFiles[0].getBlob(), pageWidthPt);
    }
    setSlideSpeakerNotes(firstSlide, slidesData[0].narration || "");
    for (var i = 1; i < slidesData.length; i++) {
      var slide;
      try {
        slide = pres.appendSlide(SlidesApp.PredefinedLayout.BLANK);
      } catch (e) {
        slide = pres.appendSlide();
      }
      clearSlideElements(slide);
      if (imageFiles.length > i && imageFiles[i]) {
        setSlideImageFitted(slide, imageFiles[i].getBlob(), pageWidthPt);
      }
      setSlideSpeakerNotes(slide, slidesData[i].narration || "");
    }
    try {
      var file = DriveApp.getFileById(pres.getId());
      var folder = DriveHelper.getFolderByIdOrThrow(outputFolderId, "スライド用フォルダ");
      folder.addFile(file);
      var parents = file.getParents();
      if (parents.hasNext()) {
        parents.next().removeFile(file);
      }
    } catch (e) {
      Logger.log("スライド作成: フォルダへの移動でエラー（プレゼンは作成済み）: " + (e.message || String(e)));
    }
    var url = "https://docs.google.com/presentation/d/" + pres.getId() + "/edit";
    return url;
  }

  return {
    setSlideSpeakerNotes: setSlideSpeakerNotes,
    createNewSlidesWithNarration: createNewSlidesWithNarration
  };
})();
