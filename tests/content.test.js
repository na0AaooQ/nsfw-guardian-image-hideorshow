// ユニットテスト
const { getMediaId, getBestImageUrl, blobUrlToBase64, replaceWithWarning } =
  require('../content.js');

describe('getMediaId()', () => {
  test('blob: URL はURLそのものをIDとして返す', () => {
    const url = 'blob:https://x.com/87de6c04-4cf3-4a1a-b73d-4517053a8cea';
    expect(getMediaId(url)).toBe(url);
  });
  test('/media/ パスからファイル名部分を抽出する', () => {
    expect(getMediaId('https://pbs.twimg.com/media/ABC123XYZ.jpg')).toBe('ABC123XYZ.jpg');
  });
  test('/media/ パスにクエリパラメータが付いていても除去する', () => {
    expect(getMediaId('https://pbs.twimg.com/media/ABC123XYZ.jpg?format=jpg&name=large')).toBe('ABC123XYZ.jpg');
  });
  test('profile_images などのパスはURLのパス末尾を返す', () => {
    expect(getMediaId('https://pbs.twimg.com/profile_images/999/zCe8Qf34_200x200.jpg')).toBe('zCe8Qf34_200x200.jpg');
  });
});

describe('getBestImageUrl()', () => {
  test('srcset が空の場合は src を返す', () => {
    expect(getBestImageUrl({ src: 'https://example.com/image.jpg', srcset: '' }))
      .toBe('https://example.com/image.jpg');
  });
  test('src も srcset もない場合は null を返す', () => {
    expect(getBestImageUrl({ src: '', srcset: '' })).toBeNull();
  });
  test('x デスクリプタで最高解像度 URL を返す (2x > 1x)', () => {
    const img = {
      srcset: 'https://example.com/small.jpg 1x, https://example.com/large.jpg 2x',
      src: 'https://example.com/small.jpg',
    };
    expect(getBestImageUrl(img)).toBe('https://example.com/large.jpg');
  });
  test('x デスクリプタで3段階の場合も最高解像度を返す', () => {
    const img = {
      srcset: 'https://example.com/s.jpg 1x, https://example.com/m.jpg 2x, https://example.com/l.jpg 3x',
      src: 'https://example.com/s.jpg',
    };
    expect(getBestImageUrl(img)).toBe('https://example.com/l.jpg');
  });
  test('w デスクリプタで最高解像度 URL を返す (1200w > 600w)', () => {
    const img = {
      srcset: 'https://example.com/600w.jpg 600w, https://example.com/1200w.jpg 1200w',
      src: 'https://example.com/600w.jpg',
    };
    expect(getBestImageUrl(img)).toBe('https://example.com/1200w.jpg');
  });
  test('デスクリプタがない場合は最初の URL を返す', () => {
    const img = { srcset: 'https://example.com/only.jpg', src: 'https://example.com/fallback.jpg' };
    expect(getBestImageUrl(img)).toBe('https://example.com/only.jpg');
  });
});

describe('blobUrlToBase64()', () => {
  test('canvas.toDataURL の結果を返す（正常系）', async () => {
    const mockDataUrl = 'data:image/jpeg;base64,/9j/fakebase64data';
    const mockCtx = { drawImage: jest.fn() };
    const mockCanvas = {
      width: 0, height: 0,
      getContext: jest.fn(() => mockCtx),
      toDataURL: jest.fn(() => mockDataUrl),
    };
    const origCreate = document.createElement.bind(document);
    document.createElement = jest.fn((tag) => tag === 'canvas' ? mockCanvas : origCreate(tag));
    const fakeImg = { naturalWidth: 300, naturalHeight: 400 };
    const result = await blobUrlToBase64(fakeImg);
    expect(mockCanvas.width).toBe(300);
    expect(mockCanvas.height).toBe(400);
    expect(mockCtx.drawImage).toHaveBeenCalledWith(fakeImg, 0, 0);
    expect(result).toBe(mockDataUrl);
    document.createElement = origCreate;
  });
  test('naturalWidth/Height が 0 の場合は 224 にフォールバックする', async () => {
    const mockCtx = { drawImage: jest.fn() };
    const mockCanvas = { width: 0, height: 0, getContext: jest.fn(() => mockCtx), toDataURL: jest.fn(() => 'data:image/jpeg;base64,x') };
    const origCreate = document.createElement.bind(document);
    document.createElement = jest.fn((tag) => tag === 'canvas' ? mockCanvas : origCreate(tag));
    await blobUrlToBase64({ naturalWidth: 0, naturalHeight: 0 });
    expect(mockCanvas.width).toBe(224);
    expect(mockCanvas.height).toBe(224);
    document.createElement = origCreate;
  });
  test('canvas.getContext がエラーを投げた場合は reject する', async () => {
    const origCreate = document.createElement.bind(document);
    document.createElement = jest.fn((tag) => {
      if (tag === 'canvas') return { width: 0, height: 0, getContext: () => { throw new Error('canvas error'); }, toDataURL: jest.fn() };
      return origCreate(tag);
    });
    await expect(blobUrlToBase64({ naturalWidth: 100, naturalHeight: 100 })).rejects.toThrow('canvas error');
    document.createElement = origCreate;
  });
});

describe('replaceWithWarning()', () => {
  let container;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
  afterEach(() => { document.body.removeChild(container); });

  test('img 要素が .nsfw-guardian-block に置き換えられる', () => {
    const img = document.createElement('img');
    container.appendChild(img);
    replaceWithWarning(img, 0.75, 'test-id');
    expect(container.querySelector('.nsfw-guardian-block')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });
  test('ブロック内にスコアが表示される', () => {
    const img = document.createElement('img');
    container.appendChild(img);
    replaceWithWarning(img, 0.85, 'test-id');
    expect(container.querySelector('.nsfw-guardian-score').textContent).toContain('85.0%');
  });
  test('「クリックで表示」ボタンがある', () => {
    const img = document.createElement('img');
    container.appendChild(img);
    replaceWithWarning(img, 0.5, 'test-id');
    expect(container.querySelector('.nsfw-guardian-btn').textContent).toBe('クリックで表示');
  });
  test('「クリックで表示」クリックで img が復元される', () => {
    const img = document.createElement('img');
    container.appendChild(img);
    replaceWithWarning(img, 0.9, 'restore-id');
    container.querySelector('.nsfw-guardian-btn').click();
    expect(container.querySelector('img')).not.toBeNull();
    expect(container.querySelector('.nsfw-guardian-block')).toBeNull();
    expect(img.dataset.nsfwChecked).toBe('approved');
  });
  test('サイズがすべて 0 の場合は 200px にフォールバックする', () => {
    const img = document.createElement('img');
    container.appendChild(img);
    replaceWithWarning(img, 0.4, 'fallback-id');
    const block = container.querySelector('.nsfw-guardian-block');
    expect(block.style.width).toBe('200px');
    expect(block.style.height).toBe('200px');
  });
});
