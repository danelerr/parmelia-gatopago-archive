import type { ResourceId } from '../../../../shared/v3/primitives';
import { loadPinnedFinalityPolicy, type FinalityPolicyPin } from '../../../../shared/v3/finality';
import { loadPinnedCreationProfile } from '../../../../shared/v3/initialization';
import type { CreationDeliveryConfiguration } from './creationDelivery';
import { creationProviderUrl } from './creationBundler';
import { reconcileCreationObservation } from './creationObservation';
import { CreationObservationJournal } from './creationObservationJournal';
import type { CreationProfilePin } from './initialization';

interface Network extends CreationProfilePin {
	readonly bundlerUrl: string;
	readonly finalityPolicy: FinalityPolicyPin;
	readonly providers: readonly { readonly operatorId: string; readonly url: string }[];
}
interface Configuration extends Omit<CreationDeliveryConfiguration, 'profiles'> { readonly networks: readonly Network[] }

/** Internal durable observer. Admission of endpoints/operators/networks is external
 * to this service; no configuration comes from a public request. Not a sending job. */
export async function processCreationObservation(database: D1Database, id: ResourceId<'operation'>,
	configuration: Configuration, signal: AbortSignal) {
	const networks = configuration.networks.map((network) => {
		const finalityPolicy = Object.freeze({ ...network.finalityPolicy });
		loadPinnedFinalityPolicy(finalityPolicy, loadPinnedCreationProfile(network.document, network.digest).deployment);
		return Object.freeze({ ...network, finalityPolicy,
			bundlerUrl: creationProviderUrl(network.bundlerUrl), providers: Object.freeze(network.providers.map((p) => Object.freeze({
				operatorId: p.operatorId, url: creationProviderUrl(p.url),
			}))),
		});
	});
	const journal = new CreationObservationJournal(database, { ...configuration, profiles: networks });
	signal.throwIfAborted();
	const claim = await journal.claim(id);
	if (!claim) return 'idle' as const;
	const network = networks.find((item) => item.digest === claim.grant.signed.prepared.profileDigest);
	if (!network) throw new Error('Missing admitted observation profile');
	const transaction = await journal.knownTransaction(id);
	const finalizedReceipt = await journal.lastFinalizedReceipt(id);
	const deadline = AbortSignal.any([signal, AbortSignal.timeout(Math.max(1, Math.min(40_000, claim.until * 1000 - Date.now())))]);
	let result = await reconcileCreationObservation(claim.grant.signed, { profileDocument: network.document,
		bundlerUrl: network.bundlerUrl, providers: network.providers, finalityPolicy: network.finalityPolicy }, deadline, transaction);
	if (finalizedReceipt && result.status === 'observed' && result.finality !== 'not_assessed'
		&& (result.observation.block_hash !== finalizedReceipt.block_hash || result.observation.block_number !== finalizedReceipt.block_number
			|| result.observation.block_timestamp !== finalizedReceipt.block_timestamp)) {
		// Two agreeing RPCs must not silently rewrite a historically finalized identity.
		const evidence = result.finality_evidence;
		result = Object.freeze({ ...result, finality: 'reorg_detected', finality_evidence: Object.freeze({ ...evidence,
			status: 'reorg_detected', checkpoint: null, expires_at: evidence.assessed_at }) });
	}
	return await journal.append(claim, result) ? result.status : 'lease_lost' as const;
}
