let offscreenCreated = false;
let offscreenReadyPromise = null;
let resolveOffscreenReady = null;
console.log('[NSFW Guardian BG] Service Worker 起動');

// Offscreenの準備完了を待つPromise
function getOffscreenReadyPromise() {
  if (!offscreenReadyPromise) {
    offscreenReadyPromise = new Promise(resolve => {
      resolveOffscreenReady = resolve;
    });
  }
  return offscreenReadyPromise;
}

async function ensureOffscreen() {
  if (offscreenCreated) return;
  try {
    const existing = await chrome.offscreen.hasDocument();
    if (!existing) {
      await chrome.offscreen.createDocument({
        url: chrome.runtime.getURL('offscreen.html'),
        reasons: ['DOM_SCRAPING'],
        justification: 'NSFW画像判定のためTensorFlow.jsを実行'
      });
      console.log('[NSFW Guardian BG] Offscreen Document 作成完了');
    }
    offscreenCreated = true;
  } catch (e) {
    console.error('[NSFW Guardian BG] Offscreen作成エラー:', e.message);
  }
}

const requestTabMap = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OFFSCREEN_READY') {
    console.log('[NSFW Guardian BG] Offscreen Ready!');
    if (resolveOffscreenReady) resolveOffscreenReady();
    return;
  }

  if (message.type === 'CLASSIFY_IMAGE') {
    const tabId = sender.tab?.id;
    if (tabId) requestTabMap.set(message.requestId, tabId);

    (async () => {
      await ensureOffscreen();
      // Offscreenが完全に準備完了するまで待つ
      await getOffscreenReadyPromise();
      console.log('[NSFW Guardian BG] Offscreenへ転送 requestId:', message.requestId);
      chrome.runtime.sendMessage({
        type: 'CLASSIFY_IMAGE_OFFSCREEN',
        imageUrl: message.imageUrl,
        requestId: message.requestId
      }).catch(() => {});
    })();
    return false;
  }

  if (message.type === 'CLASSIFICATION_RESULT') {
    const tabId = requestTabMap.get(message.requestId);
    requestTabMap.delete(message.requestId);
    if (tabId) {
      chrome.tabs.sendMessage(tabId, message).catch(() => {});
    } else {
      chrome.tabs.query({ url: ['https://twitter.com/*', 'https://x.com/*'] }, (tabs) => {
        tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, message).catch(() => {}));
      });
    }
  }
});

// 起動時にOffscreen作成開始
ensureOffscreen();
getOffscreenReadyPromise();
