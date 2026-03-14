/**
 * tests/offscreen.advanced.test.js
 * bitmapToTensor・CLASSIFY_IMAGE_OFFSCREEN ハンドラーのテスト。
 */

global.tf = {
  env: jest.fn(() => ({ set: jest.fn() })),
  wasm: { setWasmPaths: jest.fn() },
  setBackend: jest.fn().mockResolvedValue(true),
  ready: jest.fn().mockResolvedValue(true),
  getBackend: jest.fn(() => 'wasm'),
  loadLayersModel: jest.fn().mockResolvedValue({
    predict: jest.fn(() => ({
      data: jest.fn().mockResolvedValue(
        new Float32Array([0.05, 0.60, 0.10, 0.20, 0.05]) // Porn=0.20, Hentai=0.60, Sexy=0.05
      ),
      dispose: jest.fn(),
    })),
  }),
  zeros: jest.fn(() => ({ dispose: jest.fn() })),
  tensor4d: jest.fn((data, shape) => ({
    dispose: jest.fn(),
    data: jest.fn().mockResolvedValue(data),
  })),
};

// OffscreenCanvas のモック（jsdom にはない）
global.OffscreenCanvas = class {
  constructor(w, h) { this.width = w; this.height = h; }
  getContext() {
    return {
      drawImage: jest.fn(),
      getImageData: jest.fn(() => ({
        data: new Uint8Array(224 * 224 * 4).fill(128), // グレー画像
      })),
    };
  }
};

// createImageBitmap のモック
global.createImageBitmap = jest.fn().mockResolvedValue({ width: 224, height: 224 });

const { base64ToBlob, calcNsfwScore, bitmapToTensor } = require('../offscreen.js');

// onMessage リスナーを取得（offscreen.js が登録したもの）
const messageListener =
  chrome.runtime.onMessage.addListener.mock.calls[0]?.[0];

// ─────────────────────────────────────────────
// bitmapToTensor
// ─────────────────────────────────────────────
describe('bitmapToTensor()', () => {
  test('tf.tensor4d が呼ばれ tensor を返す', async () => {
    const fakeBitmap = { width: 224, height: 224 };
    const result = await bitmapToTensor(fakeBitmap);
    expect(tf.tensor4d).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  test('tensor4d に shape [1, 224, 224, 3] が渡される', async () => {
    tf.tensor4d.mockClear();
    const fakeBitmap = { width: 100, height: 100 };
    await bitmapToTensor(fakeBitmap);
    const [, shape] = tf.tensor4d.mock.calls[0];
    expect(shape).toEqual([1, 224, 224, 3]);
  });

  test('RGB データが 0〜1 の範囲に正規化されている', async () => {
    tf.tensor4d.mockClear();
    const fakeBitmap = { width: 10, height: 10 };
    await bitmapToTensor(fakeBitmap);
    const [rgbData] = tf.tensor4d.mock.calls[0];
    // すべての値が 0〜1 の範囲内であること
    for (const v of rgbData) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  test('出力データ長が 224 * 224 * 3 である', async () => {
    tf.tensor4d.mockClear();
    await bitmapToTensor({ width: 50, height: 50 });
    const [rgbData] = tf.tensor4d.mock.calls[0];
    expect(rgbData.length).toBe(224 * 224 * 3);
  });
});

// ─────────────────────────────────────────────
// CLASSIFY_IMAGE_OFFSCREEN ハンドラー
// ─────────────────────────────────────────────
describe('CLASSIFY_IMAGE_OFFSCREEN メッセージハンドラー', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // fetch のモック（通常の https URL 用）
    global.fetch = jest.fn().mockResolvedValue({
      blob: jest.fn().mockResolvedValue(new Blob(['fake'], { type: 'image/jpeg' })),
    });
  });

  test('CLASSIFY_IMAGE_OFFSCREEN で chrome.runtime.sendMessage が呼ばれる', async () => {
    await new Promise((resolve) => {
      chrome.runtime.sendMessage.mockImplementationOnce(() => resolve());
      messageListener(
        { type: 'CLASSIFY_IMAGE_OFFSCREEN', imageUrl: 'https://example.com/img.jpg', requestId: 1 },
        {},
        () => {}
      );
    });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CLASSIFICATION_RESULT', requestId: 1 })
    );
  });

  test('判定結果に nsfwScore が含まれる', async () => {
    let capturedMessage;
    await new Promise((resolve) => {
      chrome.runtime.sendMessage.mockImplementationOnce((msg) => {
        capturedMessage = msg;
        resolve();
      });
      messageListener(
        { type: 'CLASSIFY_IMAGE_OFFSCREEN', imageUrl: 'https://example.com/img.jpg', requestId: 2 },
        {},
        () => {}
      );
    });
    expect(capturedMessage.nsfwScore).toBeDefined();
    expect(typeof capturedMessage.nsfwScore).toBe('number');
  });

  test('base64Data がある場合も CLASSIFICATION_RESULT を返す', async () => {
    const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    let capturedMessage;
    await new Promise((resolve) => {
      chrome.runtime.sendMessage.mockImplementationOnce((msg) => {
        capturedMessage = msg;
        resolve();
      });
      messageListener(
        {
          type: 'CLASSIFY_IMAGE_OFFSCREEN',
          imageUrl: 'blob:https://x.com/fake-blob-id',
          requestId: 3,
          base64Data: TINY_PNG,
        },
        {},
        () => {}
      );
    });
    expect(capturedMessage.type).toBe('CLASSIFICATION_RESULT');
    expect(capturedMessage.requestId).toBe(3);
  });

  test('CLASSIFY_IMAGE_OFFSCREEN 以外のメッセージには反応しない', () => {
    jest.clearAllMocks();
    messageListener({ type: 'OTHER_MESSAGE', requestId: 99 }, {}, () => {});
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  test('fetch が失敗した場合もエラーハンドラーが動く', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network error'));
    let capturedMessage;
    await new Promise((resolve) => {
      chrome.runtime.sendMessage.mockImplementationOnce((msg) => {
        capturedMessage = msg;
        resolve();
      });
      messageListener(
        { type: 'CLASSIFY_IMAGE_OFFSCREEN', imageUrl: 'https://example.com/fail.jpg', requestId: 4 },
        {},
        () => {}
      );
    });
    expect(capturedMessage.type).toBe('CLASSIFICATION_RESULT');
    expect(capturedMessage.nsfwScore).toBe(0);
    expect(capturedMessage.error).toBe('network error');
  });
});
