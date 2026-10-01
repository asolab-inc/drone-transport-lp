# ドローン物資輸送 LP

株式会社ASOLAB. のドローン物資輸送サービス（DJI FlyCart 30）のランディングページ。

## 構成

```
src/
  base.css, base.js, head.html      共通のデザイントークンと土台
  sections/NN-name/section.{html,css,js}
tools/build.mjs                     セクションを index.html と assets/ にまとめる
tools/shoot.mjs                     ヘッドレスEdgeでセクションごとに検証用スクショ
tools/record-hero.mjs               ヒーロー背景動画の書き出し
tools/hero-scene/scene.js           その元になる three.js のシーン（LP本体には載せない）
images/                             Web用に最適化した実写（長辺1800px・位置情報なし）
video/                              ヒーロー背景動画と、現場で撮影した飛行映像
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

トップの映像は three.js のシーン（`tools/hero-scene/scene.js`）を
MP4 に焼き出したものです。実行時に3Dは動いていません。

```bash
node tools/record-hero.mjs                 # PC用 15秒 1280x720 → video/hero-scene.mp4
node tools/record-hero.mjs 13 780 820 480000 video/hero-scene-sp.mp4 images/hero-scene-poster-sp.jpg
```

GPUを使うヘッドレスEdgeで実時間レンダリングし、MediaRecorder（H.264）で録ります。
クリップの前後1.15秒を白にディゾルブしてあるので、loop再生しても継ぎ目が出ません。
静止画（poster）も同時に書き出します。省データ設定・視差を減らす設定の端末では、
動画を読み込まずこの静止画のままになります。
