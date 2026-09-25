'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { WebAuthConfig, EnabledAuthConfig } from './config';
import type { BrowserAuth, Identity } from './browser';
import { forgetEmail, normalizeEmail, parseEmailLanding, readPendingEmail, rememberEmail, type EmailLanding } from './email-link';
import { Turnstile } from './Turnstile';
import type { ChallengeState } from './turnstile-lifecycle';
import './auth.css';
import { reloadPage } from '../pwa/reload-guard';
import { isClientUpdateError } from '@gatopago/shared/v3/client-release';
import { ConsumerFrame } from '../consumer/ConsumerFrame';
import { ConsumerContent } from '../consumer/ConsumerContent';
import type { ConsumerView } from '../consumer/routes';
import { IntegrationNotice } from '../consumer/Primitives';


function browserStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  try { return window.localStorage; }
  catch { return { getItem: () => null, setItem: () => undefined, removeItem: () => undefined }; }
}

function messageFor(error: unknown, en: boolean): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return en ? 'Sign-in was cancelled. You can try again.' : 'Cancelaste el acceso. Puedes intentarlo de nuevo.';
  if (code === 'auth/invalid-action-code' || code === 'auth/expired-action-code' || code === 'auth/invalid-email') return en ? 'This link is invalid, expired, already used, or belongs to a different email.' : 'El enlace no es válido, venció, ya se usó o corresponde a otro correo.';
  if (code === 'auth/too-many-requests') return en ? 'Too many attempts. Wait before requesting another link.' : 'Hay demasiados intentos. Espera antes de pedir otro enlace.';
  if (code === 'auth/test-email-required') return en ? 'For this local test, use an address ending in @example.test.' : 'Para esta prueba local, usa un correo terminado en @example.test.';
  if (code === 'auth/identity-mismatch') return en ? 'Sign out before using a link for another account.' : 'Cierra la sesión antes de usar un enlace de otra cuenta.';
  return en ? 'We could not confirm this operation. Check your connection and try again. A requested email may still arrive.' : 'No pudimos confirmar la operación. Revisa tu conexión e inténtalo de nuevo. Si pediste un correo, todavía podría llegar.';
}

export function AuthScreen({ config, view, art, english = false }: {
  config: WebAuthConfig; view: ConsumerView; art: ReactNode; english?: boolean;
}) {
  if (config.mode === 'disabled' && view !== 'login') return <ConsumerFrame english={english} navigation><div className="auth-content"><IntegrationNotice english={english} identityOnly /><ConsumerContent view={view} english={english} /></div></ConsumerFrame>;
  if (config.mode === 'disabled') return <ConsumerFrame english={english}><div className="auth-content">
    {art ? <div className="auth-art">{art}</div> : null}
    <h1>{english ? 'V3 sign-in is not enabled yet' : 'El acceso V3 todavía no está habilitado'}</h1>
    <p>{english ? 'This environment has no provisioned identity service. No account or key has been created.' : 'Este ambiente aún no tiene su servicio de identidad configurado. No se creó ninguna cuenta ni llave.'}</p>
    <p>{english ? 'Do not send funds to test this version.' : 'No envíes fondos para probar esta versión.'}</p>
    <a className="auth-secondary" href={english ? '/en' : '/'}>{english ? 'Back to GatoPago' : 'Volver a GatoPago'}</a>
  </div></ConsumerFrame>;
  return <EnabledAuthScreen config={config} view={view} art={art} english={english} />;
}

function EnabledAuthScreen({ config, view, art, english: en }: {
  config: EnabledAuthConfig; view: ConsumerView; art: ReactNode; english: boolean;
}) {
  const router = useRouter();
  const [runtime, setRuntime] = useState<BrowserAuth | null>(null);
  const [user, setUser] = useState<Identity | null>(null);
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState(false);
  const [link, setLink] = useState<EmailLanding>({ kind: 'none' });
  const [email, setEmail] = useState('');
  const [emailOpen, setEmailOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updateRequired, setUpdateRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [clock, setClock] = useState(0);
  const [resendAt, setResendAt] = useState(0);
  const [challenge, setChallenge] = useState<ChallengeState>({ status: 'loading', token: null });
  const [challengeRevision, setChallengeRevision] = useState(0);
  const captured = useRef<EmailLanding | null>(null);
  const autoStarted = useRef(false);
  const pending = useRef(false);
  const alive = useRef(false);
  const suffix = en ? '?lang=en' : '';

  useEffect(() => {
    let cancelled = false;
    alive.current = true;
    let unsubscribe: (() => void) | undefined;
    const timeout = window.setTimeout(() => { if (!cancelled) setInitError(true); }, 15_000);
    if (view === 'login' && captured.current === null) {
      captured.current = parseEmailLanding(window.location.href, config);
      // Retain the code only in this component's memory, not the address bar/history.
      window.history.replaceState(window.history.state, '', `/login${suffix}`);
    }
    void import('./browser').then(async ({ getBrowserAuth }) => {
      if (cancelled) return;
      const client = getBrowserAuth(config);
      await client.ready;
      if (cancelled) return;
      window.clearTimeout(timeout);
      const initial = captured.current ?? { kind: 'none' as const };
      const remembered = readPendingEmail(browserStorage(), config.firebase.projectId, Date.now());
      setRuntime(client); setUser(client.current()); setReady(true); setInitError(false);
      setLink(initial); setEmail(remembered?.email ?? ''); setClock(Date.now());
      if (remembered) setResendAt(remembered.requestedAt + 60_000);
      if (initial.kind === 'invalid') setError(en ? 'This is not a valid V3 sign-in link.' : 'Este no es un enlace válido de acceso V3.');
      unsubscribe = client.subscribe((next) => { if (!cancelled) setUser(next); });
      // Same-device links finish without another email or confirmation ceremony.
      // Cross-device links still require typing the email (never read it from the URL).
      if (initial.kind === 'signin' && remembered && !client.current() && !autoStarted.current) {
        autoStarted.current = true; pending.current = true; setBusy(true);
        try {
          await client.completeLink(remembered.email, initial.url);
          forgetEmail(browserStorage());
          if (!cancelled) router.replace(`/app${suffix}`);
        } catch (failure) {
          if (!cancelled) setError(messageFor(failure, en));
        } finally {
          pending.current = false;
          if (!cancelled) { setBusy(false); setSlow(false); }
        }
      }
    }).catch(() => { if (!cancelled) setInitError(true); });
    return () => { cancelled = true; alive.current = false; unsubscribe?.(); window.clearTimeout(timeout); };
  }, [config, view, en, suffix, router]);

  useEffect(() => {
    if (!busy) return;
    const timer = window.setTimeout(() => setSlow(true), 25_000);
    return () => window.clearTimeout(timer);
  }, [busy]);
  useEffect(() => {
    if (resendAt <= Date.now()) return;
    const timer = window.setInterval(() => {
      const now = Date.now(); setClock(now);
      if (now >= resendAt) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendAt]);

  async function perform(action: () => Promise<void>) {
    if (pending.current || !runtime) return;
    pending.current = true; setBusy(true); setSlow(false); setError(null);
    try { await action(); }
    catch (failure) {
      if (alive.current) {
        if (isClientUpdateError(failure)) setUpdateRequired(true);
        else setError(messageFor(failure, en));
      }
    }
    finally {
      pending.current = false;
      if (alive.current) { setBusy(false); setSlow(false); }
    }
  }
  function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeEmail(email);
    if (!normalized) { setError(en ? 'Enter a valid email.' : 'Escribe un correo válido.'); return; }
    if (!runtime || resendAt > Date.now() || (config.mode === 'firebase' && challenge.status !== 'verified')) return;
    void perform(async () => {
      // Uncertain delivery also requires a cooldown; there is no automatic retry.
      setClock(Date.now()); setResendAt(Date.now() + 60_000);
      try {
        const delay = await runtime.sendLink(normalized, challenge.token ?? '', en ? 'en' : 'es');
        rememberEmail(browserStorage(), config.firebase.projectId, normalized, Date.now());
        if (alive.current) { setEmail(normalized); setSent(true); setResendAt(Date.now() + delay * 1000); }
      } finally {
        if (alive.current) { setChallenge({ status: 'loading', token: null }); setChallengeRevision((value) => value + 1); }
      }
    });
  }
  function completeLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!runtime || link.kind !== 'signin') return;
    void perform(async () => {
      await runtime.completeLink(email, link.url);
      forgetEmail(browserStorage());
      if (alive.current) router.replace(`/app${suffix}`);
    });
  }
  function logout() {
    if (!runtime) return;
    void perform(async () => {
      await runtime.logout(); forgetEmail(browserStorage());
      if (alive.current) { setEmail(''); router.replace(`/login${suffix}`); }
    });
  }
  const seconds = Math.max(0, Math.ceil((resendAt - clock) / 1000));
  const formReady = config.mode === 'emulator' || challenge.status === 'verified';

  return <ConsumerFrame english={en} navigation={ready && !!user && view !== 'login'}><div className="auth-content">
    {config.mode === 'emulator' ? <p className="auth-local" role="note">{en ? 'Local emulator · no real emails or funds' : 'Emulador local · sin correos ni fondos reales'}</p> : null}
    {art && view === 'login' ? <div className="auth-art">{art}</div> : null}
    {view === 'login' ? <h1>{en ? 'Sign in to GatoPago' : 'Entrar a GatoPago'}</h1> : null}
    {view === 'login' ? <p className="auth-description">{en ? 'Google or your email confirms who you are. Your keys authorize payments separately.' : 'Google o tu correo confirman quién eres. Tus llaves autorizan los pagos por separado.'}</p> : null}
    {initError ? <div className="auth-error" role="alert"><p>{en ? 'Sign-in could not start. Check your connection or reload.' : 'No se pudo iniciar el acceso. Revisa tu conexión o recarga.'}</p>
      <button type="button" onClick={() => window.location.reload()}>{en ? 'Reload' : 'Recargar'}</button></div> : !ready ? <p role="status">{en ? 'Loading sign-in…' : 'Cargando acceso…'}</p> : null}
    {error ? <p className="auth-error" role="alert">{error}</p> : null}
    {updateRequired ? <section className="auth-error" role="alert">
      <h2>{en ? 'Update GatoPago to continue' : 'Actualiza GatoPago para continuar'}</h2>
      <p>{en ? 'This version is no longer compatible. This request was rejected before sending an email. We will not retry it automatically.' : 'Esta versión ya no es compatible. Esta solicitud se rechazó antes de enviar un correo. No la repetiremos automáticamente.'}</p>
      <button type="button" disabled={busy} onClick={() => reloadPage()}>{en ? 'Reload' : 'Recargar'}</button>
      <p>{en ? 'If this message remains, close all GatoPago windows, including the installed app, and reopen it to activate the waiting update.' : 'Si el mensaje continúa, cierra todas las ventanas de GatoPago, incluida la app instalada, y vuelve a abrirla para activar la actualización pendiente.'}</p>
    </section> : null}
    {ready && user ? <section className={view === 'login' ? 'auth-panel' : 'mt-2'}>
      {view === 'login' ? <><h2>{en ? 'Identity confirmed' : 'Identidad confirmada'}</h2>
      <p className="auth-email">{user.email ?? user.displayName ?? (en ? 'Signed-in user' : 'Usuario autenticado')}</p></> : null}
      {link.kind === 'signin' ? <p>{en ? 'You already have a session. Sign out first to use another account’s link.' : 'Ya tienes una sesión. Para usar el enlace de otra cuenta, cierra esta sesión primero.'}</p> : null}
      {view === 'login' ? <a className="auth-primary" href={`/app${suffix}`}>{en ? 'Continue to my account' : 'Continuar a mi cuenta'}</a>
        : <ConsumerContent key={`${user.uid}:${view}`} view={view} english={en} identity={user} runtime={runtime && config.mode === 'firebase' ? runtime : undefined} />}
      {view === 'settings' || view === 'login' ? <button type="button" className="btn btn-danger btn-block mt-6" disabled={busy} onClick={logout}>{en ? 'Sign out' : 'Cerrar sesión'}</button> : null}
    </section> : null}
    {ready && !user && view !== 'login' ? <section className="auth-panel"><p>{en ? 'Sign in to see your account. No private information is available without a session.' : 'Entra para ver tu cuenta. Sin sesión no se muestra información privada.'}</p>
      <a className="auth-primary" href={`/login${suffix}`}>{en ? 'Sign in' : 'Entrar'}</a></section> : null}
    {ready && !user && !updateRequired && view === 'login' && link.kind === 'signin' ? <form className="auth-panel" onSubmit={completeLink}>
      <p>{en ? 'Confirm the email this link was sent to. We will not send another email.' : 'Confirma a qué correo llegó este enlace. No enviaremos otro correo.'}</p>
      <label htmlFor="confirmation-email">{en ? 'Email' : 'Correo'}</label>
      <input id="confirmation-email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} required disabled={busy} />
      <button className="auth-primary" disabled={busy} type="submit">{en ? 'Sign in with this link' : 'Entrar con este enlace'}</button>
      <a href={`/login${suffix}`} className="auth-secondary">{en ? 'Use another sign-in method' : 'Usar otro método de acceso'}</a>
    </form> : null}
    {ready && !user && !updateRequired && view === 'login' && link.kind !== 'signin' ? <section className="auth-panel">
      <button className="auth-primary" type="button" disabled={busy} onClick={() => void perform(async () => {
        await runtime!.google();
        if (alive.current && runtime!.current()) router.replace(`/app${suffix}`);
      })}>{en ? 'Continue with Google' : 'Continuar con Google'}</button>
      {!emailOpen ? <button type="button" className="auth-secondary" disabled={busy} onClick={() => setEmailOpen(true)}>{en ? 'Continue with email' : 'Continuar con correo'}</button> : <form onSubmit={submitEmail}>
        <label htmlFor="signin-email">{en ? 'Email' : 'Correo'}</label>
        <input id="signin-email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} maxLength={254} value={email} onChange={(event) => { setEmail(event.target.value); setSent(false); }} required disabled={busy} />
        {sent ? <p role="status">{en ? `Link requested for ${email}. Check your inbox and spam folder.` : `Enlace solicitado para ${email}. Revisa tu bandeja y spam.`}</p> : null}
        {config.mode === 'firebase' ? <Turnstile key={challengeRevision} siteKey={config.turnstileSiteKey!} onState={setChallenge} english={en} /> : null}
        <button className="auth-primary" type="submit" disabled={busy || seconds > 0 || !formReady}>{seconds > 0 ? (en ? `Wait ${seconds}s` : `Espera ${seconds}s`) : sent ? (en ? 'Request another link' : 'Pedir otro enlace') : (en ? 'Send sign-in link' : 'Enviar enlace de acceso')}</button>
        <button type="button" className="auth-secondary" disabled={busy} onClick={() => setEmailOpen(false)}>{en ? 'Back to options' : 'Volver a las opciones'}</button>
      </form>}
    </section> : null}
    {busy ? <p role="status">{en ? 'Processing…' : 'Procesando…'}</p> : null}
    {slow ? <div className="auth-error" role="alert"><p>{en ? 'This is taking longer than expected. Reload to check the session before trying again.' : 'Está tardando más de lo esperado. Recarga para comprobar la sesión antes de intentarlo otra vez.'}</p>
      <button type="button" onClick={() => window.location.reload()}>{en ? 'Reload and check' : 'Recargar y comprobar'}</button></div> : null}
    <footer><a href={en ? '/en' : '/'}>{en ? 'Back to GatoPago' : 'Volver a GatoPago'}</a></footer>
  </div></ConsumerFrame>;
}
