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
  return (url.split('/media/')[1] || '').split('?')[0] || url;
}

function classifyImage(imageUrl) {
  return new Promise((resolve) => {
    const requestId = ++requestCounter;
    pendingRequests.set(requestId, resolve);
    console.log('[NSFW Guardian] 判定リクエスト送信 requestId:', requestId, imageUrl.slice(0, 60));
    chrome.runtime.sendMessage({ type: 'CLASSIFY_IMAGE', imageUrl, requestId });
    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        resolve({ nsfwScore: 0, error: 'timeout' });
      }
    }, 10000);
  });
}

async function checkImage(imgElement) {
  if (!isEnabled) return;
  if (imgElement.dataset.nsfwChecked) return;
  imgElement.dataset.nsfwChecked = 'true';

  await new Promise(resolve => {
    if (imgElement.complete && imgElement.naturalWidth > 0) return resolve();
    imgElement.addEventListener('load', resolve, { once: true });
    imgElement.addEventListener('error', resolve, { once: true });
  });

  const w = imgElement.naturalWidth;
  const h = imgElement.naturalHeight;
  if (w < CONFIG.minImageSize || h < CONFIG.minImageSize) return;

  const imageUrl = imgElement.src;
  if (!imageUrl || !imageUrl.startsWith('http')) return;
  if (/\.svg(\?|$)/i.test(imageUrl)) return;
  if (/\.gif(\?|$)/i.test(imageUrl)) return;

  const mediaId = getMediaId(imageUrl);
  if (approvedUrls.has(mediaId)) return;

  console.log('[NSFW Guardian] 画像チェック開始:', imageUrl.slice(0, 80));

  const result = await classifyImage(imageUrl);
  console.log('[NSFW Guardian] 判定結果:', result.nsfwScore?.toFixed(3), imageUrl.slice(0, 60));

  // 判定後も承認済みなら表示
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
  wrapper.style.cssText = `width:${width}px;height:${height}px;background:#1a1a2e;border:2px solid #e74c3c;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;cursor:pointer;`;

  wrapper.innerHTML = `
    <span style="font-size:2em;">🚫</span>
    <span style="color:#e74c3c;font-weight:bold;font-size:14px;">不適切な画像</span>
    <span style="color:#888;font-size:12px;">スコア: ${(score * 100).toFixed(1)}%</span>
    <button class="nsfw-guardian-btn" style="margin-top:4px;padding:6px 12px;background:#e74c3c;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;">クリックで表示</button>
  `;

  wrapper.querySelector('.nsfw-guardian-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    console.log('[NSFW Guardian] 承認クリック mediaId:', mediaId);
    approvedUrls.add(mediaId);
    // wrapperをimgに戻さず、imgを直接wrapperの位置に表示
    imgElement.style.cssText = '';
    imgElement.dataset.nsfwChecked = 'approved';
    wrapper.replaceWith(imgElement);
  });

  // imgをwrapperに置き換え（imgは非表示のままwrapper外に保持）
  imgElement.replaceWith(wrapper);
  // imgはDOMから切り離すが参照は保持
}

function startObserver() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const images = [];
        if (node.tagName === 'IMG') images.push(node);
        node.querySelectorAll('img').forEach(img => images.push(img));
        images.forEach(img => checkImage(img));
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
  console.log('[NSFW Guardian] MutationObserver 開始');
}

document.querySelectorAll('img').forEach(img => checkImage(img));
startObserver();
