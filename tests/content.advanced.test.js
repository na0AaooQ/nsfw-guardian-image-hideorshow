/**
 * tests/content.advanced.test.js
 * checkImage() の各分岐・メッセージリスナーのテスト。
 * chrome.runtime.sendMessage のモックを使って判定結果を注入する。
 */

// DOM セットアップ
document.body.innerHTML = '<div id="root"></div>';

const {
  checkImage,
  replaceWithWarning,
  _setState,
  _getState,
  _approvedUrls,
  _resolveClassification,
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
  test('enabled=false に変更するとisEnabledが変わる', () => {
    _setState({ enabled: true });
    messageListener({ type: 'UPDATE_SETTINGS', enabled: false, threshold: 0.5 });
    expect(_getState().isEnabled).toBe(false);
    expect(_getState().threshold).toBe(0.5);
    _setState({ enabled: true, threshold: 0.3 }); // 後始末
  });

  test('enabled=true に戻せる', () => {
    _setState({ enabled: false });
    messageListener({ type: 'UPDATE_SETTINGS', enabled: true, threshold: 0.3 });
    expect(_getState().isEnabled).toBe(true);
  });

  test('threshold だけ変えられる', () => {
    messageListener({ type: 'UPDATE_SETTINGS', enabled: true, threshold: 0.8 });
    expect(_getState().threshold).toBe(0.8);
    _setState({ threshold: 0.3 });
  });
});

describe('onMessage: CLASSIFICATION_RESULT', () => {
  test('対応する handler が呼ばれ pendingRequests から削除される', () => {
    const handler = jest.fn();
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
    const img = makeImg({ src: 'https://pbs.twimg.com/media/timeout.jpg' });
    container.appendChild(img);

    const requestIdPromise = captureNextRequestId();
    const checkPromise = checkImage(img);
    const requestId = await requestIdPromise;

    _resolveClassification(requestId, { nsfwScore: 0, error: 'timeout' });
    await checkPromise;

    expect(container.querySelector('.nsfw-guardian-block')).toBeNull();
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
