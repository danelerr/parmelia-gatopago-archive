import { configuredEnvironment } from './auth/config';
import { EMAIL_LINK_PATH, emailLinkRoute } from './auth/route';
import { CLIENT_COMPATIBILITY_PATH } from '../../../shared/v3/clientRelease';
import { clientCompatibilityRoute } from './clientCompatibility';
import { isWalletReadPath, walletReadRoute } from './wallets/route';
import { enrollmentRoute, isEnrollmentPath } from './enrollment/route';
import { initializationRoute, isInitializationPath } from './wallets/initializationRoute';
import { creationOperationRoute, isCreationOperationPath } from './wallets/creationOperationRoute';
import { creationJobHandlers } from './wallets/creationJobHandlers';
import { activationJobHandlers } from './wallets/activationJobHandlers';
import { transferJobHandlers } from './wallets/transferJobHandlers';
import { dispatchWalletJobs } from './wallets/walletJobHandlers';
import { activationRoute, isActivationPath } from './wallets/activationRoute';
import { transferRoute, isTransferCommandPath } from './wallets/transferRoute';
import { parseResourceId } from '../../../shared/v3/primitives';

// Replacement entrypoint. Intentionally does not import the V1/V2 router tree.
export default {
	async scheduled(_controller: ScheduledController, env: WalletCoreV3Bindings): Promise<void> {
		const results = await Promise.allSettled([creationJobHandlers.wake(env), activationJobHandlers.wake(env), transferJobHandlers.wake(env)]);
		if (results.some((result) => result.status === 'rejected')) throw new Error('WALLET_SCHEDULER_FAILED');
	},
	async queue(batch: MessageBatch<unknown>, env: WalletCoreV3Bindings): Promise<void> {
		await dispatchWalletJobs(batch, env);
	},
  async fetch(request: Request, env: WalletCoreV3Bindings, ctx?: ExecutionContext): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/health/live') return Response.json({ service: 'wallet-core-v3', status: 'ok', ready: false },
      { headers: { 'Cache-Control': 'no-store' } });
    if (path !== EMAIL_LINK_PATH && path !== CLIENT_COMPATIBILITY_PATH && !isWalletReadPath(path) && !isEnrollmentPath(path) && !isInitializationPath(path) && !isCreationOperationPath(path) && !isActivationPath(path) && !isTransferCommandPath(path)) return Response.json({ error_code: 'NOT_FOUND' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } });
    try {
      const config = configuredEnvironment(env);
      if (isTransferCommandPath(path)) return await transferRoute(request, env, config);
      if (isActivationPath(path)) return await activationRoute(request, env, config);
      if (isCreationOperationPath(path)) {
        const response = await creationOperationRoute(request, env, config);
        if (ctx && response.ok && request.method === 'POST' && path.endsWith('/authorize')) {
          const id = parseResourceId('operation', path.split('/')[4]);
          // A best-effort wake-up is not part of financial authorization. Cron
          // recovers the durable job if this notification fails or is interrupted.
          ctx.waitUntil(creationJobHandlers.wake(env, id).catch(() => {
            console.warn({ event: 'v3_creation_wake_failed' });
          }));
        }
        return response;
      }
      if (isInitializationPath(path)) return await initializationRoute(request, env, config);
      if (isEnrollmentPath(path)) return await enrollmentRoute(request, env, config);
      if (isWalletReadPath(path)) return await walletReadRoute(request, env, config);
      return path === CLIENT_COMPATIBILITY_PATH ? clientCompatibilityRoute(request, config) : await emailLinkRoute(request, env, config);
    }
    catch { return Response.json({ error_code: 'SERVICE_UNAVAILABLE' }, { status: 503,
      headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } }); }
  },
} satisfies ExportedHandler<WalletCoreV3Bindings>;
