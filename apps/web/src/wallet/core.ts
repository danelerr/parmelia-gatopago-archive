import { parseResourceId } from '@gatopago/shared/v3/primitives';
import type { EnabledAuthConfig } from '../auth/config';
import { exact, record, walletTransport, WalletCoreError } from './http';
export { WalletCoreError } from './http';

type Wallet = { id: string; owner_party_id: string; controller: 'end_user'; account_kind: 'evm_smart_account'; status: 'active' | 'archived' };
export type WalletPage = { data: Wallet[]; next_cursor: string | null };

function parsePage(input: unknown): WalletPage {
  if (!record(input) || !exact(input, ['data', 'next_cursor']) || !Array.isArray(input.data) || input.data.length > 20) throw new WalletCoreError('wallet/unavailable');
  const data = input.data.map((wallet: unknown): Wallet => {
    if (!record(wallet) || !exact(wallet, ['id', 'owner_party_id', 'controller', 'account_kind', 'status']) || wallet.controller !== 'end_user'
        || wallet.account_kind !== 'evm_smart_account' || (wallet.status !== 'active' && wallet.status !== 'archived')) throw new WalletCoreError('wallet/unavailable');
    return { id: parseResourceId('wallet', wallet.id), owner_party_id: parseResourceId('party', wallet.owner_party_id),
      controller: wallet.controller, account_kind: wallet.account_kind, status: wallet.status };
  });
  if (new Set(data.map((value) => value.id)).size !== data.length || new Set(data.map((value) => value.owner_party_id)).size > 1
      || data.some((value, index) => index > 0 && value.id <= data[index - 1].id)) throw new WalletCoreError('wallet/unavailable');
  const next = input.next_cursor === null ? null : parseResourceId('wallet', input.next_cursor);
  if (next !== null && (data.length !== 20 || next !== data.at(-1)?.id)) throw new WalletCoreError('wallet/unavailable');
  return { data, next_cursor: next };
}

/** Browser-only transport; no private cache, polling, redirect following or monetary retry.
 * A missing app identity is bootstrapped once; an uncertain POST is not blindly retried.
 * getToken must remain bound to the same Firebase user for the whole operation.
 */
export async function loadWalletPage(config: EnabledAuthConfig, getToken: () => Promise<string>, inputSignal: AbortSignal, after: string | null = null): Promise<WalletPage> {
  try {
    const { request, createIdentity } = walletTransport(config, getToken, inputSignal);
    const cursor = after === null ? '' : `&after=${parseResourceId('wallet', after)}`;
    let result = await request(`/wallets?limit=20${cursor}`, 'GET');
    if (result.status === 409 && record(result.value) && result.value.error_code === 'SESSION_REQUIRED' && after === null) {
      await createIdentity();
      result = await request('/wallets?limit=20', 'GET');
    }
    if (result.status !== 200) throw new WalletCoreError('wallet/unavailable');
    const page = parsePage(result.value);
    if (after !== null && page.data.some((value) => value.id <= after)) throw new WalletCoreError('wallet/unavailable');
    return page;
  } catch (error) {
    if (inputSignal.aborted) throw inputSignal.reason;
    throw error instanceof WalletCoreError ? error : new WalletCoreError('wallet/unavailable');
  }
}
