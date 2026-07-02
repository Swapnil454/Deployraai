import test from 'node:test';
import assert from 'node:assert';
import { parsePprof } from './pprof-parser.js';
import protobuf from 'protobufjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Note: To test the parser properly, we need a valid mock Profile protobuf message.
test('parsePprof resolves string/location/function tables into flat stack trace paths', async (t) => {
  const root = await protobuf.load(path.resolve(__dirname, '../profile.proto'));
  const Profile = root.lookupType('perftools.profiles.Profile');

  // Create a mock profile structure
  const mockProfile = {
    // string_table index 0 is always empty string
    stringTable: ['', 'main', 'foo', 'bar', 'samples/cpu'],
    sampleType: [
      { type: 4, unit: 0 } // dummy references
    ],
    function: [
      { id: 1, name: 1 }, // main
      { id: 2, name: 2 }, // foo
      { id: 3, name: 3 }  // bar
    ],
    location: [
      { id: 1, line: [{ functionId: 1 }] },
      { id: 2, line: [{ functionId: 2 }] },
      { id: 3, line: [{ functionId: 3 }] }
    ],
    sample: [
      {
        locationId: [1, 2], // main -> foo (stack is leaf first typically, or root first depending on format. pprof is typically leaf first)
        value: [100] // 100ns
      },
      {
        locationId: [1, 3], // main -> bar
        value: [200]
      }
    ]
  };

  const buffer = Profile.encode(mockProfile).finish();

  const parsed = await parsePprof(buffer);
  
  assert.strictEqual(parsed.length, 2, 'Should parse exactly two samples');
  
  // Checking flattening logic
  // Typically pprof locationId arrays are [leaf, ..., root]
  // So locationId [1, 2] means function 1 is called by function 2? 
  // Wait, the specification says:
  // "The ids recorded from deep to shallow (ie leaf to root)"
  // Our parser should probably reverse them so root is at index 0, or keep it consistent.
  // Let's assert the parsed output we expect (root at index 0):
  assert.deepStrictEqual(parsed[0].stackTrace, ['foo', 'main']);
  assert.strictEqual(parsed[0].value, 100);

  assert.deepStrictEqual(parsed[1].stackTrace, ['bar', 'main']);
  assert.strictEqual(parsed[1].value, 200);
});
