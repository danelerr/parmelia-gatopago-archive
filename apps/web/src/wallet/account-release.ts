import type { AccountContextPin } from './account-context';

// Independently reviewed public deployment pins belong to the Web release.
// Do not populate from HTTP, localStorage or a query. No V3 deployment admitted yet.
const pins: Readonly<Record<'staging' | 'production', readonly AccountContextPin[]>> = Object.freeze({
  staging: Object.freeze([]), production: Object.freeze([]),
});
export function accountPinsForRelease(environment: 'staging' | 'production'): readonly AccountContextPin[] {
  return pins[environment];
}
