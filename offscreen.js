let model = null;
const NSFW_CLASSES = { 0: 'Drawing', 1: 'Hentai', 2: 'Neutral', 3: 'Porn', 4: 'Sexy' };

console.log('[NSFW Guardian Offscreen] 起動');

async function loadModel() {
  if (model) return model;

  // マルチスレッド・SIMD無効化（blob: Worker不要にする）
  tf.env().set('WASM_HAS_MULTITHREAD_SUPPORT', false);
  tf.env().set('WASM_HAS_SIMD_SUPPORT', false);

  // シングルスレッドWASMのみ指定
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'CLASSIFY_IMAGE_OFFSCREEN') return;

  (async () => {
    try {
      const m = await loadModel();
      const response = await fetch(message.imageUrl);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);

      const canvas = new OffscreenCanvas(224, 224);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, 224, 224);
      const imageData = ctx.getImageData(0, 0, 224, 224);

      // RGB配列を手動作成（RGBA→RGB変換）
      const rgbData = new Float32Array(224 * 224 * 3);
      const src = imageData.data;
      for (let i = 0; i < 224 * 224; i++) {
        rgbData[i * 3 + 0] = src[i * 4 + 0] / 255;
        rgbData[i * 3 + 1] = src[i * 4 + 1] / 255;
        rgbData[i * 3 + 2] = src[i * 4 + 2] / 255;
      }
      const inputTensor = tf.tensor4d(rgbData, [1, 224, 224, 3]);

      const predTensor = m.predict(inputTensor);
      const data = await predTensor.data();
      inputTensor.dispose();
      predTensor.dispose();

      const predictions = Array.from(data).map((prob, i) => ({
        className: NSFW_CLASSES[i],
        probability: prob
      }));

      const pornScore   = predictions.find(p => p.className === 'Porn')?.probability ?? 0;
      const hentaiScore = predictions.find(p => p.className === 'Hentai')?.probability ?? 0;
      const sexyScore   = predictions.find(p => p.className === 'Sexy')?.probability ?? 0;
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
