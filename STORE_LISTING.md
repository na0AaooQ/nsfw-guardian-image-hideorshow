# Chrome Web Store 掲載用テキスト

---

## 拡張機能名
がぞうみまもり | Xセンシティブ画像フィルター

---

## 短い説明文（132文字以内・manifest.json の description と同じ）
X（旧Twitter）のタイムライン、DMのセンシティブ画像をAIで自動検出してブロックする機能です。クリックで個別にブロックした画像を表示でき、ブロック感度も調整可能です。画像データは外部送信しません。

---

## 詳細説明文（日本語）

### X（旧Twitter）で、突然センシティブな画像が目に入ってしまった経験はありませんか？

「がぞうみまもり」は、X（旧Twitter）のタイムラインやDMに表示されるセンシティブ画像を AI が自動で検出・ブロックするChrome拡張機能です。

「強制的に画像を遮断するのではなく、そっと寄り添って守る」をコンセプトに、あなたのペースで安心して X を使えるようサポートします。

---

### 主な機能

🛡️ **自動ブロック**
X（旧Twitter）のタイムライン、DMに不意に流れてくるセンシティブ画像をリアルタイムで判定し、自動的にブロック表示します。

👁️ **クリックで個別表示**
ブロックされた画像でも「クリックで表示」ボタンを押すことで、1枚ずつ自分で画像を確認できます。

🎚️ **感度調整（3段階）**
拡張機能のアイコンから感度を調整できます。
- 厳しめ（30〜45%）：水着・露出度の高い画像もブロック
- バランス（50〜70%）：明らかにセンシティブな画像をブロック
- 緩め（75〜90%）：非常に露骨な画像のみブロック

🔒 **完全ローカル処理**
画像データは外部サーバーへ一切送信しません。すべての AI 判定はあなたのChromeブラウザ内で完結します。

---

### 技術仕様

- AI モデル：NSFWJS（MobileNet v2 ベース）
- 推論エンジン：TensorFlow.js（WASM バックエンド）
- 対応範囲：タイムライン・DM（blob: URL 形式の添付画像を含む）
- Manifest V3 準拠

---

### プライバシーについて

収集する個人情報はありません。画像データの外部送信もありません。
詳しくは[プライバシーポリシー](https://na0aaooq.github.io/nsfw-guardian-image-hideorshow/privacy-policy.html)をご確認ください。

---

## 詳細説明文（英語）

### Have you ever been surprised by sensitive images suddenly appearing on X (Twitter)?

"Gazou Mimamori" is a Chrome extension that automatically detects and blocks sensitive images appearing in your X (Twitter) timeline and DMs using AI.

Our concept: "Not forceful blocking, but gently watching over you" — so you can use X at your own pace, comfortably and safely.

---

### Key Features

🛡️ **Automatic Blocking**
Sensitive images in your timeline and DMs are detected in real-time and automatically blocked.

👁️ **View on Click**
Even blocked images can be revealed one by one by clicking the "Show image" button.

🎚️ **3-Level Sensitivity**
Adjust sensitivity from the extension icon:
- Strict (30–45%): Blocks swimwear and revealing images
- Balanced (50–70%): Blocks clearly sensitive images
- Lenient (75–90%): Blocks only explicitly graphic content

🔒 **Fully Local Processing**
Image data is never sent to any external server. All AI inference runs entirely within your browser.

---

### Privacy

No personal information is collected. No image data is transmitted externally.
See our [Privacy Policy](https://na0aaooq.github.io/nsfw-guardian-image-hideorshow/privacy-policy.html) for details.

---

## カテゴリ（Chrome Web Store 申請時の選択）
- **主カテゴリ**：Productivity（生産性）
- **副カテゴリ**：Social Networking（ソーシャルネットワーク）

---

## ウェブサイト URL（Developer Dashboard 入力欄）
https://na0aaooq.github.io/nsfw-guardian-image-hideorshow/privacy-policy.html

---

## プライバシーポリシー URL（Developer Dashboard 入力欄）
https://na0aaooq.github.io/nsfw-guardian-image-hideorshow/privacy-policy.html
