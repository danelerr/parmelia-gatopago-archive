import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import environments from '@gatopago/environment/environments.json';
import { parseEnvironment } from '@gatopago/environment';
import { buildAuthConfig, type EnabledAuthConfig } from '../src/auth/config';
import { CLIENT_STATUS_HEADER, clientMutationHeaders } from '@gatopago/shared/v3/client-release';
import { initializationFixture } from '../../../server/test/fixtures/v3Initialization';
import { activationWireFixture } from './activation.fixture';
import { transferFixture } from '../../../server/test/fixtures/v3Transfer';
import { createResourceId } from '@gatopago/shared/v3/primitives';

const sdk = vi.hoisted(() => ({
  getApps: vi.fn(() => []), initializeApp: vi.fn(() => ({})), initializeAuth: vi.fn(),
  connectAuthEmulator: vi.fn(), getRedirectResult: vi.fn(), authStateReady: vi.fn(),
  onIdTokenChanged: vi.fn(), signInWithPopup: vi.fn(), signInWithRedirect: vi.fn(),
  sendSignInLinkToEmail: vi.fn(), signInWithEmailLink: vi.fn(), signOut: vi.fn(),
  setCustomParameters: vi.fn(),
}));
vi.mock('firebase/app', () => ({ getApps: sdk.getApps, initializeApp: sdk.initializeApp }));
vi.mock('firebase/auth', () => ({
  ...sdk, browserLocalPersistence: 'local', browserPopupRedirectResolver: 'popup',
  GoogleAuthProvider: class { setCustomParameters = sdk.setCustomParameters; },
}));

const env = parseEnvironment(environments.staging);
const local = buildAuthConfig(env, { nodeEnv: 'development', localAuth: '1' }) as EnabledAuthConfig;
const remote = buildAuthConfig({ ...env, status: 'provisioned', firebase_project_id: 'gatopago-staging-test' }, {
  apiKey: `AIza${'A'.repeat(35)}`, appId: '1:123456789:web:012345abcdef', turnstileSiteKey: `0x${'A'.repeat(22)}`,
}) as EnabledAuthConfig;
let auth: { currentUser: null | { uid: string; email: string; displayName: null; emailVerified: boolean }; authStateReady: typeof sdk.authStateReady };

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  sdk.getApps.mockReturnValue([]);
  sdk.getRedirectResult.mockResolvedValue(null); sdk.authStateReady.mockResolvedValue(undefined);
  sdk.signInWithPopup.mockResolvedValue({}); sdk.signInWithRedirect.mockResolvedValue(undefined);
  sdk.sendSignInLinkToEmail.mockResolvedValue(undefined); sdk.signInWithEmailLink.mockResolvedValue({}); sdk.signOut.mockResolvedValue(undefined);
  auth = { currentUser: null, authStateReady: sdk.authStateReady };
  sdk.initializeAuth.mockReturnValue(auth);
  vi.stubGlobal('window', { location: { origin: local.webOrigin }, matchMedia: () => ({ matches: false }) });
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe('Firebase browser boundary (SDK mocked, no external I/O)', () => {
  it('captures transfer preparation without I/O and rejects same-UID session replacement', async () => {
    vi.stubGlobal('window', { location: { origin: remote.webOrigin } });
    const user = { uid: 'one', email: 'one@example.test', displayName: null, emailVerified: true, getIdToken: vi.fn() };
    auth.currentUser = user;
    const runtime = (await import('../src/auth/browser')).getBrowserAuth(remote); await runtime.ready;
    expect(() => runtime.transferPreparations('two')).toThrow('auth/session-changed');
    const session = runtime.transferPreparations('one'), commands = runtime.transferCommands('one'), contexts = runtime.accountContexts('one');
    expect(() => runtime.accountContexts('two')).toThrow('auth/session-changed');
    expect(() => runtime.transferCommands('two')).toThrow('auth/session-changed');
    expect(user.getIdToken).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    const f = transferFixture(), selected = { wallet_id: f.request.wallet_id, wallet_account_id: createResourceId('walletAccount'),
      network_id: f.request.network_id, account_id: f.context.account_id, address: f.context.account,
      deployment: { document: f.approval.security_evidence.document, digest: f.context.deployment_digest } };
    auth.currentUser = { ...user };
    await expect(contexts.read({ id:selected.wallet_account_id,wallet_id:selected.wallet_id,network_id:selected.network_id },new AbortController().signal))
      .rejects.toMatchObject({ code:'auth/session-changed' });
    await expect(session.prepare(selected,f.request,new AbortController().signal)).rejects.toMatchObject({ code: 'auth/session-changed' });
    await expect(session.read(selected,f.request,createResourceId('operation'),new AbortController().signal)).rejects.toMatchObject({ code: 'auth/session-changed' });
    await expect(commands.confirm(selected,f.request,{ wire:null },[],new AbortController().signal)).rejects.toMatchObject({ code:'auth/session-changed' });
    await expect(commands.deliver(selected,f.request,{ wire:null },null,new AbortController().signal)).rejects.toMatchObject({ code:'auth/session-changed' });
    expect(user.getIdToken).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it('does not admit account context from HTTP or emulator configuration', async () => {
    const user = { uid:'one',email:'one@example.test',displayName:null,emailVerified:true,getIdToken:vi.fn() };
    auth.currentUser = user;
    const runtime = (await import('../src/auth/browser')).getBrowserAuth(local); await runtime.ready;
    await expect(runtime.accountContexts('one').read({ id:createResourceId('walletAccount'),wallet_id:createResourceId('wallet'),network_id:'eip155:84532' },
      new AbortController().signal)).rejects.toMatchObject({ code:'wallet/unavailable' });
    expect(user.getIdToken).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it('binds activation and local external proof methods to the captured session, without construction I/O', async () => {
    vi.stubGlobal('window', { location: { origin: remote.webOrigin } });
    const user = { uid: 'one', email: 'one@example.test', displayName: null, emailVerified: true, getIdToken: vi.fn() };
    auth.currentUser = user;
    const runtime = (await import('../src/auth/browser')).getBrowserAuth(remote); await runtime.ready;
    const t = activationWireFixture(), c = t.commit();
    await expect(runtime.activation('two', t.f.pin)).rejects.toMatchObject({ code: 'auth/session-changed' });
    const session = await runtime.activation('one', t.f.pin), signal = new AbortController().signal;
    expect(user.getIdToken).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    auth.currentUser = { ...user };
    expect(() => session.externalProofRequest(t.choice, { wire: t.wire }, 0)).toThrow();
    const proof = t.f.assertion(t.compiled.digest);
    for (const action of [() => session.prepare(t.choice, signal), () => session.restore(t.choice, signal),
      () => session.authorize(t.choice, { wire: t.wire }, proof, [], signal),
      () => session.prepareCommit(t.choice, t.parent, c.commitId, signal),
      () => session.restoreCommit(t.choice, t.parent, c.commitId, signal),
      () => session.authorizeCommit(t.choice, t.parent, { wire: c.wire }, c.commitId, proof, signal),
      () => session.importExternalProof(t.choice, { wire: t.wire }, 0, '{}', signal)]) {
      await expect(action()).rejects.toMatchObject({ code: 'auth/session-changed' });
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it('discards a locally verified external proof after same-UID session replacement, without fetching a token', async () => {
    vi.stubGlobal('window', { location: { origin: remote.webOrigin } });
    const user = { uid: 'one', email: 'one@example.test', displayName: null, emailVerified: true, getIdToken: vi.fn() };
    auth.currentUser = user;
    const runtime = (await import('../src/auth/browser')).getBrowserAuth(remote); await runtime.ready;
    const t = activationWireFixture(), session = await runtime.activation('one', t.f.pin);
    const index = t.compiled.enrollments.find((p) => t.compiled.nextPolicy.signers[p.signerIndex].kind === 0)!.signerIndex;
    const request = session.externalProofRequest(t.choice, { wire: t.wire }, index);
    const key = t.f.keys.find((key) => key.address.toLowerCase() === request.summary.signer_address)!;
    const signature = await key.signTypedData(request.typedData);
    const text = JSON.stringify({ schema_version: 1, purpose: 'gatopago-v3-enrollment-proof', activation_id: t.choice.activationId,
      signer_index: index, digest: request.summary.digest, signature });
    const pending = session.importExternalProof(t.choice, { wire: t.wire }, index, text, new AbortController().signal);
    auth.currentUser = { ...user };
    await expect(pending).rejects.toMatchObject({ code: 'auth/session-changed' });
    expect(user.getIdToken).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it('never sends an activation token if the user signs out while it refreshes', async () => {
    vi.stubGlobal('window', { location: { origin: remote.webOrigin } });
    let resolve!: (token: string) => void;
    auth.currentUser = { uid: 'one', email: 'one@example.test', displayName: null, emailVerified: true };
    Object.assign(auth.currentUser, { getIdToken: () => new Promise<string>((done) => { resolve = done; }) });
    const runtime = (await import('../src/auth/browser')).getBrowserAuth(remote); await runtime.ready;
    const t = activationWireFixture(), session = await runtime.activation('one', t.f.pin);
    const task = session.restore(t.choice, new AbortController().signal);
    auth.currentUser = null; resolve('obsolete.token.signature');
    await expect(task).rejects.toMatchObject({ code: 'auth/session-changed' }); expect(fetch).not.toHaveBeenCalled();
  });
  it('discards an activation response if the same UID logs in with a new session', async () => {
    vi.stubGlobal('window', { location: { origin: remote.webOrigin } });
    const user = { uid: 'one', email: 'one@example.test', displayName: null, emailVerified: true, getIdToken: vi.fn(async () => 'test.token.signature') };
    auth.currentUser = user;
    const runtime = (await import('../src/auth/browser')).getBrowserAuth(remote); await runtime.ready;
    const t = activationWireFixture(), session = await runtime.activation('one', t.f.pin);
    vi.stubGlobal('fetch', vi.fn(async () => { auth.currentUser = { ...user }; return Response.json(t.wire); }));
    await expect(session.restore(t.choice, new AbortController().signal)).rejects.toMatchObject({ code: 'auth/session-changed' });
  });
  it('captures creation without I/O and rejects a replaced Firebase session before loading an operation', async () => {
    vi.stubGlobal('window', { location: { origin: remote.webOrigin } });
    const user = { uid: 'one', email: 'one@example.test', displayName: null, emailVerified: true, getIdToken: vi.fn() };
    auth.currentUser = user;
    const runtime = (await import('../src/auth/browser')).getBrowserAuth(remote); await runtime.ready;
    const session = await runtime.creationOperation('one', initializationFixture().pin);
    expect(user.getIdToken).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); auth.currentUser = { ...user };
    expect(session.assertCurrent).toThrow('auth/session-changed');
  });
  it('captures initialization without I/O and rejects a replacement session even with the same UID', async () => {
    vi.stubGlobal('window', { location: { origin: remote.webOrigin } });
    const user = { uid: 'one', email: 'one@example.test', displayName: null, emailVerified: true, getIdToken: vi.fn() };
    auth.currentUser = user;
    const runtime = (await import('../src/auth/browser')).getBrowserAuth(remote); await runtime.ready;
    const fixture = initializationFixture();
    await expect(runtime.initialization('two', fixture.pin)).rejects.toMatchObject({ code: 'auth/session-changed' });
    const session = await runtime.initialization('one', fixture.pin);
    expect(user.getIdToken).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    auth.currentUser = { ...user };
    await expect(session.history(null, new AbortController().signal)).rejects.toMatchObject({ code: 'auth/session-changed' });
    await expect(session.prepare({ request_id: 'op_00000000-0000-4000-8000-000000000001',
      credential_ref: 'op_00000000-0000-4000-8000-000000000002', user_salt_commitment: fixture.input.userSaltCommitment },
    new AbortController().signal)).rejects.toMatchObject({ code: 'auth/session-changed' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('discards a history response after the captured Firebase session is replaced', async () => {
    vi.stubGlobal('window', { location: { origin: remote.webOrigin } });
    const user = { uid: 'one', email: 'one@example.test', displayName: null, emailVerified: true, getIdToken: vi.fn(async () => 'test.token.signature') };
    auth.currentUser = user;
    const runtime = (await import('../src/auth/browser')).getBrowserAuth(remote); await runtime.ready;
    const session = await runtime.initialization('one', initializationFixture().pin);
    vi.stubGlobal('fetch', vi.fn(async () => {
      auth.currentUser = { ...user };
      return Response.json({ observed_at: Math.floor(Date.now() / 1000), data: [], next_cursor: null });
    }));
    await expect(session.history(null, new AbortController().signal)).rejects.toMatchObject({ code: 'auth/session-changed' });
  });
  it('does not send an initialization token after sign-out during refresh', async () => {
    vi.stubGlobal('window', { location: { origin: remote.webOrigin } });
    let resolve!: (token: string) => void;
    auth.currentUser = { uid: 'one', email: 'one@example.test', displayName: null, emailVerified: true };
    Object.assign(auth.currentUser, { getIdToken: () => new Promise<string>((done) => { resolve = done; }) });
    const runtime = (await import('../src/auth/browser')).getBrowserAuth(remote); await runtime.ready;
    const fixture = initializationFixture(), session = await runtime.initialization('one', fixture.pin);
    const operation = session.prepare({ request_id: 'op_00000000-0000-4000-8000-000000000001',
      credential_ref: 'op_00000000-0000-4000-8000-000000000002', user_salt_commitment: fixture.input.userSaltCommitment }, new AbortController().signal);
    auth.currentUser = null; resolve('old.token.signature');
    await expect(operation).rejects.toMatchObject({ code: 'auth/session-changed' }); expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects SSR before creating Firebase app state', async () => {
    vi.stubGlobal('window', undefined);
    const { getBrowserAuth } = await import('../src/auth/browser');
    expect(() => getBrowserAuth(local)).toThrow('server');
    expect(sdk.initializeApp).not.toHaveBeenCalled();
  });
  it('reuses one runtime and initializes persistence before redirect reads', async () => {
    const { getBrowserAuth } = await import('../src/auth/browser');
    const runtime = getBrowserAuth(local); await runtime.ready;
    expect(getBrowserAuth(local)).toBe(runtime);
    expect(sdk.initializeAuth).toHaveBeenCalledExactlyOnceWith({}, { persistence: 'local', popupRedirectResolver: 'popup' });
    expect(sdk.connectAuthEmulator).toHaveBeenCalledExactlyOnceWith(auth, 'http://127.0.0.1:9099');
    expect(sdk.connectAuthEmulator.mock.invocationCallOrder[0]).toBeLessThan(sdk.getRedirectResult.mock.invocationCallOrder[0]);
    expect(sdk.getRedirectResult).toHaveBeenCalledOnce();
  });
  it('does not invoke login, keys or recovery merely by entering the account screen', async () => {
    const runtime = (await import('../src/auth/browser')).getBrowserAuth(local); await runtime.ready;
    expect(runtime.current()).toBeNull();
    expect(sdk.signInWithPopup).not.toHaveBeenCalled(); expect(sdk.signInWithEmailLink).not.toHaveBeenCalled();
    expect(sdk.sendSignInLinkToEmail).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it('blocks PWA reload during session restoration and releases on failure', async () => {
    let reject!: (error: Error) => void;
    sdk.getRedirectResult.mockImplementation(() => new Promise((_, failure) => { reject = failure; }));
    const runtime = (await import('../src/auth/browser')).getBrowserAuth(local);
    const guard = await import('../src/pwa/reload-guard');
    expect(guard.isReloadBlocked()).toBe(true);
    reject(new Error('Session restoration failed'));
    await expect(runtime.ready).rejects.toThrow('restoration');
    expect(guard.isReloadBlocked()).toBe(false);
  });
  it('does not silently reuse changed Firebase configuration', async () => {
    vi.stubGlobal('window', { location: { origin: remote.webOrigin } });
    const { getBrowserAuth } = await import('../src/auth/browser');
    getBrowserAuth(remote);
    expect(() => getBrowserAuth({ ...remote, firebase: { ...remote.firebase, appId: '1:456:web:abcdef' } })).toThrow('changed');
  });
  it('confines synthetic sends to the emulator and never calls the remote API', async () => {
    const runtime = (await import('../src/auth/browser')).getBrowserAuth(local); await runtime.ready;
    expect(await runtime.sendLink('V3@example.test', '', 'es')).toBe(60);
    expect(sdk.sendSignInLinkToEmail).toHaveBeenCalledExactlyOnceWith(auth, 'v3@example.test', {
      url: `${local.webOrigin}/login?flow=signin&lang=es`, handleCodeInApp: true,
    });
    await expect(runtime.sendLink('person@example.com', '', 'es')).rejects.toMatchObject({ code: 'auth/test-email-required' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('remote sends go only to the guarded Wallet Core route, never the SDK send', async () => {
    vi.stubGlobal('window', { location: { origin: remote.webOrigin } });
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sent: true, resendAfterSeconds: 60 }), { status: 202 }));
    vi.stubGlobal('fetch', request);
    const runtime = (await import('../src/auth/browser')).getBrowserAuth(remote); await runtime.ready;
    await expect(runtime.sendLink('person@example.test', '', 'en')).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
    await runtime.sendLink('person@example.test', 'one-use-token', 'en');
    expect(request).toHaveBeenCalledExactlyOnceWith(remote.emailRequestUrl, expect.objectContaining({
      method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...clientMutationHeaders('staging') },
      body: JSON.stringify({ email: 'person@example.test', turnstileToken: 'one-use-token', locale: 'en' }),
    }));
    expect(sdk.sendSignInLinkToEmail).not.toHaveBeenCalled();
    expect(sdk.connectAuthEmulator).not.toHaveBeenCalled();
  });
  it('does not treat an HTTP error as delivered or automatically retry', async () => {
    vi.stubGlobal('window', { location: { origin: remote.webOrigin } });
    const request = vi.fn().mockResolvedValue(new Response('', { status: 429 })); vi.stubGlobal('fetch', request);
    const runtime = (await import('../src/auth/browser')).getBrowserAuth(remote); await runtime.ready;
    await expect(runtime.sendLink('person@example.test', 'one-use-token', 'es')).rejects.toMatchObject({ code: 'auth/too-many-requests' });
    expect(request).toHaveBeenCalledOnce();
  });
  it('makes a compatibility rejection sticky until reload, without retries, SDK fallback or forced reload', async () => {
    const reload = vi.fn();
    vi.stubGlobal('window', { location: { origin: remote.webOrigin, reload } });
    const request = vi.fn().mockResolvedValue(new Response('', { status: 409, headers: { [CLIENT_STATUS_HEADER]: 'update-required' } }));
    vi.stubGlobal('fetch', request);
    const runtime = (await import('../src/auth/browser')).getBrowserAuth(remote); await runtime.ready;
    for (let attempt = 0; attempt < 3; attempt++) {
      await expect(runtime.sendLink('person@example.test', 'one-use-token', 'es')).rejects.toMatchObject({ code: 'client/update-required' });
    }
    expect(request).toHaveBeenCalledOnce();
    expect(sdk.sendSignInLinkToEmail).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    const guard = await import('../src/pwa/reload-guard');
    expect(guard.isReloadBlocked()).toBe(false);
    await runtime.logout();
    expect(sdk.signOut).toHaveBeenCalledOnce();
  });
  it('does not classify other conflicts or unavailable responses as a retired client', async () => {
    vi.stubGlobal('window', { location: { origin: remote.webOrigin } });
    const request = vi.fn().mockResolvedValueOnce(new Response('', { status: 409 }))
      .mockResolvedValueOnce(new Response('', { status: 503, headers: { [CLIENT_STATUS_HEADER]: 'update-required' } }));
    vi.stubGlobal('fetch', request);
    const runtime = (await import('../src/auth/browser')).getBrowserAuth(remote); await runtime.ready;
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(runtime.sendLink('person@example.test', 'token', 'es')).rejects.toMatchObject({ code: 'auth/email-unavailable' });
    }
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('does not turn a dismissed Google popup into a redirect', async () => {
    vi.stubGlobal('window', { location: { origin: remote.webOrigin }, matchMedia: () => ({ matches: false }) });
    sdk.signInWithPopup.mockRejectedValue({ code: 'auth/popup-closed-by-user' });
    const runtime = (await import('../src/auth/browser')).getBrowserAuth(remote); await runtime.ready;
    await expect(runtime.google()).rejects.toMatchObject({ code: 'auth/popup-closed-by-user' });
    expect(sdk.signInWithRedirect).not.toHaveBeenCalled();
  });
  it('offers redirect for a blocked popup, not for all errors', async () => {
    vi.stubGlobal('window', { location: { origin: remote.webOrigin }, matchMedia: () => ({ matches: false }) });
    sdk.signInWithPopup.mockRejectedValue({ code: 'auth/popup-blocked' });
    const runtime = (await import('../src/auth/browser')).getBrowserAuth(remote); await runtime.ready;
    await runtime.google(); expect(sdk.signInWithRedirect).toHaveBeenCalledOnce();
  });
  it('uses redirect for an installed PWA in remote mode', async () => {
    vi.stubGlobal('window', { location: { origin: remote.webOrigin }, matchMedia: () => ({ matches: true }) });
    const runtime = (await import('../src/auth/browser')).getBrowserAuth(remote); await runtime.ready;
    await runtime.google(); expect(sdk.signInWithRedirect).toHaveBeenCalledOnce(); expect(sdk.signInWithPopup).not.toHaveBeenCalled();
  });
  it('prevents overlapping authentication mutations', async () => {
    let resolve!: () => void;
    sdk.signInWithPopup.mockImplementation(() => new Promise<void>((done) => { resolve = done; }));
    const runtime = (await import('../src/auth/browser')).getBrowserAuth(local); await runtime.ready;
    const guard = await import('../src/pwa/reload-guard');
    const first = runtime.google();
    expect(guard.isReloadBlocked()).toBe(true);
    expect(guard.reloadPage()).toBe(false);
    await expect(runtime.google()).rejects.toMatchObject({ code: 'auth/busy' });
    await expect(runtime.logout()).rejects.toMatchObject({ code: 'auth/busy' });
    expect(sdk.signInWithPopup).toHaveBeenCalledOnce();
    resolve(); await first;
    expect(guard.isReloadBlocked()).toBe(false);
    await runtime.logout(); expect(sdk.signOut).toHaveBeenCalledOnce();
  });
  it('does not silently replace another signed-in identity or consume foreign links', async () => {
    const runtime = (await import('../src/auth/browser')).getBrowserAuth(local); await runtime.ready;
    const link = `${local.webOrigin}/login?mode=signIn&oobCode=synthetic&apiKey=fake-api-key`;
    auth.currentUser = { uid: 'identity-not-wallet', email: 'first@example.test', displayName: null, emailVerified: true };
    await expect(runtime.completeLink('second@example.test', link)).rejects.toMatchObject({ code: 'auth/identity-mismatch' });
    await expect(runtime.completeLink('first@example.test', link.replace('signIn', 'resetPassword'))).rejects.toMatchObject({ code: 'auth/invalid-action-code' });
    expect(sdk.signInWithEmailLink).not.toHaveBeenCalled();
    await runtime.completeLink('first@example.test', link); expect(sdk.signInWithEmailLink).toHaveBeenCalledOnce();
    expect(runtime.current()?.uid).toBe('identity-not-wallet');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('binds wallet reads to the current Firebase user and rejects a different expected UID', async () => {
    vi.stubGlobal('window', { location: { origin: remote.webOrigin } });
    const user = { uid: 'one', email: 'one@example.test', displayName: null, emailVerified: true, getIdToken: vi.fn().mockResolvedValue('one.token.signature') };
    auth.currentUser = user;
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: [], next_cursor: null })); vi.stubGlobal('fetch', fetchMock);
    const runtime = (await import('../src/auth/browser')).getBrowserAuth(remote); await runtime.ready;
    await expect(runtime.wallets('two', new AbortController().signal)).rejects.toMatchObject({ code: 'auth/session-changed' });
    expect(user.getIdToken).not.toHaveBeenCalled();
    expect(await runtime.wallets('one', new AbortController().signal)).toEqual({ data: [], next_cursor: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('does not send a token if the user changes while Firebase refreshes it', async () => {
    vi.stubGlobal('window', { location: { origin: remote.webOrigin } });
    let resolve!: (token: string) => void;
    const user = { uid: 'one', email: 'one@example.test', displayName: null, emailVerified: true,
      getIdToken: () => new Promise<string>((done) => { resolve = done; }) };
    auth.currentUser = user;
    const runtime = (await import('../src/auth/browser')).getBrowserAuth(remote); await runtime.ready;
    const operation = runtime.wallets('one', new AbortController().signal);
    auth.currentUser = null;
    resolve('old.token.signature');
    await expect(operation).rejects.toMatchObject({ code: 'auth/session-changed' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not return old-user wallet data if sign-out occurs during the HTTP request', async () => {
    vi.stubGlobal('window', { location: { origin: remote.webOrigin } });
    auth.currentUser = { uid: 'one', email: 'one@example.test', displayName: null, emailVerified: true };
    Object.assign(auth.currentUser, { getIdToken: async () => 'one.token.signature' });
    vi.stubGlobal('fetch', vi.fn(async () => { auth.currentUser = null; return Response.json({ data: [], next_cursor: null }); }));
    const runtime = (await import('../src/auth/browser')).getBrowserAuth(remote); await runtime.ready;
    await expect(runtime.wallets('one', new AbortController().signal)).rejects.toMatchObject({ code: 'auth/session-changed' });
  });
  it('captures one exact Firebase session for all enrollment stages, including same-UID replacement', async () => {
    vi.stubGlobal('window', { location: { origin: remote.webOrigin } });
    const user = { uid: 'one', email: 'one@example.test', displayName: null, emailVerified: true, getIdToken: vi.fn() };
    auth.currentUser = user;
    const runtime = (await import('../src/auth/browser')).getBrowserAuth(remote); await runtime.ready;
    expect(() => runtime.enrollment('two')).toThrow('session-changed');
    const session = runtime.enrollment('one'); session.assertCurrent();
    expect(user.getIdToken).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    auth.currentUser = { ...user };
    expect(() => session.assertCurrent()).toThrow('session-changed');
    await expect(session.prepare('op_00000000-0000-4000-8000-000000000001', new AbortController().signal)).rejects.toMatchObject({ code: 'auth/session-changed' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('binds read-only credential inventory to an exact session without acquiring a token on capture', async () => {
    vi.stubGlobal('window', { location: { origin: remote.webOrigin } });
    const user = { uid: 'one', email: 'one@example.test', displayName: null, emailVerified: true, getIdToken: vi.fn() };
    auth.currentUser = user;
    const runtime = (await import('../src/auth/browser')).getBrowserAuth(remote); await runtime.ready;
    expect(() => runtime.credentialInventory('two')).toThrow('session-changed');
    const session = runtime.credentialInventory('one'); session.assertCurrent();
    expect(user.getIdToken).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    auth.currentUser = { ...user };
    await expect(session.read(new AbortController().signal)).rejects.toMatchObject({ code: 'auth/session-changed' });
    await expect(session.detail('op_00000000-0000-4000-8000-000000000001', new AbortController().signal)).rejects.toMatchObject({ code: 'auth/session-changed' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('never sends a credential-detail token after sign-out during its refresh', async () => {
    vi.stubGlobal('window', { location: { origin: remote.webOrigin } });
    const getIdToken = vi.fn(async () => { auth.currentUser = null; return 'synthetic.token.signature'; });
    auth.currentUser = { uid: 'one', email: 'one@example.test', displayName: null, emailVerified: true, ...{ getIdToken } };
    const runtime = (await import('../src/auth/browser')).getBrowserAuth(remote); await runtime.ready;
    await expect(runtime.credentialInventory('one').detail('op_00000000-0000-4000-8000-000000000001', new AbortController().signal))
      .rejects.toMatchObject({ code: 'auth/session-changed' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('discards credential details after a same-UID session replacement during the request', async () => {
    vi.stubGlobal('window', { location: { origin: remote.webOrigin } });
    const user = { uid: 'one', email: 'one@example.test', displayName: null, emailVerified: true, getIdToken: vi.fn(async () => 'synthetic.token.signature') };
    auth.currentUser = user;
    const runtime = (await import('../src/auth/browser')).getBrowserAuth(remote); await runtime.ready;
    const t = activationWireFixture(), p = t.choice.consent.preparation;
    vi.stubGlobal('fetch', vi.fn(async () => {
      auth.currentUser = { ...user };
      return Response.json({ scope: t.choice.consent.expected.scope, credential_ref: p.credential_ref,
        credential_id: p.credential_id, public_key: p.public_key, device_availability: 'unknown', onchain_authority: 'not_assessed' });
    }));
    await expect(runtime.credentialInventory('one').detail(p.credential_ref, new AbortController().signal))
      .rejects.toMatchObject({ code: 'auth/session-changed' });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('discards an inventory response if the session ends during the HTTP request', async () => {
    vi.stubGlobal('window', { location: { origin: remote.webOrigin } });
    auth.currentUser = { uid: 'one', email: 'one@example.test', displayName: null, emailVerified: true };
    Object.assign(auth.currentUser, { getIdToken: async () => 'one.token.signature' });
    vi.stubGlobal('fetch', vi.fn(async () => {
      auth.currentUser = null;
      return Response.json({ scope: { rpId: env.webauthn_rp_id, origin: remote.webOrigin }, data: [],
        device_availability: 'unknown', onchain_authority: 'not_assessed' });
    }));
    const runtime = (await import('../src/auth/browser')).getBrowserAuth(remote); await runtime.ready;
    await expect(runtime.credentialInventory('one').read(new AbortController().signal)).rejects.toMatchObject({ code: 'auth/session-changed' });
  });
  it('does not leak an enrollment token after sign-out during refresh', async () => {
    vi.stubGlobal('window', { location: { origin: remote.webOrigin } });
    let resolve!: (token: string) => void;
    auth.currentUser = { uid: 'one', email: 'one@example.test', displayName: null, emailVerified: true };
    Object.assign(auth.currentUser, { getIdToken: () => new Promise<string>((done) => { resolve = done; }) });
    const runtime = (await import('../src/auth/browser')).getBrowserAuth(remote); await runtime.ready;
    const pending = runtime.enrollment('one').prepare('op_00000000-0000-4000-8000-000000000001', new AbortController().signal);
    auth.currentUser = null; resolve('old.token.signature');
    await expect(pending).rejects.toMatchObject({ code: 'auth/session-changed' }); expect(fetch).not.toHaveBeenCalled();
  });
  it('discards an enrollment receipt if the session changes during HTTP', async () => {
    vi.stubGlobal('window', { location: { origin: remote.webOrigin } });
    auth.currentUser = { uid: 'one', email: 'one@example.test', displayName: null, emailVerified: true };
    Object.assign(auth.currentUser, { getIdToken: async () => 'one.token.signature' });
    const id = 'op_00000000-0000-4000-8000-000000000001';
    vi.stubGlobal('fetch', vi.fn(async () => { auth.currentUser = null; return Response.json({ enrollment_id: id, state: 'enrolled', onchain_authority: false }); }));
    const runtime = (await import('../src/auth/browser')).getBrowserAuth(remote); await runtime.ready;
    const submission = { credential_id: 'AA', client_data: 'e30', attestation: 'oA', transports: [], proof: { authenticator_data: 'AA', client_data: 'e30', signature: 'MA' } };
    await expect(runtime.enrollment('one').complete(id, submission, new AbortController().signal)).rejects.toMatchObject({ code: 'auth/session-changed' });
  });
});
