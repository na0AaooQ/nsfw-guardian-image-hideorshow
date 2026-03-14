// NSFWJSの画像判定の閾値
// 0.3   厳しめ、水着画像程度でもブロック
// 0.5   水着などの画像でもブロックされる可能性あり
// 0.65  バランス型
// 0.8   緩め、明確なセンシティブ画像だけブロック
const CONFIG = { threshold: 0.3, minImageSize: 100 };
const approvedUrls = new Set();
let isEnabled = true;
const pendingRequests = new Map();
let requestCounter = 0;

console.log('[NSFW Guardian] content.js 起動');

chrome.storage.sync.get({ enabled: true, threshold: 0.3 }, (items) => {
  isEnabled = items.enabled;
  CONFIG.threshold = items.threshold;
  console.log('[NSFW Guardian] 設定読み込み完了:', items);
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'UPDATE_SETTINGS') {
    isEnabled = message.enabled;
    CONFIG.threshold = message.threshold;
  }
  if (message.type === 'CLASSIFICATION_RESULT') {
    const handler = pendingRequests.get(message.requestId);
    if (handler) {
      handler(message);
      pendingRequests.delete(message.requestId);
    }
  }
});

function getMediaId(url) {
  // blob: URL はURLそのものをIDとして使用
  if (url.startsWith('blob:')) return url;
  const mediaPart = url.split('/media/')[1];
  if (mediaPart) return mediaPart.split('?')[0];
  try {
    const u = new URL(url);
    return u.pathname.split('/').pop() || url;
  } catch {
    return url;
  }
}

// srcset から最も解像度の高いURLを取得する
function getBestImageUrl(imgElement) {
  if (imgElement.srcset) {
    const entries = imgElement.srcset.split(',').map(s => s.trim()).filter(Boolean);
    let bestUrl = null;
    let bestScore = -1;
    for (const entry of entries) {
      const parts = entry.split(/\s+/);
      const url = parts[0];
      const descriptor = parts[1] || '1x';
      const score = parseFloat(descriptor) || 1;
      if (score > bestScore) {
        bestScore = score;
        bestUrl = url;
      }
    }
    if (bestUrl) return bestUrl;
  }
  return imgElement.src || null;
}

// blob: URL を canvas 経由で base64 に変換（content.js コンテキストなのでアクセス可能）
// imgElement はすでにロード済みなので直接 canvas に描画できる
function blobUrlToBase64(imgElement) {
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width  = imgElement.naturalWidth  || 224;
      canvas.height = imgElement.naturalHeight || 224;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(imgElement, 0, 0);  // imgElement を直接描画
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    } catch (e) {
      reject(e);
    }
  });
}

function classifyImage(imageUrl, base64Data) {
  return new Promise((resolve) => {
    const requestId = ++requestCounter;
    pendingRequests.set(requestId, resolve);
    console.log('[NSFW Guardian] 判定リクエスト送信 requestId:', requestId, imageUrl.slice(0, 60));
    chrome.runtime.sendMessage({ type: 'CLASSIFY_IMAGE', imageUrl, requestId, base64Data });
    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        resolve({ nsfwScore: 0, error: 'timeout' });
      }
    }, 15000); // blob変換分を考慮して15秒に延長
  });
}

async function checkImage(imgElement) {
  if (!isEnabled) return;
  if (imgElement.dataset.nsfwChecked === 'approved') return;

  const imageUrl = getBestImageUrl(imgElement);
  if (!imageUrl) return;

  // svg / gif はスキップ
  if (/\.svg(\?|$)/i.test(imageUrl)) return;
  if (/\.gif(\?|$)/i.test(imageUrl)) return;

  // http / blob 以外はスキップ
  const isBlobUrl = imageUrl.startsWith('blob:');
  const isHttpUrl = imageUrl.startsWith('http');
  if (!isBlobUrl && !isHttpUrl) return;

  const mediaId = getMediaId(imageUrl);
  if (approvedUrls.has(mediaId)) return;
  if (imgElement.dataset.nsfwCheckedUrl === imageUrl) return;

  imgElement.dataset.nsfwChecked    = 'true';
  imgElement.dataset.nsfwCheckedUrl = imageUrl;

  // 画像ロード完了を待つ
  await new Promise(resolve => {
    if (imgElement.complete && imgElement.naturalWidth > 0) return resolve();
    imgElement.addEventListener('load',  resolve, { once: true });
    imgElement.addEventListener('error', resolve, { once: true });
  });

  const w = imgElement.naturalWidth;
  const h = imgElement.naturalHeight;
  if (w < CONFIG.minImageSize || h < CONFIG.minImageSize) return;

  console.log('[NSFW Guardian] 画像チェック開始:', imageUrl.slice(0, 80));

  // blob: URL の場合は content.js コンテキストで base64 に変換してから送る
  let base64Data = null;
  if (isBlobUrl) {
    try {
      base64Data = await blobUrlToBase64(imgElement);
      console.log('[NSFW Guardian] blob→base64変換完了 mediaId:', mediaId);
    } catch (e) {
      console.warn('[NSFW Guardian] blob変換失敗:', e.message);
      return;
    }
  }

  const result = await classifyImage(imageUrl, base64Data);
  console.log('[NSFW Guardian] 判定結果:', result.nsfwScore?.toFixed(3), imageUrl.slice(0, 60));

  if (approvedUrls.has(mediaId)) return;

  if (result.nsfwScore > CONFIG.threshold) {
    replaceWithWarning(imgElement, result.nsfwScore, mediaId);
  }
}

function replaceWithWarning(imgElement, score, mediaId) {
  const width  = imgElement.offsetWidth  || imgElement.naturalWidth  || 200;
  const height = imgElement.offsetHeight || imgElement.naturalHeight || 200;

  const wrapper = document.createElement('div');
  wrapper.className = 'nsfw-guardian-block';
  wrapper.style.cssText = `width:${width}px;height:${height}px;`;

  wrapper.innerHTML = `
    <div class="nsfw-guardian-inner">
      <span class="nsfw-guardian-icon">🚫</span>
      <span class="nsfw-guardian-text">不適切な画像</span>
      <span class="nsfw-guardian-score">スコア: ${(score * 100).toFixed(1)}%</span>
      <button class="nsfw-guardian-btn">クリックで表示</button>
    </div>
  `;

  wrapper.querySelector('.nsfw-guardian-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    console.log('[NSFW Guardian] 承認クリック mediaId:', mediaId);
    approvedUrls.add(mediaId);
    imgElement.style.cssText = '';
    imgElement.dataset.nsfwChecked = 'approved';
    wrapper.replaceWith(imgElement);
  });

  imgElement.replaceWith(wrapper);
}

function startObserver() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      // ① 新しいノードが追加された場合
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          const images = [];
          if (node.tagName === 'IMG') images.push(node);
          node.querySelectorAll('img').forEach(img => images.push(img));
          images.forEach(img => checkImage(img));
        });
      }

      // ② 既存imgのsrc/srcset属性が変わった場合（遅延ロード対応）
      if (mutation.type === 'attributes' && mutation.target.tagName === 'IMG') {
        const img = mutation.target;
        if (img.dataset.nsfwChecked === 'approved') return;
        const newUrl = getBestImageUrl(img);
        if (newUrl && newUrl !== img.dataset.nsfwCheckedUrl) {
          delete img.dataset.nsfwChecked;
          checkImage(img);
        }
      }
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'srcset'],
  });
  console.log('[NSFW Guardian] MutationObserver 開始（属性監視あり）');
}

document.querySelectorAll('img').forEach(img => checkImage(img));
startObserver();

// ─── テスト用エクスポート（Node.js環境でのみ有効・拡張機能動作に影響なし） ───
if (typeof module !== 'undefined') {
  module.exports = {
    getMediaId, getBestImageUrl, blobUrlToBase64, replaceWithWarning, checkImage,
    // テスト用状態操作ヘルパー
    _setState: ({ enabled, threshold } = {}) => {
      if (enabled   !== undefined) isEnabled = enabled;
      if (threshold !== undefined) CONFIG.threshold = threshold;
    },
    _getState: () => ({ isEnabled, threshold: CONFIG.threshold }),
    _approvedUrls: approvedUrls,
    _resolveClassification: (requestId, result) => {
      const handler = pendingRequests.get(requestId);
      if (handler) { handler(result); pendingRequests.delete(requestId); }
    },
  };
}
