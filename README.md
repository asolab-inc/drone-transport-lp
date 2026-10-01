# ドローン物資輸送 LP

株式会社ASOLAB. のドローン物資輸送サービス（DJI FlyCart 30）のランディングページ。

## 構成

```
src/
  base.css, base.js, head.html      共通のデザイントークンと土台
  sections/NN-name/section.{html,css,js}
tools/build.mjs                     セクションを index.html と assets/ にまとめる
tools/shoot.mjs                     ヘッドレスEdgeでセクションごとに検証用スクショ
tools/encode-hero.mjs               ヒーロー背景のクリップを飛行映像から切り出す
images/                             Web用に最適化した実写（長辺1800px・位置情報なし）
video/                              飛行映像と、そこから切り出したヒーロー用クリップ
send-drone-transport-lp.php         問い合わせフォームの送信処理（サーバーに設置して使う）
```

## 作業の手順

```bash
node tools/build.mjs          # index.html と assets/app.{css,js} を作り直す
node tools/build.mjs --only 05-cargo   # そのセクションだけのプレビューHTML
node tools/shoot.mjs          # review/latest に検証用スクショ
```

`index.html` はブラウザで直接開けます（file:// でも動きます）。

## ヒーローの背景動画

トップの映像は `video/transport-flight.mp4`（現場で撮影した吊り下げ輸送の映像）
から切り出したものです。見出しを左に置くため左右を反転し、空の広い後半を使っています。

```bash
node tools/encode-hero.mjs 43.5 8.5 1280 720 1000   # PC用 → video/hero-flight.mp4
node tools/encode-hero.mjs 43.5 8.5 780 820 680 video/hero-flight-sp.mp4 images/hero-flight-poster-sp.jpg
```

引数は 開始秒・長さ・幅・高さ・kbps・出力mp4・出力jpg。ヘッドレスEdgeで再生しながら
canvasに描き、MediaRecorder（H.264）で録ります。前後0.8秒を白にディゾルブしてあるので、
loop再生しても継ぎ目が出ません。静止画（poster）も同時に書き出します。
省データ設定・視差を減らす設定の端末では、動画を読み込まずこの静止画のままになります。

セクション「運搬を、現場作業から切り離す」で使っている飛行映像は、
元の `transport-flight.mp4` をそのまま再生しています。
