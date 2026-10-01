import assert from 'node:assert/strict';

/** Git may check JSON out with CRLF. Ignore only that conversion, not content,
 * whitespace, ordering or artifact hashes. Archived artifact checks stay byte-exact. */
export function assertDeploymentProfileText(actual, expected) {
  assert.equal(actual.replace(/\r\n/g, '\n'), expected, 'Deployment profile differs from verified release evidence');
}
