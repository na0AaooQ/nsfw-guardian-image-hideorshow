// NSFWJSの画像判定の閾値
// 0.3   厳しめ、水着画像程度でもブロック
// 0.5   水着などの画像でもブロックされる可能性あり
// 0.65  バランス型
// 0.8   緩め、明確なセンシティブ画像だけブロック
const CONFIG = { threshold: 0.3, minImageSize: 100 };
const approvedUrls = new Set();
let isEnabled = true;
let currentLanguage = 'auto';
const pendingRequests = new Map();
let requestCounter = 0;
const registeredRoots = new WeakSet();
const retriedDmHosts = new WeakSet();
const DM_HOST_SELECTOR = '[data-testid="xchatEmbedRoute"]';
const DM_RETRY_TIMES = [0, 16, 50, 100, 250, 500, 1000, 2000];
const SHADOW_STYLE_MARKER = 'data-nsfw-guardian-shadow-style';

// Keep in sync with styles.css. Shadow DOM does not inherit the extension's
// document-level stylesheet.
const SHADOW_BLOCK_CSS = `
.nsfw-guardian-block {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #1a1a2e;
  border: 2px solid #e94560;
  border-radius: 12px;
  box-sizing: border-box;
  min-width: 120px;
  min-height: 120px;
  vertical-align: middle;
  cursor: default;
}
.nsfw-guardian-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px;
  text-align: center;
}
.nsfw-guardian-icon { font-size: 36px; }
.nsfw-guardian-text { color: #e94560; font-size: 13px; font-weight: bold; font-family: sans-serif; }
.nsfw-guardian-score { color: #888; font-size: 11px; font-family: sans-serif; }
.nsfw-guardian-btn {
  margin-top: 4px;
  padding: 4px 12px;
  background: transparent;
  border: 1px solid #e94560;
  border-radius: 20px;
  color: #e94560;
  font-size: 11px;
  cursor: pointer;
}
.nsfw-guardian-btn:hover { background: #e9456022; }
`;

const CONTENT_MESSAGES = {
  ja: {
    sensitiveImage: '不適切な画像',
    score: 'スコア',
    clickToShow: 'クリックで表示'
  },
  en: {
    sensitiveImage: 'Sensitive image',
    score: 'Score',
    clickToShow: 'Click to show'
  }
};

function normalizeLanguage(language) {
  return ['auto', 'ja', 'en'].includes(language) ? language : 'auto';
}

function getUILanguage() {
  if (typeof chrome === 'undefined' || !chrome.i18n) return '';
  if (typeof chrome.i18n.getUILanguage === 'function') {
    const uiLanguage = chrome.i18n.getUILanguage();
    if (uiLanguage) return uiLanguage;
  }
  if (typeof chrome.i18n.getMessage === 'function') {
    return chrome.i18n.getMessage('@@ui_locale') || '';
  }
  return '';
}

function resolveLanguage(language = currentLanguage) {
  const normalized = normalizeLanguage(language);
  if (normalized === 'ja' || normalized === 'en') return normalized;

  const uiLanguage = getUILanguage().toLowerCase().replace('_', '-');
  return uiLanguage === 'ja' || uiLanguage.startsWith('ja-') ? 'ja' : 'en';
}

function getContentMessages(language = currentLanguage) {
  return CONTENT_MESSAGES[resolveLanguage(language)] || CONTENT_MESSAGES.en;
}

console.log('[NSFW Guardian] content.js 起動');

// 設定読み込み完了後にスキャン開始（threshold確定前に動かない）
chrome.storage.sync.get({ enabled: true, threshold: 0.3, language: 'auto' }, (items) => {
  isEnabled = items.enabled;
  CONFIG.threshold = items.threshold;
  currentLanguage = normalizeLanguage(items.language);
  console.log('[NSFW Guardian] 設定読み込み完了:', items);
  startObserver();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'UPDATE_SETTINGS') {
    isEnabled = message.enabled;
    CONFIG.threshold = message.threshold;
    currentLanguage = normalizeLanguage(message.language);
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

function hideImageWhileChecking(imgElement) {
  const value = imgElement.style.getPropertyValue('visibility');
  const priority = imgElement.style.getPropertyPriority('visibility');
  imgElement.style.setProperty('visibility', 'hidden', 'important');
  return () => {
    if (value) imgElement.style.setProperty('visibility', value, priority);
    else imgElement.style.removeProperty('visibility');
  };
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
    const handleSendError = (error) => {
      if (!pendingRequests.has(requestId)) return;
      pendingRequests.delete(requestId);
      const message = error?.message || String(error);
      resolve({ nsfwScore: 0, error: message.includes('Extension context invalidated') ? 'context_invalidated' : 'send_message_failed' });
    };
    try {
      const result = chrome.runtime.sendMessage({ type: 'CLASSIFY_IMAGE', imageUrl, requestId, base64Data });
      if (result && typeof result.catch === 'function') {
        result.catch(handleSendError);
      }
    } catch (error) {
      handleSendError(error);
    }
    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        resolve({ nsfwScore: 0, error: 'timeout' });
      }
    }, 15000); // blob変換分を考慮して15秒に延長
  });
}

//  タイムアウト時に最大3回リトライ
async function classifyImageWithRetry(imageUrl, base64Data, maxRetry = 3) {
  for (let attempt = 1; attempt <= maxRetry; attempt++) {
    const result = await classifyImage(imageUrl, base64Data);
    if (!result.error) return result; // 成功
    if (result.error === 'context_invalidated' || result.error === 'send_message_failed') return result;
    console.log(`[NSFW Guardian] タイムアウト (${attempt}/${maxRetry})、2秒後にリトライ...`);
    if (attempt < maxRetry) await new Promise(r => setTimeout(r, 2000));
  }
  return { nsfwScore: 0, error: 'timeout' }; // 全リトライ失敗
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

  // 判定が完了するまで画像を非表示にする（一瞬の表示を防ぐ）
  // visibility: hidden はレイアウト上のスペースを保持したまま視覚的に隠す
  const restoreVisibility = hideImageWhileChecking(imgElement);

  // 画像ロード完了を待つ
  await new Promise(resolve => {
    if (imgElement.complete && imgElement.naturalWidth > 0) return resolve();
    imgElement.addEventListener('load',  resolve, { once: true });
    imgElement.addEventListener('error', resolve, { once: true });
  });

  const w = imgElement.naturalWidth;
  const h = imgElement.naturalHeight;
  if (w < CONFIG.minImageSize || h < CONFIG.minImageSize) {
    // 小さい画像はスキップ → 表示を戻す
    restoreVisibility();
    return;
  }

  console.log('[NSFW Guardian] 画像チェック開始:', imageUrl.slice(0, 80));

  // blob: URL の場合は content.js コンテキストで base64 に変換してから送る
  let base64Data = null;
  if (isBlobUrl) {
    try {
      base64Data = await blobUrlToBase64(imgElement);
      console.log('[NSFW Guardian] blob→base64変換完了 mediaId:', mediaId);
    } catch (e) {
      console.warn('[NSFW Guardian] blob変換失敗:', e.message);
      // 変換失敗時は表示を戻す
      restoreVisibility();
      return;
    }
  }

  const result = await classifyImageWithRetry(imageUrl, base64Data); // リトライ付き関数を使用
  console.log('[NSFW Guardian] 判定結果:', result.nsfwScore?.toFixed(3), imageUrl.slice(0, 60));

  // エラー時はフラグをリセットして再チェック可能にする
  if (result.error) {
    if (result.error !== 'context_invalidated') {
      console.warn('[NSFW Guardian] 判定エラー → フラグリセット:', imageUrl.slice(0, 60));
    }
    delete imgElement.dataset.nsfwChecked;
    delete imgElement.dataset.nsfwCheckedUrl;
    // タイムアウト時は表示を戻す（非表示のまま放置しない）
    restoreVisibility();
    return;
  }

  if (approvedUrls.has(mediaId)) {
    // 判定中にユーザーが承認した場合は表示を戻す
    restoreVisibility();
    return;
  }

  if (result.nsfwScore > CONFIG.threshold) {
    // ブロック前に、この拡張機能が変更した visibility だけを戻す
    restoreVisibility();
    replaceWithWarning(imgElement, result.nsfwScore, mediaId);
  } else {
    // 安全な画像 → 表示を戻す
    restoreVisibility();
  }
}

function replaceWithWarning(imgElement, score, mediaId) {
  const width  = imgElement.offsetWidth  || imgElement.naturalWidth  || 200;
  const height = imgElement.offsetHeight || imgElement.naturalHeight || 200;
  const messages = getContentMessages(currentLanguage);

  const wrapper = document.createElement('div');
  wrapper.className = 'nsfw-guardian-block';
  wrapper.style.cssText = `width:${width}px;height:${height}px;`;

  wrapper.innerHTML = `
    <div class="nsfw-guardian-inner">
      <span class="nsfw-guardian-icon">🚫</span>
      <span class="nsfw-guardian-text">${messages.sensitiveImage}</span>
      <span class="nsfw-guardian-score">${messages.score}: ${(score * 100).toFixed(1)}%</span>
      <button class="nsfw-guardian-btn">${messages.clickToShow}</button>
    </div>
  `;

  wrapper.querySelector('.nsfw-guardian-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    console.log('[NSFW Guardian] 承認クリック mediaId:', mediaId);
    approvedUrls.add(mediaId);
    imgElement.dataset.nsfwChecked = 'approved';
    wrapper.replaceWith(imgElement);
  });

  imgElement.replaceWith(wrapper);
}

function isShadowRoot(root) {
  return typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot;
}

function getOpenShadowRoot(element) {
  try {
    return element.shadowRoot || null;
  } catch {
    return null;
  }
}

function ensureShadowStyle(root) {
  if (!isShadowRoot(root)) return;
  const hasStyle = Array.from(root.childNodes).some(node =>
    node.nodeType === Node.ELEMENT_NODE && node.tagName === 'STYLE' && node.hasAttribute(SHADOW_STYLE_MARKER)
  );
  if (hasStyle) return;
  const style = document.createElement('style');
  style.setAttribute(SHADOW_STYLE_MARKER, '');
  style.textContent = SHADOW_BLOCK_CSS;
  root.appendChild(style);
}

function scanImages(root) {
  root.querySelectorAll('img').forEach(checkImage);
}

function retryDmHost(host) {
  if (retriedDmHosts.has(host)) return;
  retriedDmHosts.add(host);
  const startedAt = Date.now();

  function checkAt(index) {
    if (!host.isConnected) return;
    const shadowRoot = getOpenShadowRoot(host);
    if (shadowRoot) {
      registerRoot(shadowRoot);
      return;
    }
    if (index + 1 < DM_RETRY_TIMES.length) {
      const delay = Math.max(0, DM_RETRY_TIMES[index + 1] - (Date.now() - startedAt));
      setTimeout(() => checkAt(index + 1), delay);
    }
  }

  checkAt(0);
}

function registerNestedRoots(root) {
  const elements = root.nodeType === Node.ELEMENT_NODE
    ? [root, ...root.querySelectorAll('*')]
    : root.querySelectorAll('*');
  for (const element of elements) {
    const shadowRoot = getOpenShadowRoot(element);
    if (shadowRoot) registerRoot(shadowRoot);
    if (element.matches(DM_HOST_SELECTOR)) retryDmHost(element);
  }
}

function processAddedNode(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  if (node.tagName === 'IMG') checkImage(node);
  scanImages(node);
  registerNestedRoots(node);
}

function observeRoot(root) {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(processAddedNode);
      }
      if (mutation.type === 'attributes' && mutation.target.tagName === 'IMG') {
        const img = mutation.target;
        if (img.dataset.nsfwChecked === 'approved') continue;
        const newUrl = getBestImageUrl(img);
        if (newUrl && newUrl !== img.dataset.nsfwCheckedUrl) {
          delete img.dataset.nsfwChecked;
          checkImage(img);
        }
      }
    }
    if (isShadowRoot(root)) ensureShadowStyle(root);
  });
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'srcset'],
  });
}

function registerRoot(root) {
  if (registeredRoots.has(root)) {
    if (isShadowRoot(root)) ensureShadowStyle(root);
    return;
  }
  registeredRoots.add(root);
  observeRoot(root);
  if (isShadowRoot(root)) ensureShadowStyle(root);
  scanImages(root);
  registerNestedRoots(root);
}

function startObserver() {
  registerRoot(document.body);
  console.log('[NSFW Guardian] MutationObserver 開始（属性監視あり）');
}

// ─── テスト用エクスポート（Node.js環境でのみ有効・拡張機能動作に影響なし） ───
if (typeof module !== 'undefined') {
  module.exports = {
    getMediaId, getBestImageUrl, blobUrlToBase64, replaceWithWarning, checkImage,
    resolveLanguage, getContentMessages,
    registerRoot, registerNestedRoots, ensureShadowStyle, retryDmHost,
    hideImageWhileChecking, DM_RETRY_TIMES,
    // テスト用状態操作ヘルパー
    _setState: ({ enabled, threshold, language } = {}) => {
      if (enabled   !== undefined) isEnabled = enabled;
      if (threshold !== undefined) CONFIG.threshold = threshold;
      if (language  !== undefined) currentLanguage = normalizeLanguage(language);
    },
    _getState: () => ({ isEnabled, threshold: CONFIG.threshold, language: currentLanguage }),
    _approvedUrls: approvedUrls,
    _resolveClassification: (requestId, result) => {
      const handler = pendingRequests.get(requestId);
      if (handler) { handler(result); pendingRequests.delete(requestId); }
    },
  };
}
