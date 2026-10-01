import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertDeploymentProfileText } from './deployment-profile-text.mjs';

const expected = '{\n  "runtime_code_hash": "0x1234"\n}\n';
test('accepts LF and Windows CRLF checkouts of the same profile', () => {
  assertDeploymentProfileText(expected, expected);
  assertDeploymentProfileText(expected.replace(/\n/g, '\r\n'), expected);
});
test('still rejects changed profile content and noncanonical formatting', () => {
  for (const text of [expected.replace('0x1234', '0x4321'), expected.replace('  ', ' '), expected.trimEnd(), expected.replace(/\n/g, '\r')]) {
    assert.throws(() => assertDeploymentProfileText(text, expected));
  }
});
