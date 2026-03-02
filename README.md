# nsfw-guardian-image-hideorshow

Chrome拡張機能。  
X(旧Twitter)のDMやタイムライン上で流れてくるセンシティブ画像をAI(TensorFlow x NSFWJS)で自動検出します。  
センシティブと判定した画像はブロック表示して、ブロック画像を表示するか選択できる機能を自作しました。  
本Chrome拡張機能により、X(旧Twitter)上で、いきなり、センシティブ画像が表示されて、心理的負担が発生することを防ぎます。    

# 機能

- X(旧Twitter)のDMやタイムラインを表示した時、拡張機能にて画像をチェックし、画像のセンシティブ度合いを判定します。
- NSFWJSの画像判定で、判定閾値を超えた画像は「不適切な画像」としてブロック表示します。
- Xのブロック画像に「クリックで表示」ボタンを表示します。
- もし、ブロック画像を表示したい場合、「クリックで表示」ボタンをクリックする事で、個別に画像を表示できます。

- 以下は「不適切な画像」としてブロック表示した場合のサンプル画面。
<img width="967" height="732" alt="スクリーンショット 2026-03-01 19 14 23" src="https://github.com/user-attachments/assets/6997b281-95a8-4a7c-b6ca-8e9f039e8b2d" />

## 技術スタック

| ライブラリ | バージョン | ライセンス | 用途 |
|-----------|-----------|-----------|------|
| [TensorFlow.js Core](https://github.com/tensorflow/tfjs) | 3.21.0 | Apache 2.0 | ML推論エンジン |
| [TensorFlow.js WASM Backend](https://github.com/tensorflow/tfjs/tree/master/tfjs-backend-wasm) | 3.21.0 | Apache 2.0 | WASMバックエンド(eval不要) |
| [TensorFlow.js Layers](https://github.com/tensorflow/tfjs/tree/master/tfjs-layers) | 3.21.0 | Apache 2.0 | LayersModel読み込み |
| [TensorFlow.js Converter](https://github.com/tensorflow/tfjs/tree/master/tfjs-converter) | 3.21.0 | Apache 2.0 | GraphModel読み込み |
| [NSFWJS](https://github.com/infinitered/nsfwjs) | 2.4.2 | MIT | NSFWモデル(MobileNet v2ベース) |
| Node.js | 25.6.1 | MIT | 拡張機能の実装に利用 |

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

1. Chrome 右上のケバブメニュー(縦の三点リーダー)から「拡張機能」→「拡張機能の管理」を開く。
2. 「デベロッパーモード」をONにする。
3. 「パッケージ化されていない拡張機能を読み込む」をクリックする。
4. このリポジトリのフォルダを選択する。

## 技術的背景

### 拡張機能の処理の流れ

<img width="607" height="165" alt="スクリーンショット 2026-03-02 0 30 12" src="https://github.com/user-attachments/assets/85a5ebda-eb0b-458a-b5fb-6a01c9a96405" />

### Manifest V3 × TensorFlow.js の課題

Chrome拡張Manifest V3では Content Security Policy により `eval` および `new Function` が禁止されています。  
TensorFlow.jsのCPUバックエンドはこれらを使用するため、**WASMバックエンド**を採用し、browserifyで`eval`を含まないバンドルを生成することで対応しています。  

### Offscreen Document の活用

TensorFlow.jsの実行にはDOM環境が必要なため、Manifest V3の **Offscreen Document API** を使用してバックグラウンドでモデルを実行しています。

## 使い方

1. Chromeに拡張機能を読み込む。
2. X(旧Twitter)を開く。
3. DMやタイムラインの画像が自動的にスキャンされ、不適切な画像がブロック表示される。
4. 拡張機能のアイコンをクリックして感度を調整可能にする予定。(今後、実装予定の機能)

## 注意事項

- 本Chrome拡張機能はローカル処理のみです。画像データは、外部サーバーやシステムへ送信しません。
- 本Chrome拡張機能は、ユーザーのWebブラウザ内で画像表示を制御するものであり、Xの画像スクレイピングや自動操作をするものではございません。
  - 非APIの自動化(Xをスクリプトで操作)をするものではございません。
- WASM(WebAssembly)のマルチスレッドは無効化しているため、画像チェック時の、推論に数百ms程度かかります。
- 画像判定精度については、NSFWJSモデルの性能に依存いたします。
- 100%の精度で、センシティブ画像を判定できない可能性がございます。

## 開発者について

- **na0AaooQ（青木 直之）**
- Qiita: [https://qiita.com/na0AaooQ](https://qiita.com/na0AaooQ)

開発の詳細は Qiita の記事をご覧ください。  
👉 [TensorFlow.js × NSFWJS × Chrome拡張機能で、センシティブ画像を自動ブロックする機能を自作しました](https://qiita.com/na0AaooQ/items/128f68328497683332cb)

## License

MIT License

Copyright (c) 2025 aokinaohisa

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

