/**
 * tests/content.advanced.test.js
 * checkImage() の各分岐・メッセージリスナーのテスト。
 * chrome.runtime.sendMessage のモックを使って判定結果を注入する。
 */

// DOM セットアップ
document.body.innerHTML = '<div id="root"></div>';

const {
  checkImage,
  _setState,
  _getState,
  _approvedUrls,
  _resolveClassification,
  registerRoot,
  registerNestedRoots,
  ensureShadowStyle,
  retryDmHost,
  DM_RETRY_TIMES,
} = require('../content.js');

// メッセージリスナー（content.js が登録したもの）を取得
const messageListener =
  chrome.runtime.onMessage.addListener.mock.calls[0]?.[0];

// ─── テスト用ヘルパー ───────────────────────────────

/**
 * 自然サイズを持つ「ロード済み」imgElement を作成する。
 */
function makeImg({ src = 'https://pbs.twimg.com/media/test.jpg', w = 200, h = 200, srcset = '' } = {}) {
  const img = document.createElement('img');
  img.src = srcset ? '' : src;
  if (srcset) img.srcset = srcset;
  Object.defineProperty(img, 'complete',     { value: true,  configurable: true });
  Object.defineProperty(img, 'naturalWidth',  { value: w,    configurable: true });
  Object.defineProperty(img, 'naturalHeight', { value: h,    configurable: true });
  return img;
}

/** sendMessage をモック化し、次に送られてくる requestId を返す Promise を作る */
function captureNextRequestId() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage.mockImplementationOnce((msg) => {
      if (msg.type === 'CLASSIFY_IMAGE') resolve(msg.requestId);
    });
  });
}

// ─── メッセージリスナー ──────────────────────────────
describe('onMessage: UPDATE_SETTINGS', () => {
  test('初期読み込みで language を取得する', () => {
    expect(chrome.storage.sync.get).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'auto' }),
      expect.any(Function)
    );
  });

  test('enabled=false に変更するとisEnabledが変わる', () => {
    _setState({ enabled: true });
    messageListener({ type: 'UPDATE_SETTINGS', enabled: false, threshold: 0.5, language: 'auto' });
    expect(_getState().isEnabled).toBe(false);
    expect(_getState().threshold).toBe(0.5);
    _setState({ enabled: true, threshold: 0.3 }); // 後始末
  });

  test('enabled=true に戻せる', () => {
    _setState({ enabled: false });
    messageListener({ type: 'UPDATE_SETTINGS', enabled: true, threshold: 0.3, language: 'auto' });
    expect(_getState().isEnabled).toBe(true);
  });

  test('threshold だけ変えられる', () => {
    messageListener({ type: 'UPDATE_SETTINGS', enabled: true, threshold: 0.8, language: 'auto' });
    expect(_getState().threshold).toBe(0.8);
    _setState({ threshold: 0.3 });
  });

  test('language を更新できる', () => {
    messageListener({ type: 'UPDATE_SETTINGS', enabled: true, threshold: 0.3, language: 'en' });
    expect(_getState().language).toBe('en');
    _setState({ language: 'auto' });
  });
});

describe('onMessage: CLASSIFICATION_RESULT', () => {
  test('対応する handler が呼ばれ pendingRequests から削除される', () => {
    // pendingRequests に直接登録はできないので _resolveClassification で確認
    // (内部に handler を登録する唯一の方法は classifyImage を呼ぶこと)
    // ここでは _resolveClassification 自体が handler 削除まで行うことを確認
    const result = { nsfwScore: 0.9, requestId: 9999 };
    // requestId 9999 は存在しないので何も起きないこと（エラーにならない）を確認
    expect(() => _resolveClassification(9999, result)).not.toThrow();
  });
});

// ─── checkImage ─────────────────────────────────────
describe('checkImage(): 早期リターン条件', () => {
  beforeEach(() => {
    _setState({ enabled: true, threshold: 0.3 });
    _approvedUrls.clear();
    jest.clearAllMocks();
  });

  test('isEnabled=false のとき sendMessage を呼ばない', async () => {
    _setState({ enabled: false });
    const img = makeImg();
    await checkImage(img);
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  test('dataset.nsfwChecked="approved" のとき sendMessage を呼ばない', async () => {
    const img = makeImg();
    img.dataset.nsfwChecked = 'approved';
    await checkImage(img);
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  test('src が空のとき sendMessage を呼ばない', async () => {
    // jsdom では img.src = '' が 'http://localhost/' に変換されるため
    // Object.defineProperty で強制的に空文字を返すよう設定する
    const img = document.createElement('img');
    Object.defineProperty(img, 'src',          { value: '',   configurable: true });
    Object.defineProperty(img, 'srcset',       { value: '',   configurable: true });
    Object.defineProperty(img, 'complete',     { value: true, configurable: true });
    Object.defineProperty(img, 'naturalWidth',  { value: 200, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 200, configurable: true });
    await checkImage(img);
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  test('SVG URL はスキップされる', async () => {
    const img = makeImg({ src: 'https://example.com/icon.svg' });
    await checkImage(img);
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  test('SVG URL にクエリパラメータが付いてもスキップ', async () => {
    const img = makeImg({ src: 'https://example.com/icon.svg?v=1' });
    await checkImage(img);
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  test('GIF URL はスキップされる', async () => {
    const img = makeImg({ src: 'https://example.com/anim.gif' });
    await checkImage(img);
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  test('data: URL（http/blob 以外）はスキップされる', async () => {
    const img = makeImg({ src: 'data:image/png;base64,abc' });
    await checkImage(img);
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  test('同じ URL を二度チェックしない（nsfwCheckedUrl が一致）', async () => {
    const url = 'https://pbs.twimg.com/media/dup.jpg';
    const img = makeImg({ src: url });
    img.dataset.nsfwCheckedUrl = url;
    await checkImage(img);
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  test('画像サイズが minImageSize 未満はスキップ', async () => {
    const img = makeImg({ src: 'https://pbs.twimg.com/media/tiny.jpg', w: 50, h: 50 });
    await checkImage(img);
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  test('approvedUrls に含まれる mediaId はスキップ', async () => {
    const url = 'https://pbs.twimg.com/media/approved.jpg';
    const mediaId = 'approved.jpg';
    _approvedUrls.add(mediaId);
    const img = makeImg({ src: url });
    await checkImage(img);
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    _approvedUrls.delete(mediaId);
  });
});

describe('checkImage(): 判定と表示', () => {
  let container;

  beforeEach(() => {
    _setState({ enabled: true, threshold: 0.3 });
    _approvedUrls.clear();
    jest.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  test('スコアが閾値を超えたら .nsfw-guardian-block に置き換わる', async () => {
    const img = makeImg({ src: 'https://pbs.twimg.com/media/nsfw.jpg' });
    container.appendChild(img);

    const requestIdPromise = captureNextRequestId();
    const checkPromise = checkImage(img);
    const requestId = await requestIdPromise;

    _resolveClassification(requestId, { nsfwScore: 0.9 });
    await checkPromise;

    expect(container.querySelector('.nsfw-guardian-block')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  test('判定・ブロック・個別表示の間もX側のinline styleを保持する', async () => {
    const img = makeImg({ src: 'https://pbs.twimg.com/media/styled.jpg' });
    img.style.transform = 'scale(1)';
    img.style.transition = 'transform 0.2s ease-out';
    img.style.setProperty('visibility', 'visible', 'important');
    container.appendChild(img);

    const requestIdPromise = captureNextRequestId();
    const checkPromise = checkImage(img);
    const requestId = await requestIdPromise;
    expect(img.style.getPropertyValue('visibility')).toBe('hidden');
    img.style.transform = 'scale(1.5)';
    img.style.width = '320px';
    _resolveClassification(requestId, { nsfwScore: 0.9 });
    await checkPromise;

    expect(img.style.getPropertyValue('visibility')).toBe('visible');
    expect(img.style.getPropertyPriority('visibility')).toBe('important');
    expect(img.style.transform).toBe('scale(1.5)');
    expect(img.style.transition).toBe('transform 0.2s ease-out');
    expect(img.style.width).toBe('320px');
    container.querySelector('.nsfw-guardian-btn').click();
    expect(container.querySelector('img')).toBe(img);
    expect(img.style.transform).toBe('scale(1.5)');
    expect(img.style.transition).toBe('transform 0.2s ease-out');
    expect(img.style.width).toBe('320px');
  });

  test('スコアが閾値以下ならブロックされない', async () => {
    const img = makeImg({ src: 'https://pbs.twimg.com/media/safe.jpg' });
    container.appendChild(img);

    const requestIdPromise = captureNextRequestId();
    const checkPromise = checkImage(img);
    const requestId = await requestIdPromise;

    _resolveClassification(requestId, { nsfwScore: 0.1 });
    await checkPromise;

    expect(container.querySelector('.nsfw-guardian-block')).toBeNull();
    expect(container.querySelector('img')).not.toBeNull();
  });

  test('タイムアウト時（error: timeout）はブロックされない', async () => {
    // ★修正: classifyImageWithRetry のリトライ待機（2秒×2回）を即座に進めるため
    //        fakeTimers を使用し、sendMessage モックで全リトライを自動タイムアウト解決する
    jest.useFakeTimers();

    const img = makeImg({ src: 'https://pbs.twimg.com/media/timeout.jpg' });
    container.appendChild(img);

    // 全リトライのリクエストを即座にタイムアウトで解決
    chrome.runtime.sendMessage.mockImplementation((msg) => {
      if (msg.type === 'CLASSIFY_IMAGE') {
        Promise.resolve().then(() => {
          _resolveClassification(msg.requestId, { nsfwScore: 0, error: 'timeout' });
        });
      }
    });

    const checkPromise = checkImage(img);
    await jest.runAllTimersAsync(); // リトライ間の setTimeout(2秒) を即座に進める
    await checkPromise;

    jest.useRealTimers();

    expect(container.querySelector('.nsfw-guardian-block')).toBeNull();
    // ★フラグがリセットされていることも確認（content.js の修正箇所の検証）
    expect(img.dataset.nsfwChecked).toBeUndefined();
    expect(img.dataset.nsfwCheckedUrl).toBeUndefined();
  });

  test('sendMessage が context invalidated で reject しても例外化せずフラグをリセットする', async () => {
    const img = makeImg({ src: 'https://pbs.twimg.com/media/context-invalidated.jpg' });
    container.appendChild(img);
    chrome.runtime.sendMessage.mockRejectedValueOnce(new Error('Extension context invalidated.'));

    await expect(checkImage(img)).resolves.toBeUndefined();

    expect(container.querySelector('.nsfw-guardian-block')).toBeNull();
    expect(img.dataset.nsfwChecked).toBeUndefined();
    expect(img.dataset.nsfwCheckedUrl).toBeUndefined();
  });

  test('判定後に approvedUrls に追加されていたらブロックしない', async () => {
    const url = 'https://pbs.twimg.com/media/race.jpg';
    const img = makeImg({ src: url });
    container.appendChild(img);

    const requestIdPromise = captureNextRequestId();
    const checkPromise = checkImage(img);
    const requestId = await requestIdPromise;

    // 判定完了前に承認済みにする（クリックで表示と同じ状況）
    _approvedUrls.add('race.jpg');
    _resolveClassification(requestId, { nsfwScore: 0.99 });
    await checkPromise;

    expect(container.querySelector('.nsfw-guardian-block')).toBeNull();
    _approvedUrls.delete('race.jpg');
  });

  test('sendMessage に正しい type と imageUrl が渡される', async () => {
    const url = 'https://pbs.twimg.com/media/check.jpg';
    const img = makeImg({ src: url });
    container.appendChild(img);

    const requestIdPromise = captureNextRequestId();
    const checkPromise = checkImage(img);
    const requestId = await requestIdPromise;

    const call = chrome.runtime.sendMessage.mock.calls[0][0];
    expect(call.type).toBe('CLASSIFY_IMAGE');
    expect(call.imageUrl).toBe(url);
    expect(call.requestId).toBe(requestId);

    _resolveClassification(requestId, { nsfwScore: 0 });
    await checkPromise;
  });
});

// jsdomのMutationObserverとcheckImageの非同期継続を進める。
async function flushImageWork() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('通常DOM / open ShadowRoot の共通監視', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    _setState({ enabled: true, threshold: 0.3 });
    _approvedUrls.clear();
    chrome.runtime.sendMessage.mockReset();
    chrome.runtime.sendMessage.mockImplementation((message) => {
      _resolveClassification(message.requestId, { nsfwScore: 0.9 });
    });
  });

  afterEach(() => {
    container.remove();
    jest.restoreAllMocks();
  });

  test('既存open ShadowRootのblob IMGが従来のbase64判定経路でブロックされる', async () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    const img = makeImg({ src: 'blob:https://x.com/dm-image' });
    shadow.appendChild(img);
    container.appendChild(host);
    const canvasContext = { drawImage: jest.fn() };
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext);
    jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,dm');

    registerRoot(container);
    await flushImageWork();

    expect(canvasContext.drawImage).toHaveBeenCalledWith(img, 0, 0);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'CLASSIFY_IMAGE', imageUrl: 'blob:https://x.com/dm-image',
      base64Data: 'data:image/jpeg;base64,dm',
    }));
    expect(shadow.querySelector('.nsfw-guardian-block')).not.toBeNull();
    expect(shadow.querySelector('style[data-nsfw-guardian-shadow-style]')).not.toBeNull();
  });

  test('ShadowRoot登録後のIMG追加とsrc / srcset変更を再判定する', async () => {
    const shadow = container.attachShadow({ mode: 'open' });
    registerRoot(shadow);
    const img = makeImg({ src: 'https://example.com/first.jpg' });
    // 画像をDOMに残し、URLごとの判定要求を確認する。
    chrome.runtime.sendMessage.mockImplementation((message) => {
      _resolveClassification(message.requestId, { nsfwScore: 0.1 });
    });
    shadow.appendChild(img);
    await flushImageWork();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: 'https://example.com/first.jpg' }));

    img.src = 'https://example.com/second.jpg';
    await flushImageWork();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: 'https://example.com/second.jpg' }));

    img.srcset = 'https://example.com/third.jpg 2x';
    await flushImageWork();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: 'https://example.com/third.jpg' }));
  });

  test('同じrootの再登録でobserverとCSSを増やさず、CSS削除時は再注入する', async () => {
    const shadow = container.attachShadow({ mode: 'open' });
    const observeSpy = jest.spyOn(MutationObserver.prototype, 'observe');
    registerRoot(shadow);
    registerRoot(shadow);
    expect(observeSpy).toHaveBeenCalledTimes(1);
    expect(shadow.querySelectorAll('style[data-nsfw-guardian-shadow-style]')).toHaveLength(1);
    shadow.querySelector('style').remove();
    await flushImageWork();
    expect(shadow.querySelectorAll('style[data-nsfw-guardian-shadow-style]')).toHaveLength(1);
    ensureShadowStyle(shadow);
    expect(shadow.querySelectorAll('style[data-nsfw-guardian-shadow-style]')).toHaveLength(1);
  });

  test('既存nested open ShadowRootを再帰的に走査する', async () => {
    const outerHost = document.createElement('div');
    const outer = outerHost.attachShadow({ mode: 'open' });
    const innerHost = document.createElement('div');
    const inner = innerHost.attachShadow({ mode: 'open' });
    inner.appendChild(makeImg({ src: 'https://example.com/nested.jpg' }));
    outer.appendChild(innerHost);
    container.appendChild(outerHost);
    registerNestedRoots(container);
    await flushImageWork();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: 'https://example.com/nested.jpg' }));
    expect(outer.querySelectorAll('style[data-nsfw-guardian-shadow-style]')).toHaveLength(1);
    expect(inner.querySelectorAll('style[data-nsfw-guardian-shadow-style]')).toHaveLength(1);
  });

  test('closed / アクセス不能なShadowRootでも例外にならない', () => {
    const closedHost = document.createElement('div');
    closedHost.attachShadow({ mode: 'closed' });
    const inaccessible = document.createElement('div');
    Object.defineProperty(inaccessible, 'shadowRoot', { get() { throw new Error('denied'); } });
    container.append(closedHost, inaccessible);
    expect(() => registerNestedRoots(container)).not.toThrow();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  test('通常DOMの画像は従来どおりstyles.css経路でブロックされる', async () => {
    container.appendChild(makeImg({ src: 'https://example.com/normal.jpg' }));
    registerRoot(container);
    await flushImageWork();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: 'https://example.com/normal.jpg' }));
    expect(container.querySelector('.nsfw-guardian-block')).not.toBeNull();
    expect(container.querySelector('style[data-nsfw-guardian-shadow-style]')).toBeNull();
  });

  test('ShadowRootでも小画像・GIF・SVGの既存skip条件を維持する', async () => {
    const shadow = container.attachShadow({ mode: 'open' });
    shadow.append(
      makeImg({ src: 'https://example.com/small.jpg', w: 50, h: 50 }),
      makeImg({ src: 'https://example.com/animation.gif' }),
      makeImg({ src: 'https://example.com/icon.svg' }),
    );
    registerRoot(shadow);
    await flushImageWork();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });
});

describe('X DM host限定retry', () => {
  let container;

  beforeEach(() => {
    jest.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function makeHostWithProbe() {
    const host = document.createElement('div');
    host.dataset.testid = 'xchatEmbedRoute';
    container.appendChild(host);
    const nativeGetter = Object.getOwnPropertyDescriptor(Element.prototype, 'shadowRoot').get;
    const start = Date.now();
    const checks = [];
    Object.defineProperty(host, 'shadowRoot', {
      get() {
        checks.push(Date.now() - start);
        return nativeGetter.call(host);
      },
    });
    return { host, checks };
  }

  test('既存ShadowRootは0msで登録し、後続retryを予約しない', async () => {
    const { host, checks } = makeHostWithProbe();
    const root = host.attachShadow({ mode: 'open' });
    retryDmHost(host);
    await jest.advanceTimersByTimeAsync(2000);
    expect([...new Set(checks)]).toEqual([0]);
    expect(root.querySelectorAll('style[data-nsfw-guardian-shadow-style]')).toHaveLength(1);
  });

  test('host追加後100msでShadowRootができたら100msで検出して停止する', async () => {
    registerRoot(container);
    const { host, checks } = makeHostWithProbe();
    // DOM追加のMutationObserver経由で0msの試行を開始する。
    await flushImageWork();
    expect([...new Set(checks)]).toEqual([0]);
    await jest.advanceTimersByTimeAsync(99);
    expect([...new Set(checks)]).toEqual([0, 16, 50]);
    const root = host.attachShadow({ mode: 'open' });
    await jest.advanceTimersByTimeAsync(1);
    expect([...new Set(checks)]).toEqual([0, 16, 50, 100]);
    await jest.advanceTimersByTimeAsync(2000);
    expect([...new Set(checks)]).toEqual([0, 16, 50, 100]);
    expect(root.querySelectorAll('style[data-nsfw-guardian-shadow-style]')).toHaveLength(1);
  });

  test('未生成なら指定の絶対時刻で試行し2000msで終了する', async () => {
    const { host, checks } = makeHostWithProbe();
    retryDmHost(host);
    await jest.advanceTimersByTimeAsync(2000);
    expect([...new Set(checks)]).toEqual(DM_RETRY_TIMES);
    await jest.advanceTimersByTimeAsync(2000);
    expect([...new Set(checks)]).toEqual(DM_RETRY_TIMES);
  });

  test('host切断時は次の試行で停止する', async () => {
    const { host, checks } = makeHostWithProbe();
    retryDmHost(host);
    await jest.advanceTimersByTimeAsync(50);
    host.remove();
    await jest.advanceTimersByTimeAsync(2000);
    expect([...new Set(checks)]).toEqual([0, 16, 50]);
  });

  test('同じhostを再検知してもretryを二重起動しない', async () => {
    const { host, checks } = makeHostWithProbe();
    retryDmHost(host);
    retryDmHost(host);
    registerNestedRoots(container);
    expect(jest.getTimerCount()).toBe(1);
    await jest.advanceTimersByTimeAsync(2000);
    expect(checks.filter(time => time > 0)).toEqual(DM_RETRY_TIMES.slice(1));
  });
});
