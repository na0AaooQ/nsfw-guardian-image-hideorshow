let model = null;
const NSFW_CLASSES = { 0: 'Drawing', 1: 'Hentai', 2: 'Neutral', 3: 'Porn', 4: 'Sexy' };

console.log('[NSFW Guardian Offscreen] 起動');

async function loadModel() {
  if (model) return model;

  tf.env().set('WASM_HAS_MULTITHREAD_SUPPORT', false);
  tf.env().set('WASM_HAS_SIMD_SUPPORT', false);

  tf.wasm.setWasmPaths({
    'tfjs-backend-wasm.wasm': chrome.runtime.getURL('models/tfjs-backend-wasm.wasm'),
    'tfjs-backend-wasm-simd.wasm': chrome.runtime.getURL('models/tfjs-backend-wasm-simd.wasm'),
    'tfjs-backend-wasm-threaded-simd.wasm': chrome.runtime.getURL('models/tfjs-backend-wasm-threaded-simd.wasm'),
  });

  await tf.setBackend('wasm');
  await tf.ready();
  console.log('[NSFW Guardian Offscreen] バックエンド:', tf.getBackend());

  const modelUrl = chrome.runtime.getURL('models/model.json');
  model = await tf.loadLayersModel(modelUrl);

  const dummy = tf.zeros([1, 224, 224, 3]);
  const warmup = model.predict(dummy);
  warmup.dispose();
  dummy.dispose();

  console.log('[NSFW Guardian Offscreen] モデルロード完了');
  chrome.runtime.sendMessage({ type: 'OFFSCREEN_READY' });
  return model;
}

loadModel().catch(e => console.error('[NSFW Guardian Offscreen] 初期化エラー:', e.message));

// ImageBitmap → Float32Array (RGB) を共通化
async function bitmapToTensor(bitmap) {
  const canvas = new OffscreenCanvas(224, 224);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, 224, 224);
  const imageData = ctx.getImageData(0, 0, 224, 224);

  const rgbData = new Float32Array(224 * 224 * 3);
  const src = imageData.data;
  for (let i = 0; i < 224 * 224; i++) {
    rgbData[i * 3 + 0] = src[i * 4 + 0] / 255;
    rgbData[i * 3 + 1] = src[i * 4 + 1] / 255;
    rgbData[i * 3 + 2] = src[i * 4 + 2] / 255;
  }
  return tf.tensor4d(rgbData, [1, 224, 224, 3]);
}

// base64 データ文字列 → Blob に変換
function base64ToBlob(base64Data) {
  const [header, data] = base64Data.split(',');
  const mimeMatch = header.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'CLASSIFY_IMAGE_OFFSCREEN') return;

  (async () => {
    try {
      const m = await loadModel();

      let bitmap;
      if (message.base64Data) {
        // blob: URL から変換された base64 データを使用
        const blob = base64ToBlob(message.base64Data);
        bitmap = await createImageBitmap(blob);
        console.log('[NSFW Guardian Offscreen] base64データから判定');
      } else {
        // 通常の https: URL を fetch
        const response = await fetch(message.imageUrl);
        const blob = await response.blob();
        bitmap = await createImageBitmap(blob);
      }

      const inputTensor = await bitmapToTensor(bitmap);
      const predTensor  = m.predict(inputTensor);
      const data        = await predTensor.data();
      inputTensor.dispose();
      predTensor.dispose();

      const predictions = Array.from(data).map((prob, i) => ({
        className: NSFW_CLASSES[i],
        probability: prob
      }));

      const pornScore   = predictions.find(p => p.className === 'Porn')?.probability   ?? 0;
      const hentaiScore = predictions.find(p => p.className === 'Hentai')?.probability ?? 0;
      const sexyScore   = predictions.find(p => p.className === 'Sexy')?.probability   ?? 0;
      const nsfwScore   = pornScore + hentaiScore + (sexyScore * 0.5);

      console.log('[NSFW Guardian Offscreen] 判定完了 score:', nsfwScore.toFixed(3));

      chrome.runtime.sendMessage({
        type: 'CLASSIFICATION_RESULT',
        requestId: message.requestId,
        nsfwScore,
        predictions
      });
    } catch (e) {
      console.error('[NSFW Guardian Offscreen] 判定エラー:', e.message);
      chrome.runtime.sendMessage({
        type: 'CLASSIFICATION_RESULT',
        requestId: message.requestId,
        nsfwScore: 0,
        error: e.message
      });
    }
  })();

  return true;
});

// ─── テスト用エクスポート ───
if (typeof module !== 'undefined') {
  // NSFWスコア計算ロジックをテスト可能な関数として公開
  function calcNsfwScore(predictions) {
    const pornScore   = predictions.find(p => p.className === 'Porn')?.probability   ?? 0;
    const hentaiScore = predictions.find(p => p.className === 'Hentai')?.probability ?? 0;
    const sexyScore   = predictions.find(p => p.className === 'Sexy')?.probability   ?? 0;
    return pornScore + hentaiScore + (sexyScore * 0.5);
  }
  module.exports = { base64ToBlob, calcNsfwScore, bitmapToTensor };
}
