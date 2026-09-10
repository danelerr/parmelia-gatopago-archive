import { isAddress, type LocalAccount } from 'viem';
import type { ResourceId } from '../../../../shared/v3/primitives';
import { verifyActivationTransaction, type prepareActivationTransaction } from './activationTransaction';

type Transaction = ReturnType<typeof prepareActivationTransaction>;
export interface ActivationSigner {
 readonly operator: Transaction['operator'];
 /** Private sign-only capability. Remote implementations must honor signal and use
  * (operationId, transaction.unsignedHash) as their immutable idempotency identity. */
 readonly sign: (operationId: ResourceId<'operation'>, transaction: Transaction, signal: AbortSignal) => Promise<unknown>;
}
/** Captures only the local account's signing method; no keystore, secret loading,
 * WalletClient, provider or broadcast. The caller owns environment/key admission.
 * Local fixtures inject ephemeral accounts. This does not provision a live signer. */
export function localActivationSigner(account: Pick<LocalAccount, 'address' | 'signTransaction'>): ActivationSigner {
 if (!isAddress(account.address, { strict: false }) || /^0x0{40}$/i.test(account.address)) throw new Error('ACTIVATION_SIGNER_INVALID');
 const operator = account.address.toLowerCase() as Transaction['operator'];
 const sign = account.signTransaction.bind(account);
 return Object.freeze({ operator, async sign(_operationId: ResourceId<'operation'>, transaction: Transaction, signal: AbortSignal) {
  signal.throwIfAborted();
  if (transaction.operator !== operator) throw new Error('ACTIVATION_SIGNER_INVALID');
  try {
   const raw = await sign(Object.freeze({ ...transaction.request }));
   signal.throwIfAborted();
   return (await verifyActivationTransaction(transaction, raw)).serialized;
  } catch { throw new Error('ACTIVATION_SIGNER_FAILED'); }
 } });
}
