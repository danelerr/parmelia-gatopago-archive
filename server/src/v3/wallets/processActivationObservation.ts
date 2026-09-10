import type { ResourceId } from '../../../../shared/v3/primitives';
import { loadPinnedFinalityPolicy } from '../../../../shared/v3/finality';
import { loadPinnedCreationProfile } from '../../../../shared/v3/initialization';
import { withDeadline } from '../deadline';
import { reconcileActivationObservation, type ActivationObservationNetwork } from './activationObservation';
import { ActivationObservationJournal } from './activationObservationJournal';
import { activationProviders } from './activationRpc';
import type { CreationDeliveryConfiguration } from './creationDelivery';

interface Configuration extends Omit<CreationDeliveryConfiguration, 'profiles'> { readonly networks: readonly ActivationObservationNetwork[] }

/** Internal job callable from a durable runner, never from an arbitrary-address HTTP
 * request. No signer/key/budget is needed to reconcile a transaction already sent. */
export async function processActivationObservation(database: D1Database, id: ResourceId<'operation'>, configuration: Configuration, signal: AbortSignal) {
 signal.throwIfAborted();
 const networks = configuration.networks.map((n) => {
  const profile = loadPinnedCreationProfile(n.document, n.digest), finalityPolicy = Object.freeze({ ...n.finalityPolicy });
  loadPinnedFinalityPolicy(finalityPolicy, profile.deployment);
  return Object.freeze({ document: n.document, digest: n.digest, finalityPolicy, providers: activationProviders(n.providers) });
 });
 const journal = new ActivationObservationJournal(database, { ...configuration, profiles: networks });
 const claim = await journal.claim(id); if (!claim) return 'idle' as const;
 const network = networks.find((n) => n.digest === claim.grant.profileDigest);
 if (!network) throw new Error('ACTIVATION_OBSERVATION_PROFILE');
 const previous = await journal.lastFinalizedReceipt(id);
 let result = await withDeadline(signal, Math.max(1, Math.min(40_000, claim.until * 1000 - Date.now())),
  (deadline) => reconcileActivationObservation(claim.grant, network, deadline));
 if (previous && result.status === 'observed' && JSON.stringify(previous) !== JSON.stringify(result.observation)) {
  // Two agreeing providers cannot rewrite an already finalized outcome silently.
  result = Object.freeze({ ...result, finality: 'reorg_detected', finality_evidence: Object.freeze({ ...result.finality_evidence,
   status: 'reorg_detected', checkpoint: null, expires_at: result.finality_evidence.assessed_at }) });
 }
 signal.throwIfAborted();
 return await journal.append(claim, result) ? result.status : 'lease_lost' as const;
}
