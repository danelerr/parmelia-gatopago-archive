import { formatUserOperationRequest } from 'viem/account-abstraction';
import { requireHash } from '../../../../shared/v3/deployment';
import type { ResourceId } from '../../../../shared/v3/primitives';
import { discardResponseBody, readJsonBounded } from '../../services/http';
import type { VerifiedIdentity } from '../auth/identity';
import { withDeadline } from '../deadline';
import { creationProviderUrl } from './creationBundler';
import { TransferNonceReservationRepository } from './transferNonceReservation';
import { preflightOwnedTransfer, type TransferPreflightProfile } from './transferPreflight';

/** Private delivery coordinator. No public route or admitted production profile.
 * Persists a one-use dispatch marker before a single bounded bundler request.
 * Acceptance is never settlement. Any failure beyond dispatch stays uncertain.
 */
export async function deliverOwnedTransfer(database: D1Database, identityInput: VerifiedIdentity,
  walletId: ResourceId<'wallet'>, accountId: ResourceId<'walletAccount'>, operationId: ResourceId<'operation'>,
  profilesInput: readonly TransferPreflightProfile[], signal: AbortSignal) {
  const identity = Object.freeze({ ...identityInput }), profiles = structuredClone(profilesInput);
  const repository = new TransferNonceReservationRepository(database, identity);
  const stored = await repository.readOwned(walletId, accountId, operationId);
  if (stored.state !== 'held') throw new Error('TRANSFER_DELIVERY_ALREADY_CLAIMED');
  const matching = profiles.filter(p => p.digest === stored.candidate.deployment_digest);
  if (matching.length !== 1) throw new Error('TRANSFER_DELIVERY_PROFILE_UNAVAILABLE');
  const url = creationProviderUrl(matching[0].bundlerUrl);
  signal.throwIfAborted();
  const preflight = await preflightOwnedTransfer(database, identity, walletId, accountId, operationId, matching, signal);
  signal.throwIfAborted();
  const claim = await repository.beginDelivery(walletId, accountId, preflight);
  signal.throwIfAborted();
  const grant = await repository.consumeDelivery(walletId, accountId, operationId, claim.claim_token);
  try {
    await withDeadline(signal, 5000, async deadline => {
      // Do not begin network I/O after the preflight observation has expired.
      const now = Math.floor(Date.now() / 1000);
      if (now < grant.dispatched_at || now >= grant.expires_at) throw new Error('TRANSFER_DISPATCH_EXPIRED');
      const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_sendUserOperation',
        params: [formatUserOperationRequest(grant.operation), grant.entry_point] });
      if (body.length > 180_000) throw new Error('TRANSFER_DELIVERY_TOO_LARGE');
      const response = await fetch(url, { method: 'POST', redirect: 'error', signal: deadline,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body });
      if (!response.ok) { await discardResponseBody(response); throw new Error('TRANSFER_DELIVERY_UNAVAILABLE'); }
      const value = await readJsonBounded<unknown>(response, 16_384, deadline);
      if (!value || typeof value !== 'object' || Array.isArray(value) || !('jsonrpc' in value) || value.jsonrpc !== '2.0'
        || !('id' in value) || value.id !== 1 || !('result' in value) || 'error' in value) throw new Error('TRANSFER_DELIVERY_RESPONSE');
      requireHash(value.result);
      if (value.result !== grant.userop_hash) throw new Error('TRANSFER_DELIVERY_HASH');
    });
    return Object.freeze({ operation_id: operationId, userop_hash: grant.userop_hash, delivery: 'accepted' as const, settlement: 'unconfirmed' as const });
  } catch {
    // Never retry, free reservations or disclose RPC error details/signatures.
    return Object.freeze({ operation_id: operationId, userop_hash: grant.userop_hash, delivery: 'uncertain' as const, settlement: 'unconfirmed' as const });
  }
}
