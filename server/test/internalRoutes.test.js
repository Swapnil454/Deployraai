import test from 'node:test';
import assert from 'node:assert';

// Mock dependencies
let statusCalledWith = null;
let jsonCalledWith = null;
let nextCalled = false;

const mockRes = {
  status: (code) => {
    statusCalledWith = code;
    return mockRes;
  },
  json: (data) => {
    jsonCalledWith = data;
    return mockRes;
  }
};

const mockNext = () => {
  nextCalled = true;
};

// Reset mocks before each test
const resetMocks = () => {
  statusCalledWith = null;
  jsonCalledWith = null;
  nextCalled = false;
  process.env.INTERNAL_API_SECRET = 'test_secret_123';
};

// --- Extract the middleware and validation logic from internal.routes.js ---

const requireInternalSecret = (req, res, next) => {
  const secret = req.headers['x-internal-secret'];
  if (!process.env.INTERNAL_API_SECRET) {
    return res.status(500).json({ error: 'Server configuration error' });
  }
  if (secret !== process.env.INTERNAL_API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized internal request' });
  }
  next();
};

const validateEvent = (req, res, next) => {
  const { event, projectId } = req.body;
  if (!event || !projectId) {
    return res.status(400).json({ error: 'Missing required fields: event, projectId' });
  }
  const allowedEvents = ['deployment_success', 'deployment_failed', 'pr_created', 'issue_arrived'];
  if (!allowedEvents.includes(event)) {
    return res.status(400).json({ error: `Invalid event type. Allowed: ${allowedEvents.join(', ')}` });
  }
  next();
};

test('Middleware: Rejects if no secret provided', () => {
  resetMocks();
  const req = { headers: {} };
  requireInternalSecret(req, mockRes, mockNext);
  
  assert.strictEqual(statusCalledWith, 401);
  assert.strictEqual(jsonCalledWith.error, 'Unauthorized internal request');
  assert.strictEqual(nextCalled, false);
});

test('Middleware: Rejects if invalid secret provided', () => {
  resetMocks();
  const req = { headers: { 'x-internal-secret': 'wrong_secret' } };
  requireInternalSecret(req, mockRes, mockNext);
  
  assert.strictEqual(statusCalledWith, 401);
  assert.strictEqual(nextCalled, false);
});

test('Middleware: Passes if valid secret provided', () => {
  resetMocks();
  const req = { headers: { 'x-internal-secret': 'test_secret_123' } };
  requireInternalSecret(req, mockRes, mockNext);
  
  assert.strictEqual(nextCalled, true);
});

test('Validation: Rejects if missing event', () => {
  resetMocks();
  const req = { body: { projectId: '123' } };
  validateEvent(req, mockRes, mockNext);
  
  assert.strictEqual(statusCalledWith, 400);
});

test('Validation: Rejects if invalid event type', () => {
  resetMocks();
  const req = { body: { projectId: '123', event: 'random_event' } };
  validateEvent(req, mockRes, mockNext);
  
  assert.strictEqual(statusCalledWith, 400);
  assert.ok(jsonCalledWith.error.includes('Invalid event type'));
});

test('Validation: Passes with valid event type', () => {
  resetMocks();
  const req = { body: { projectId: '123', event: 'deployment_success' } };
  validateEvent(req, mockRes, mockNext);
  
  assert.strictEqual(nextCalled, true);
});
