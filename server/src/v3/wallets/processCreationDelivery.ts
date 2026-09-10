import type { InspectionCheckpoint } from '../../../../shared/v3/accountInspection';
import { requireHash } from '../../../../shared/v3/deployment';
import { parseAtomicAmount, type ResourceId } from '../../../../shared/v3/primitives';
import { inspectWalletCreationProfile } from '../chainInspection';
import { createCreationBundler, creationProviderUrl } from './creationBundler';
import { CreationDeliveryRepository, type CreationDeliveryConfiguration } from './creationDelivery';
import type { CreationProfilePin } from './initialization';

interface DeliveryNetwork extends CreationProfilePin {
	readonly checkpoint: InspectionCheckpoint;
	readonly rpcUrl: string;
	readonly bundlerUrl: string;
}
interface Configuration extends Omit<CreationDeliveryConfiguration, 'profiles'> { readonly networks: readonly DeliveryNetwork[] }

/** Private service integration only. Scheduler must supply independently admitted profile,
 * endpoints and fresh checkpoint under its network/finality policy. Public HTTP/Next cannot
 * supply these values. Code consistency + simulation do NOT satisfy the admission gate.
 * No queue binding/public route is activated by adding this internal implementation.
 */
export async function processCreationDelivery(database: D1Database, id: ResourceId<'operation'>, configuration: Configuration, signal: AbortSignal) {
	const networks = configuration.networks.map((network) => {
		requireHash(network.checkpoint.block_hash); parseAtomicAmount(network.checkpoint.block_number);
		return Object.freeze({ document: network.document, digest: network.digest, checkpoint: Object.freeze({ ...network.checkpoint }),
			rpcUrl: creationProviderUrl(network.rpcUrl), bundlerUrl: creationProviderUrl(network.bundlerUrl) });
	});
	const repository = new CreationDeliveryRepository(database, { ...configuration, profiles: networks });
	signal.throwIfAborted();
	const claim = await repository.claim(id);
	if (!claim) return 'idle' as const;
	const network = networks.find((item) => item.digest === claim.record.initial.input.expectedDigest)!;
	const deadline = AbortSignal.any([signal, AbortSignal.timeout(Math.max(1, Math.min(35_000, claim.until * 1000 - Date.now())))]);
	const bundler = createCreationBundler(network.bundlerUrl, deadline);
	try {
		await inspectWalletCreationProfile({ document: network.document, expectedDigest: network.digest, checkpoint: network.checkpoint }, network.rpcUrl, deadline);
		await bundler.preflight(claim.record.signed);
		deadline.throwIfAborted();
	} catch {
		await repository.retryBeforeSend(claim);
		return 'deferred' as const;
	}
	// Persist before crossing the external-effect boundary. A D1 response failure itself
	// is allowed to bubble up; recovery of a committed sending marker will remain uncertain.
	if (!await repository.beginSend(claim)) {
		await repository.retryBeforeSend(claim);
		return 'lease_lost' as const;
	}
	try {
		const hash = await bundler.send(claim.record.signed);
		if (await repository.accepted(claim, hash)) return 'accepted' as const;
	} catch { /* timeout, malformed response or ambiguous D1 acknowledgement requires observation */ }
	await repository.uncertain(claim);
	return 'uncertain' as const;
}
