# AI-創作大賽投票系統 V3

這是一套可直接開啟使用的 HTML 靜態投票系統，適合用於：
- 校內活動
- 圖書館展示
- 攝影 / AI 藝術比賽
- 前端原型展示

## 內含頁面
- `index.html`：投票頁
- `admin.html`：作品管理後台
- `dashboard.html`：投票統計後台
- `ranking.html`：排行榜
- `wall.html`：作品展示牆
- `style.css`：整體科技風樣式
- `app.js`：系統主要邏輯

## 使用方式
1. 解壓縮後，直接雙擊 `index.html` 即可開啟。
2. 先進入 `admin.html` 新增作品。
3. 管理密碼預設為 `123456`。
4. 新增作品後，即可在 `index.html` 進行投票。
5. 可到 `dashboard.html` 查看統計與匯出 CSV。

## 目前版本限制
此版本為純前端 HTML 版：
- 資料儲存在目前使用瀏覽器的裝置中
- 不同電腦之間不會同步
- 適合測試、展示、小型單機活動

## 若要正式上線多人投票
建議下一步升級為：
- Firebase Authentication
- Firebase Firestore
- Firebase Storage
- Netlify / Firebase Hosting 部署

這樣就能做到：
- 每位使用者真正雲端登入
- 多人同時投票同步
- 防重複投票
- 雲端備份照片與票數
- 真正活動等級的後台統計
