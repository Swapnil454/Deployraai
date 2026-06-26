require('@testing-library/jest-dom');

// We need to mock TextEncoder/TextDecoder for OpenTelemetry in JSDOM
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock fetch globally
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  })
);

// Mock timer unref for OpenTelemetry in JSDOM where setTimeout returns a primitive number
const originalSetTimeout = global.setTimeout;
const originalClearTimeout = global.clearTimeout;

global.setTimeout = function(callback, ms) {
  const timerId = originalSetTimeout(callback, ms);
  return {
    id: timerId,
    unref: () => {},
    ref: () => {},
    hasRef: () => true,
    refresh: () => {},
    [Symbol.toPrimitive]: () => timerId
  };
};

global.clearTimeout = function(timer) {
  if (timer && timer.id !== undefined) {
    originalClearTimeout(timer.id);
  } else {
    originalClearTimeout(timer);
  }
};
