const fs = require('fs');
const path = require('path');

describe('offscreen.html script loading', () => {
  const rootDir = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(rootDir, 'offscreen.html'), 'utf8');

  function scriptSources() {
    return [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((match) => match[1]);
  }

  test('読み込む script ファイルがすべて存在する', () => {
    scriptSources().forEach((src) => {
      expect(fs.existsSync(path.join(rootDir, src))).toBe(true);
    });
  });

  test('TensorFlow.js bundle を offscreen.js より前に読み込む', () => {
    expect(scriptSources()).toEqual([
      'models/tf-wasm-bundle.js',
      'offscreen.js',
    ]);
  });
});
