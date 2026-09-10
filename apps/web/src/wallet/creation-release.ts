export type CreationProfilePin = Readonly<{ document: string; digest: `0x${string}` }>;

// Web-release input, never downloaded from the preparation endpoint. Promotion
// requires the separately reviewed creation profile and the matching Worker
// admission/observer. An HTTP field, localStorage flag or query cannot populate it.
const profiles: Readonly<Record<'staging' | 'production', CreationProfilePin | null>> = Object.freeze({
  staging: null, production: null,
});
export function creationProfileForRelease(environment: 'staging' | 'production'): CreationProfilePin | null {
  return profiles[environment];
}
