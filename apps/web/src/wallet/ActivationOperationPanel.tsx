'use client';

import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import type { CreationConsent } from '@gatopago/shared/v3/creation-operation-wire';
import type { BrowserAuth } from '../auth/browser';
import type { CreationProfilePin } from './creation-release';
import { ActivationFlow } from './activation-flow';
import { requestPasskeyProof } from './passkeys';
import ActivationCommitPanel from './ActivationCommitPanel';
import ActivationProgress from './ActivationProgress';

function message(code: string, en: boolean) {
  if (code === 'activation/status-unavailable') return en ? 'We could not read the latest status. Your consent is still recorded. You can check again without signing or resending.'
    : 'No pudimos consultar el estado reciente. Tu consentimiento sigue registrado. Puedes volver a consultar sin firmar ni reenviar.';
  if (code === 'activation/status-stopped') return en ? 'Status lookup stopped. You can check again; no authorization was sent.'
    : 'Consulta de estado detenida. Puedes volver a consultar; no se envió una autorización.';
  if (['auth/session-changed', 'auth/unauthenticated', 'client/update-required'].includes(code)) return en
    ? 'Your session or app version changed. Reload and sign in again. Local proofs were discarded.'
    : 'Tu sesión o versión cambió. Recarga y vuelve a entrar. Las pruebas locales se descartaron.';
  if (code === 'activation/invalid-locator') return en
    ? 'This locator does not match this account, release and reviewed guardian policy. No request was sent.'
    : 'Este localizador no corresponde a esta cuenta, versión y política de guardianes revisada. No se envió una solicitud.';
  if (code === 'activation/invalid-proof') return en
    ? 'This proof does not match the signer and exact proposal, or its format is invalid. It was not added or sent. Check the response and try again.'
    : 'Esta prueba no corresponde al firmante y propuesta exactos, o su formato es inválido. No se añadió ni se envió. Revisa la respuesta y vuelve a intentar.';
  if (code === 'activation/verification-stopped') return en
    ? 'Local verification stopped or timed out. This action did not submit an authorization. You may try the confirmation again while its window is open.'
    : 'La verificación local se detuvo o agotó su espera. Esta acción no envió una autorización. Puedes intentar la confirmación mientras su plazo siga abierto.';
  if (['activation/expired', 'expired'].includes(code)) return en
    ? 'The signing window expired or the device clock is incorrect. You can still check the same operation. Nothing is renewed automatically.'
    : 'El plazo para firmar venció o el reloj del dispositivo es incorrecto. Puedes consultar la misma operación. Nada se renueva automáticamente.';
  if (['cancelled', 'context', 'unsupported', 'busy', 'invalid-response'].includes(code)) return en
    ? 'The key confirmation was cancelled or could not be verified. This does not mean your key is missing. No recovery was started.'
    : 'La confirmación se canceló o no pudo verificarse. No significa que falte tu llave. No se inició recuperación.';
  if (code === 'activation/invalid') return en
    ? 'We could not verify these data or proofs against the reviewed operation. No account activation is confirmed.'
    : 'No pudimos verificar estos datos o pruebas contra la operación revisada. No hay activación de cuenta confirmada.';
  return en ? 'The result is uncertain. Stopping the wait does not undo a request already received. Check the same operation before continuing.'
    : 'El resultado es incierto. Detener la espera no deshace una solicitud recibida. Consulta la misma operación antes de continuar.';
}

export default function ActivationOperationPanel({ runtime, uid, pin, consent, bootstrap, addresses, english: en, onStatusChange }: {
  runtime: BrowserAuth; uid: string; pin: CreationProfilePin; consent: CreationConsent;
  bootstrap: { wallet_id: string; wallet_account_id: string }; addresses: readonly string[]; english: boolean;
  onStatusChange: (status: { busy: boolean; locked: boolean }) => void;
}) {
  const [flow] = useState(() => new ActivationFlow(() => runtime.activation(uid, pin), requestPasskeyProof, pin, consent, bootstrap, addresses));
  const state = useSyncExternalStore(flow.subscribe, flow.snapshot, flow.snapshot), id = useId();
  const [exported, setExported] = useState<{ index: number; json: string } | null>(null);
  const [commitContext, setCommitContext] = useState<ReturnType<ActivationFlow['commitContext']>>(null);
  const busy = ['loading', 'tracking', 'preparing', 'proving', 'importing', 'submitting'].includes(state.phase);
  const locked = state.continuation !== null, canProve = state.phase === 'ready' && !state.submitted;
  const complete = state.ownerConfirmed && state.initialRoleConfirmed && state.guardians.length === 3 && state.guardians.every((g) => g.confirmed);
  useEffect(() => {
    const unsubscribe = runtime.subscribe((identity) => { if (identity?.uid !== uid) flow.invalidate(); else flow.checkSession(); });
    return () => { unsubscribe(); flow.dispose(); onStatusChange({ busy: false, locked: false }); };
  }, [runtime, uid, flow, onStatusChange]);
  useEffect(() => { onStatusChange({ busy, locked }); }, [busy, locked, onStatusChange]);
  return <section className="account-initialization" aria-labelledby={`${id}-title`} aria-busy={busy}>
    <h5 id={`${id}-title`}>{en ? 'Authorize the reviewed security policy' : 'Autorizar la política de seguridad revisada'}</h5>
    <p>{en ? 'Advanced setup: have all three independent guardians ready before preparing. The signature window is short. No recovery request or funds transfer starts here.'
      : 'Configuración avanzada: coordina a los tres guardianes independientes antes de preparar. El plazo de firmas es breve. Aquí no se inicia una recuperación ni una transferencia de fondos.'}</p>
    {state.error ? <p className="auth-error" role="alert">{message(state.error, en)}</p> : null}
    {state.phase === 'idle' && !locked ? <>
      <button type="button" className="auth-primary" onClick={() => void flow.prepare()}>{en ? 'Prepare this security policy' : 'Preparar esta política de seguridad'}</button>
      <details><summary>{en ? 'Resume a previous request' : 'Retomar una solicitud anterior'}</summary>
        <p>{en ? 'Review the same guardians first, then paste the public locator. It does not contain keys or signatures and cannot restore funds by itself.'
          : 'Revisa primero los mismos guardianes y pega el localizador público. No contiene llaves ni firmas y no recupera fondos por sí solo.'}</p>
        <form onSubmit={(event) => { event.preventDefault(); const input = event.currentTarget.elements.namedItem('locator') as HTMLTextAreaElement;
          const text = input.value; input.value = ''; void flow.restore(text); }}>
          <label htmlFor={`${id}-locator`}>{en ? 'Public request locator' : 'Localizador público de solicitud'}</label>
          <textarea id={`${id}-locator`} name="locator" rows={4} maxLength={1024} required autoComplete="off" autoCapitalize="none" spellCheck={false} />
          <button type="submit" className="auth-secondary">{en ? 'Read that request' : 'Consultar esa solicitud'}</button>
        </form>
      </details>
    </> : null}
    {state.continuation ? <details><summary>{en ? 'Keep the public locator' : 'Conservar el localizador público'}</summary>
      <p>{en ? 'Keep this text to resume this exact request after closing the page. You will review the same guardians again. This is not an account recovery kit.'
        : 'Conserva este texto para retomar la misma solicitud después de cerrar la página. Deberás revisar los mismos guardianes. No es un kit de recuperación de cuenta.'}</p>
      <label htmlFor={`${id}-saved`}>{en ? 'Locator without signatures' : 'Localizador sin firmas'}</label>
      <textarea id={`${id}-saved`} value={state.continuation} readOnly rows={5} spellCheck={false} />
    </details> : null}
    {state.phase === 'absent' ? <>
      <p>{en ? 'No record was found for this identifier. You may explicitly retry preparation with the same policy and deadline.'
        : 'No hay registro para este identificador. Puedes reintentar explícitamente la preparación con la misma política y fecha límite.'}</p>
      <button type="button" className="auth-secondary" onClick={() => void flow.prepare()}>{en ? 'Retry the same preparation' : 'Reintentar la misma preparación'}</button>
    </> : null}
    {state.review ? <div className="initialization-review">
      <p>{en ? 'Network' : 'Red'}: <code>{state.review.network}</code></p>
      <p>{en ? 'Account' : 'Cuenta'}: <code>{state.review.account}</code></p>
      <p>{en ? 'Signature deadline' : 'Límite para firmar'}: <time dateTime={new Date(state.review.expiresAt * 1000).toISOString()}>
        {new Date(state.review.expiresAt * 1000).toLocaleString(en ? 'en-US' : 'es-BO')}</time></p>
      <details><summary>{en ? 'Exact proposal digest' : 'Digest de la propuesta exacta'}</summary><code>{state.review.digest}</code></details>
    </div> : null}
    {state.review && !['authorized', 'closed', 'expired'].includes(state.phase) ? <>
      <p>{en ? 'Two separate consents use your initial key: approve the policy change as current owner, and accept its new administration role. Neither signature is reused for the other purpose.'
        : 'Tu llave inicial da dos consentimientos separados: aprobar el cambio como titular actual y aceptar su nuevo rol de administración. No reutilizamos una firma para el otro propósito.'}</p>
      <p role="status">{en ? 'Owner consent' : 'Consentimiento del titular'}: {state.ownerConfirmed ? (en ? 'verified locally' : 'verificado localmente') : (en ? 'pending' : 'pendiente')}.<br />
        {en ? 'Initial key administration role' : 'Rol administrativo de la llave inicial'}: {state.initialRoleConfirmed ? (en ? 'verified locally' : 'verificado localmente') : (en ? 'pending' : 'pendiente')}.</p>
      <button type="button" className="auth-secondary" disabled={!canProve || state.ownerConfirmed} onClick={() => void flow.confirmOwner()}>
        {en ? 'Approve the policy with my current key' : 'Aprobar la política con mi llave actual'}</button>
      <button type="button" className="auth-secondary" disabled={!canProve || state.initialRoleConfirmed} onClick={() => void flow.confirmInitialRole()}>
        {en ? 'Accept the administration role with my key' : 'Aceptar el rol administrativo con mi llave'}</button>
      <p>{en ? 'Each guardian must independently review the account, network, policy, roles and deadline in the public EIP-712 request. Do not sign an unexplained hash or share private keys. No external wallet provider is connected.'
        : 'Cada guardián debe revisar independientemente cuenta, red, política, roles y plazo de la solicitud pública EIP-712. No firmes un hash sin explicación ni compartas claves privadas. No se conecta un proveedor de wallets externas.'}</p>
      {state.guardians.toSorted((a, b) => addresses.findIndex((value) => value.toLowerCase() === a.address)
        - addresses.findIndex((value) => value.toLowerCase() === b.address)).map((guardian) => <fieldset className="activation-guardian-options" disabled={!canProve || guardian.confirmed} key={guardian.index}>
        <legend>{en ? 'Guardian' : 'Guardián'} {addresses.findIndex((a) => a.toLowerCase() === guardian.address) + 1}</legend>
        <p><code>{guardian.address}</code> · {guardian.roles === 6 ? (en ? 'Administration + recovery' : 'Administración + recuperación') : (en ? 'Recovery only' : 'Sólo recuperación')}</p>
        <p>{guardian.confirmed ? (en ? 'Proof verified locally for this proposal.' : 'Prueba verificada localmente para esta propuesta.') : (en ? 'Proof pending.' : 'Prueba pendiente.')}</p>
        <button type="button" className="auth-secondary" onClick={() => { const value = flow.externalRequest(guardian.index);
          if (value) setExported({ index: guardian.index, json: value.json }); }}>{en ? 'Show public signing request' : 'Mostrar solicitud pública de firma'}</button>
        {canProve && exported?.index === guardian.index ? <>
          <label htmlFor={`${id}-request-${guardian.index}`}>{en ? 'Public EIP-712 request' : 'Solicitud pública EIP-712'}</label>
          <textarea id={`${id}-request-${guardian.index}`} readOnly value={exported.json} rows={6} spellCheck={false} />
        </> : null}
        <form onSubmit={(event) => { event.preventDefault(); const input = event.currentTarget.elements.namedItem('proof') as HTMLTextAreaElement;
          const text = input.value; input.value = ''; void flow.importExternal(guardian.index, text); }}>
          <label htmlFor={`${id}-proof-${guardian.index}`}>{en ? 'Signed JSON response — never a private key' : 'Respuesta JSON firmada — nunca una clave privada'}</label>
          <textarea id={`${id}-proof-${guardian.index}`} name="proof" rows={3} maxLength={1024} required autoComplete="off" autoCapitalize="none" spellCheck={false} />
          <button type="submit" className="auth-secondary">{en ? 'Verify guardian response' : 'Verificar respuesta del guardián'}</button>
        </form>
      </fieldset>)}
      <button type="button" className="auth-primary" disabled={state.phase !== 'ready' || !complete} onClick={() => void flow.authorize()}>
        {state.submitted ? (en ? 'Retry the same authorization' : 'Reintentar la misma autorización') : (en ? 'Submit these exact consents' : 'Enviar estos consentimientos exactos')}</button>
    </> : null}
    {state.phase === 'authorized' ? <p role="status">{en ? 'Consents recorded. The policy is NOT confirmed active onchain. Delivery, the separate commit and independent observation are still required. This is not a completed recovery setup.'
      : 'Consentimientos registrados. La política NO está confirmada activa onchain. Todavía faltan entrega, commit separado y observación independiente. Esto no completa la configuración de recuperación.'}</p> : null}
    {state.phase === 'authorized' && !commitContext ? <button type="button" className="auth-primary" onClick={() => {
      try { setCommitContext(flow.commitContext()); } catch { flow.invalidate(); }
    }}>{en ? 'Continue to final confirmation' : 'Continuar a confirmación final'}</button> : null}
    {state.progress ? <ActivationProgress progress={state.progress} english={en} /> : null}
    {state.phase === 'authorized' && !commitContext ? <button type="button" className="auth-secondary" onClick={() => void flow.checkProgress()}>
      {en ? 'Check proposal delivery onchain' : 'Consultar entrega de propuesta en red'}</button> : null}
    {state.phase === 'authorized' && commitContext ? <ActivationCommitPanel runtime={runtime} uid={uid} pin={pin}
      context={commitContext} english={en} /> : null}
    <p role="note">{en ? 'Receiving and sending stay disabled here. Recorded authorizations may be processed asynchronously; an accepted consent is not proof of an active account.'
      : 'Recibir y enviar siguen deshabilitados aquí. Las autorizaciones registradas pueden procesarse en segundo plano; un consentimiento aceptado no prueba que la cuenta esté activa.'}</p>
    {busy ? <><p role="status">{state.phase === 'proving' ? (en ? 'Confirm in your browser…' : 'Confirma en tu navegador…')
      : (en ? 'Verifying the same operation…' : 'Verificando la misma operación…')}</p>
      <button type="button" className="auth-secondary" onClick={() => flow.stop()}>{en ? 'Stop waiting' : 'Detener espera'}</button></> : null}
    {!commitContext && !busy && locked && !['closed', 'authorized'].includes(state.phase) ? <button type="button" className="auth-secondary" onClick={() => void flow.restore()}>
      {en ? 'Check the same security request' : 'Consultar la misma solicitud de seguridad'}</button> : null}
  </section>;
}
