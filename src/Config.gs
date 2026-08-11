/**
 * 0808
 * 定数・既定値（画像→Gemini API→JSON）
 * 設計方針: 設計方針_画像toJSON_GAS.md
 * YouTube 動画用ナレーション専用。Gemini 3.1 / 2.5 Pro Preview 想定。
 */
var CONFIG = {
  /** テンプレートスライドのプレゼンテーション ID（JSON を反映するときなどに使用） */
  TEMPLATE_PRESENTATION_ID: "1UP2Uclvs7hEkWNWqTzyBGWQxIKwfeiiLNUAt_wAsy9o",
  /** 画像の最大枚数（0 以下は無制限） */
  MAX_IMAGE_COUNT: 0,
  /** 1 回の API コールで送る最大画像枚数（0 または画像総数以上で分割しない＝1回で全送信） */
  IMAGES_PER_REQUEST: 10,
  /** パース失敗時のリトライ回数 */
  PARSE_RETRY_COUNT: 2,
  /** パース失敗時のリトライ間隔（ミリ秒） */
  PARSE_RETRY_MS: 3000,
  /** 許可する画像拡張子（小文字） */
  IMAGE_EXTENSIONS: ["png", "jpg", "jpeg"],
  /** マイドライブ直下に自動作成するフォルダ名（設計 Step 4） */
  FOLDER_ROOT_NAME: "タロショット",
  FOLDER_IMAGE_NAME: "画像",
  FOLDER_SLIDE_NAME: "スライド",
  /** User Properties のキー（利用者ごとに分離） */
  PROP_GEMINI_API_KEY: "GEMINI_API_KEY",
  PROP_IMAGE_FOLDER: "IMAGE_FOLDER_ID",
  PROP_OUTPUT_FOLDER: "OUTPUT_FOLDER_ID",
  PROP_GEMINI_MODEL: "GEMINI_MODEL",
  /** 既定の Gemini モデル（AI Studio の「Gemini 2.5 Pro Preview」「Gemini 3.1 Pro Preview」等。利用可能な ID は AI Studio で確認し、必要なら GEMINI_MODEL で上書き） */
  DEFAULT_GEMINI_MODEL: "gemini-3.5-flash-lite",
  /** Gemini API Key 取得ページ（「GeminiAPIKey取得」ボタン） */
  GEMINI_API_KEY_URL: "https://aistudio.google.com/api-keys",
  /** 取得方法確認動画の URL。空のときはボタン押下時に案内のみ。後で YouTube 等を入れる */
  API_KEY_HOWTO_VIDEO_URL: "",
  /** スライド上の画像の高さ上限（cm）。これを超える場合は縦横比を保って縮小する */
  IMAGE_MAX_HEIGHT_CM: 14.3,
  /** 保存ファイル名のプレフィックス */
  OUTPUT_FILE_PREFIX: "ナレーションJSON_",
  /** 保存ファイル名の日付フォーマット（JST） */
  OUTPUT_DATE_FORMAT: "yyyy-MM-dd_HH-mm"
};
