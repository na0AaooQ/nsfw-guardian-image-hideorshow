global.chrome = {
  storage: {
    sync: {
      get: jest.fn((defaults, callback) => {
        if (typeof callback === 'function') callback(defaults);
      }),
      set: jest.fn((items, callback) => {
        if (typeof callback === 'function') callback();
      }),
    },
  },
  runtime: {
    onMessage: { addListener: jest.fn() },
    sendMessage: jest.fn(),
    getURL: jest.fn((path) => `chrome-extension://fake-extension-id/${path}`),
  },
  tabs: {
    query: jest.fn((_, callback) => {
      if (typeof callback === 'function') callback([{ id: 1 }]);
    }),
    sendMessage: jest.fn(),
  },
  offscreen: {
    hasDocument: jest.fn().mockResolvedValue(false),
    createDocument: jest.fn().mockResolvedValue(undefined),
  },
};
