# Google Drive（Drive File Stream）を手動で削除する手順

再起動しても「部分的に削除されている以前のインストールが検出されました」と出る場合、残っているフォルダ・サービスを手動で片付ける。

---

## 手順（管理者で実行）

### 1. PowerShell を管理者で開く

- スタートメニューで「PowerShell」または「ターミナル」を右クリック → **管理者として実行**

### 2. Google のサービスを止める

```powershell
Stop-Service -Name "GoogleDriveFS" -ErrorAction SilentlyContinue
Stop-Service -Name "GDriveFS" -ErrorAction SilentlyContinue
Stop-Process -Name "GoogleDriveFS" -Force -ErrorAction SilentlyContinue
Stop-Process -Name "Google Drive" -Force -ErrorAction SilentlyContinue
```

### 3. ドライバーをアンロードする（あれば）

```powershell
sc.exe stop GoogleDriveFS
```

### 4. フォルダを削除する

```powershell
Remove-Item -Path "C:\Program Files\Google\Drive File Stream" -Recurse -Force
```

ここでも「アクセスが拒否されました」になる場合は、**5** に進む。

### 5. 所有権を取得してから削除する

```powershell
takeown /f "C:\Program Files\Google\Drive File Stream\Drivers\31931\googledrivefs31931.sys" /a
icacls "C:\Program Files\Google\Drive File Stream\Drivers\31931\googledrivefs31931.sys" /grant Administrators:F
Remove-Item -Path "C:\Program Files\Google\Drive File Stream" -Recurse -Force
```

ドライバーがまだ使用中で削除できない場合は、**6** を試す。

### 6. セーフモードで削除する

1. **設定** → **システム** → **回復** → **今すぐ再起動する**（高度な起動）
2. **トラブルシューティング** → **詳細オプション** → **起動設定** → **再起動**
3. **セーフモードとネットワーク**（番号 5 または 6）を選んで起動
4. セーフモードでエクスプローラーを開き、`C:\Program Files\Google\Drive File Stream` を削除。または、管理者 PowerShell で再度 `Remove-Item ... -Recurse -Force` を実行
5. 通常起動で再起動

---

## その他の残りフォルダ（任意）

以下も残っていれば削除する。

- `C:\Program Files (x86)\Google\Drive File Stream\`
- `C:\Program Files\Google\Drive for desktop\`
- `%LocalAppData%\Google\DriveFS\`（エクスプローラーで `%LocalAppData%\Google` を開く）
- `%AppData%\Google\Drive for desktop\`（`%AppData%\Google` を開く）

---

## 削除後

PC を再起動してから、[Google Drive for desktop](https://www.google.com/drive/download/) のインストーラーで再インストールする。
