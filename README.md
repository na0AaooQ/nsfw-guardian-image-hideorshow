# nsfw-guardian-image-hideorshow

Chrome拡張機能。
X（旧Twitter）のタイムラン上で流れてくるセンシティブ画像を自動検出し、非表示/表示を切り替えることができます。
これにより、いきなり、センシティブ画像が表示されて、びっくりしてしまう事を防ぎます。

# 機能

- X (Twitter) のタイムラインを監視し、画像をリアルタイムで判定
- NSFWスコアが閾値を超えた画像を「不適切な画像」としてブロック表示
- Xのブロック画像下に「クリックで表示」ボタンを表示
- 「クリックで表示」ボタンをクリックする事で、個別に画像表示可能

## 技術スタック

| ライブラリ | バージョン | ライセンス | 用途 |
|-----------|-----------|-----------|------|
| [TensorFlow.js Core](https://github.com/tensorflow/tfjs) | 3.x | Apache 2.0 | ML推論エンジン |
| [TensorFlow.js WASM Backend](https://github.com/tensorflow/tfjs/tree/master/tfjs-backend-wasm) | 3.x | Apache 2.0 | WASMバックエンド（eval不要） |
| [TensorFlow.js Layers](https://github.com/tensorflow/tfjs/tree/master/tfjs-layers) | 3.x | Apache 2.0 | LayersModel読み込み |
| [TensorFlow.js Converter](https://github.com/tensorflow/tfjs/tree/master/tfjs-converter) | 3.x | Apache 2.0 | GraphModel読み込み |
| [NSFWJS](https://github.com/infinitered/nsfwjs) | - | MIT | NSFWモデル（MobileNet v2ベース） |

## ライセンスについて

本プロジェクトは以下のオープンソースライブラリを使用しています。

### TensorFlow.js
Copyright 2018 Google LLC  
Licensed under the Apache License, Version 2.0  
https://github.com/tensorflow/tfjs/blob/master/LICENSE

### NSFWJS
Copyright (c) 2019 Infinite Red, Inc.  
Licensed under the MIT License  
https://github.com/infinitered/nsfwjs/blob/master/LICENSE

本リポジトリ自体のコードは MIT License で公開します。  
ただし、`models/` ディレクトリ内のモデルファイルおよびバンドルファイルは上記ライセンスに従います。

## ファイル構成

```
nsfw-guardian-image-hideorshow/
├── manifest.json          # Chrome拡張 Manifest V3
├── background.js          # Service Worker（Offscreen管理・メッセージルーティング）
├── offscreen.html         # Offscreen Document（TF.js実行環境）
├── offscreen.js           # TF.js初期化・画像推論処理
├── content.js             # X画面の画像監視・ブロック表示
├── popup.html             # ポップアップUI
├── popup.js               # ポップアップ設定保存
├── styles.css             # ブロック表示スタイル
├── entry_wasm.js          # browserifyバンドル用エントリーポイント
├── models/
│   ├── tf-wasm-bundle.js              # browserifyバンドル（TF.js WASM）
│   ├── model.json                     # NSFWJSモデル定義
│   ├── group1-shard1of1.bin           # NSFWJSモデル重み
│   ├── tfjs-backend-wasm.wasm         # WASMバイナリ（シングルスレッド）
│   ├── tfjs-backend-wasm-simd.wasm    # WASMバイナリ（SIMD）
│   └── tfjs-backend-wasm-threaded-simd.wasm  # WASMバイナリ（マルチスレッド）
└── icons/
```

## セットアップ

### 前提条件

- Node.js 16以上
- npm

### バンドルの再生成

Manifest V3のCSP制約（`eval`禁止）に対応するため、TensorFlow.jsをbrowserifyでバンドルしています。

```bash
# 依存関係インストール
npm install @tensorflow/tfjs-core @tensorflow/tfjs-backend-wasm @tensorflow/tfjs-layers @tensorflow/tfjs-converter browserify

# バンドル生成
npx browserify entry_wasm.js --standalone tf -o models/tf-wasm-bundle.js

# Worker無効化パッチ（CSP対応）
node -e "
const fs = require('fs');
let code = fs.readFileSync('models/tf-wasm-bundle.js', 'utf8');
code = code.replace(
  /new Worker\(([^)]+)\)/g,
  '{addEventListener:function(){},postMessage:function(){},terminate:function(){},onerror:null,onmessage:null}'
);
fs.writeFileSync('models/tf-wasm-bundle.js', code);
console.log('new Function:', (code.match(/new Function/g)||[]).length, '/ new Worker:', (code.match(/new Worker/g)||[]).length);
"
```

### Chromeへの読み込み

1. Chrome で `chrome://extensions` を開く
2. 「デベロッパーモード」をONにする
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. このリポジトリのフォルダを選択

## 技術的背景

### Manifest V3 × TensorFlow.js の課題

Chrome拡張Manifest V3では Content Security Policy により `eval` および `new Function` が完全に禁止されています。TensorFlow.jsのCPUバックエンドはこれらを使用するため、**WASMバックエンド**を採用し、browserifyで`eval`を含まないバンドルを生成することで対応しています。

### Offscreen Document の活用

TensorFlow.jsの実行にはDOM環境が必要なため、Manifest V3の **Offscreen Document API** を使用してバックグラウンドでモデルを実行しています。

## 使い方

1. Chromeに拡張機能を読み込む
2. X (Twitter) を開く
3. タイムラインの画像が自動的にスキャンされ、不適切な画像がブロック表示される
4. 拡張機能アイコンをクリックして感度を調整可能

## 注意事項

- 本拡張機能はローカル処理のみ（画像データは外部送信しません）
- WASMのマルチスレッドは無効化しているため、推論に数百ms程度かかります
- 判定精度はNSFWJSモデルの性能に依存します

## License

MIT License

Copyright (c) 2025 aokinaohisa

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

