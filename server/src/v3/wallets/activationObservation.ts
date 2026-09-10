import { assessCheckpointFinality, loadPinnedFinalityPolicy, type FinalityPolicyPin } from '../../../../shared/v3/finality';
import { loadPinnedCreationProfile } from '../../../../shared/v3/initialization';
import { createInspectionClient } from '../chainInspection';
import { withDeadline } from '../deadline';
import type { ActivationObservationGrant } from './activationDelivery';
import { observeActivationReceipt } from './activationReceipt';
import { activationProviders, type ActivationProvider } from './activationRpc';

export interface ActivationObservationNetwork {
 readonly document: string;
 readonly digest: `0x${string}`;
 readonly finalityPolicy: FinalityPolicyPin;
 readonly providers: readonly ActivationProvider[];
}

/** Private read-only reconciliation: exact stored transaction, two pinned RPC operators,
 * canonical receipt/code and chain-specific finality. No signer, send API, admission,
 * stale-success fallback or modification of a wallet's readiness. */
export async function reconcileActivationObservation(source: ActivationObservationGrant, configuration: ActivationObservationNetwork, signal: AbortSignal) {
 const grant = structuredClone(source), document = configuration.document, digest = configuration.digest;
 const profile = loadPinnedCreationProfile(document, digest), finalityPolicy = Object.freeze({ ...configuration.finalityPolicy });
 if (digest !== grant.profileDigest || profile.deployment.network_id !== grant.networkId) throw new Error('ACTIVATION_OBSERVATION_PROFILE');
 loadPinnedFinalityPolicy(finalityPolicy, profile.deployment);
 const providers = activationProviders(configuration.providers);
 const base = Object.freeze({ transaction_hash: grant.transactionHash, provider_ids: Object.freeze(providers.map((p) => p.operatorId)),
  finality: 'not_assessed' as const, account_readiness: 'not_assessed' as const });
 try {
  return await withDeadline(signal, 40_000, async (deadline) => {
   const clients = providers.map((p) => createInspectionClient(p.url, deadline));
   const results = await Promise.allSettled(clients.map((client) => observeActivationReceipt(client, grant, document)));
   deadline.throwIfAborted();
   const [a, b] = results;
   if (a.status === 'rejected' || b.status === 'rejected') return Object.freeze({ ...base, status: 'unavailable' as const });
   if (JSON.stringify(a.value) !== JSON.stringify(b.value)) return Object.freeze({ ...base, status: 'disagreement' as const });
   if (!a.value) return Object.freeze({ ...base, status: 'not_observed' as const });
   const assessment = await assessCheckpointFinality(clients, { ...a.value, genesis_hash: profile.deployment.genesis_hash }, finalityPolicy, deadline);
   return Object.freeze({ ...base, status: 'observed' as const, observation: a.value,
    finality: assessment.status, finality_evidence: assessment });
  });
 } catch {
  return Object.freeze({ ...base, status: 'unavailable' as const });
 }
}
export type ActivationObservationResult = Awaited<ReturnType<typeof reconcileActivationObservation>>;
