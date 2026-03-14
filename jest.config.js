/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  setupFiles: ['./tests/setup.js'],
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: ['content.js', 'popup.js', 'offscreen.js'],
  coverageReporters: ['text', 'lcov'],
};

