'use client';

import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import type { CredentialInventory } from '@gatopago/shared/v3/credential-inventory';
import type { CreationConsent } from '@gatopago/shared/v3/creation-operation-wire';
import type { BrowserAuth } from '../auth/browser';
import type { CreationProfilePin } from './creation-release';
import { ActivationPolicyStore } from './activation-policy-store';
import ActivationOperationPanel from './ActivationOperationPanel';

export default function ActivationPolicyReview({ runtime, uid, consent, inventory, pin, bootstrap, english: en, onActiveChange }: {
  runtime: BrowserAuth; uid: string; consent: CreationConsent; inventory: CredentialInventory; pin: CreationProfilePin;
  bootstrap?: { wallet_id: string; wallet_account_id: string };
  english: boolean; onActiveChange: (active: boolean) => void;
}) {
  const [store] = useState(() => new ActivationPolicyStore(() => runtime.credentialInventory(uid)));
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<'passkeys' | 'guardians'>('passkeys');
  const [addresses, setAddresses] = useState(['', '', '']);
  const [activation, setActivation] = useState({ busy: false, locked: false });
  const state = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot), id = useId();
  const initial = consent.preparation.credential_ref, others = inventory.data.filter((row) => row.credential_ref !== initial);
  const busy = state.phase === 'loading';
  const editingDisabled = busy || activation.busy || activation.locked;
  const independent = state.draft?.profile === 'independent-recovery';
  useEffect(() => {
    const unsubscribe = runtime.subscribe((identity) => { if (identity?.uid !== uid) store.invalidate(); else store.checkSession(); });
    return () => { unsubscribe(); store.clear(); onActiveChange(false); };
  }, [runtime, uid, store, onActiveChange]);
  useEffect(() => { onActiveChange(editingDisabled); }, [editingDisabled, onActiveChange]);
  if (state.phase === 'closed') return <p className="auth-error" role="alert">{en ? 'Your session changed. Reload and sign in before reviewing your keys.'
    : 'Tu sesión cambió. Recarga y vuelve a entrar antes de revisar tus llaves.'}</p>;
  return <section className="account-initialization" aria-labelledby={`${id}-title`} aria-busy={busy}>
    <h4 id={`${id}-title`}>{en ? 'Review security factors' : 'Revisar factores de seguridad'}</h4>
    <p>{en ? 'Review who could spend, change security and recover the account. This local draft does not create keys, request signatures or change the account.'
      : 'Revisa quién podría gastar, cambiar la seguridad y recuperar la cuenta. Este borrador local no crea llaves ni solicita firmas, y no cambia la cuenta.'}</p>
    <fieldset disabled={editingDisabled} className="activation-factor-options"><legend>{en ? 'Configuration to review' : 'Configuración a revisar'}</legend>
      <label><input type="radio" name={`${id}-mode`} checked={mode === 'passkeys'} onChange={() => { store.clear(); setMode('passkeys'); setAddresses(['', '', '']); }} />
        {en ? 'Additional passkeys — device backup' : 'Passkeys adicionales — respaldo de dispositivo'}</label>
      <label><input type="radio" name={`${id}-mode`} checked={mode === 'guardians'} onChange={() => { store.clear(); setMode('guardians'); setSelected([]); }} />
        {en ? 'Advanced: three external recovery guardians' : 'Avanzado: tres guardianes externos de recuperación'}</label>
    </fieldset>
    <p>{en ? 'Initial key included' : 'Llave inicial incluida'}: <code>{initial.slice(-8)}</code>.</p>
    {mode === 'guardians' ? <form onSubmit={(event) => { event.preventDefault(); void store.reviewGuardians(consent, inventory, addresses, pin); }}>
      <fieldset disabled={editingDisabled} className="activation-guardian-options"><legend>{en ? 'Public EVM signer addresses' : 'Direcciones públicas de firmantes EVM'}</legend>
        <p>{en ? 'Use three independently controlled direct ECDSA signers, not exchange deposit addresses or smart contracts. Never paste a private key or seed phrase. No wallet provider is connected.'
          : 'Usa tres firmantes ECDSA directos bajo controles independientes, no direcciones de depósito de exchanges ni contratos. Nunca pegues claves privadas o frases semilla. No se conecta ningún proveedor de wallets.'}</p>
        {addresses.map((address, index) => <label key={index} htmlFor={`${id}-guardian-${index}`}>
          {en ? 'Guardian' : 'Guardián'} {index + 1}{index === 0 ? (en ? ' — also confirms administration with your passkey' : ' — también confirma administración con tu passkey') : ''}
          <input id={`${id}-guardian-${index}`} value={address} type="text" autoComplete="off" autoCapitalize="none" spellCheck={false}
            maxLength={42} required pattern="0x[a-fA-F0-9]{40}" placeholder="0x…" onPaste={(event) => {
              // Do not let maxLength silently truncate a pasted secret into an apparent address.
              if (!/^0x[a-fA-F0-9]{40}$/.test(event.clipboardData.getData('text'))) {
                event.preventDefault(); event.currentTarget.setCustomValidity(en ? 'Paste only a complete public EVM address.' : 'Pega sólo una dirección pública EVM completa.');
                event.currentTarget.reportValidity();
              }
            }} onChange={(event) => {
              event.currentTarget.setCustomValidity('');
              store.clear(); const value = event.target.value; setAddresses((old) => old.map((item, i) => i === index ? value : item));
            }} />
        </label>)}
        <p>{en ? 'Two guardians together could replace the account controls. Different addresses do not prove different people, devices or backups. Each signer must later approve its role with a separate signature.'
          : 'Dos guardianes juntos podrían reemplazar los controles de la cuenta. Direcciones distintas no prueban personas, dispositivos o respaldos distintos. Cada firmante deberá aprobar después su rol con una firma separada.'}</p>
        <button type="submit" className="auth-secondary">{en ? 'Review recovery with guardians' : 'Revisar recuperación con guardianes'}</button>
      </fieldset>
    </form> : others.length ? <form onSubmit={(event) => { event.preventDefault(); void store.review(consent, inventory, selected, pin); }}>
      <fieldset className="activation-factor-options" disabled={editingDisabled}><legend>{en ? 'Additional registered keys' : 'Llaves registradas adicionales'}</legend>
        {others.map((row) => <label key={row.credential_ref}>
          <input type="checkbox" checked={selected.includes(row.credential_ref)} onChange={(event) => {
            store.clear(); const checked = event.target.checked;
            setSelected((old) => checked ? [...old, row.credential_ref] : old.filter((ref) => ref !== row.credential_ref));
          }} /> {en ? 'Key' : 'Llave'} · {row.credential_ref.slice(-8)}
        </label>)}
        <p>{en ? 'Registration does not prove that a key is available here. Synced copies may share a provider; we cannot infer independent backups from their names.'
          : 'El registro no prueba que una llave esté disponible aquí. Las copias sincronizadas pueden compartir gestor; sus nombres no prueban respaldos independientes.'}</p>
        <button type="submit" className="auth-secondary" disabled={!selected.length}>{en ? 'Review selected keys' : 'Revisar llaves seleccionadas'}</button>
      </fieldset>
    </form> : <p>{en ? 'Register an additional key in the section above to review a quorum. Reading this screen will not start registration.'
      : 'Registra una llave adicional en la sección de arriba para revisar una política con varias llaves. Abrir esta pantalla no inicia el registro.'}</p>}
    {busy ? <><p role="status">{en ? 'Reading the selected keys…' : 'Consultando las llaves seleccionadas…'}</p>
      <button type="button" className="auth-secondary" onClick={() => store.clear()}>{en ? 'Stop reading' : 'Detener consulta'}</button></> : null}
    {state.phase === 'error' ? <p className="auth-error" role="alert">{mode === 'guardians'
      ? (en ? 'We could not review this configuration. Check three distinct, valid addresses and your initial key. No policy was submitted.'
        : 'No pudimos revisar esta configuración. Comprueba tres direcciones distintas y válidas, y tu llave inicial. No se envió ninguna política.')
      : (en ? 'The selected keys could not be verified. No policy was submitted. Review the list and try again.'
        : 'No pudimos verificar las llaves seleccionadas. No se envió ninguna política. Revisa la lista y vuelve a intentar.')}</p> : null}
    {state.draft ? <div className="initialization-review" role="status">
      <h5>{en ? 'Draft — not applied' : 'Borrador — no aplicado'}</h5>
      {state.draft.profile === 'independent-recovery' ? <ul>{state.draft.addresses.map((address, index) => <li key={address}>
        {en ? 'Guardian' : 'Guardián'} {index + 1}: <code>{address}</code>
      </li>)}</ul> : null}
      <ul>
        {independent ? <>
          <li>{en ? 'Sending: only the initial passkey. Guardians have no direct spending role.' : 'Enviar: sólo la passkey inicial. Los guardianes no tienen permiso de gasto directo.'}</li>
          <li>{en ? 'Security changes: initial passkey AND guardian 1. Guardians alone cannot form this administrative quorum.' : 'Cambios de seguridad: passkey inicial Y guardián 1. Los guardianes solos no reúnen este quorum administrativo.'}</li>
          <li>{en ? 'Recovery without the passkey or domain: two of three guardians, subject to the recovery delay.' : 'Recuperación sin passkey ni dominio: dos de tres guardianes, respetando la espera de recuperación.'}</li>
        </> : <>
          <li>{en ? 'Sending: any one selected key, including the initial key.' : 'Enviar: cualquiera de las llaves elegidas, incluida la inicial.'}</li>
          <li>{en ? 'Security changes and recovery: two different keys out of' : 'Cambios de seguridad y recuperación: dos llaves distintas de'} {state.draft.factors.length}.</li>
        </>}
        <li>{en ? 'Recovery delay' : 'Espera de recuperación'}: {state.draft.policy.recoveryDelaySeconds / 3600} h.</li>
        <li>{en ? 'Upgrade delay' : 'Espera para actualizar el contrato'}: {state.draft.policy.upgradeDelaySeconds / 3600} h.</li>
      </ul>
      <p>{independent ? (en ? 'Recovery can tolerate one unavailable guardian if the other two remain independently accessible. Without the passkey, there is no immediate direct-spending path in this profile.'
        : 'La recuperación tolera un guardián no disponible si puedes acceder independientemente a los otros dos. Sin la passkey, este perfil no permite gastar directamente de inmediato.')
        : state.draft.recoverableLostKeys === 0 ? (en ? 'With two keys, losing either one prevents this recovery quorum.'
        : 'Con dos llaves, perder cualquiera impide reunir este quorum de recuperación.')
        : (en ? `This quorum tolerates up to ${state.draft.recoverableLostKeys} unavailable ${state.draft.recoverableLostKeys === 1 ? 'key' : 'keys'} only if the remaining keys are independently accessible.`
          : `Este quorum tolera hasta ${state.draft.recoverableLostKeys} ${state.draft.recoverableLostKeys === 1 ? 'llave no disponible' : 'llaves no disponibles'} sólo si puedes acceder independientemente a las restantes.`)}</p>
      <p className="auth-error">{independent
        ? (en ? 'Recovery quorum proposed, not configured. Address validation does not prove possession, independent custody or a successful exit without GatoPago.'
          : 'Quorum de recuperación propuesto, no configurado. Validar direcciones no prueba su control, custodia independiente ni una salida exitosa sin GatoPago.')
        : (en ? 'Independent exit is not configured. These passkeys still depend on the GatoPago domain; several keys do not make this a complete recovery setup.'
          : 'Falta configurar la salida independiente. Estas passkeys siguen dependiendo del dominio de GatoPago; tener varias no completa la recuperación.')}</p>
      <p>{en ? 'Reviewing this draft does not request signatures or apply the policy. Any subsequent authorization uses separate, explicit controls; onchain application must still be verified.'
        : 'Revisar este borrador no solicita firmas ni aplica la política. La autorización posterior usa controles separados y explícitos; todavía debe verificarse la aplicación onchain.'}</p>
      <details><summary>{en ? 'Technical draft details' : 'Detalles técnicos del borrador'}</summary>
        <p>RP ID: <code>{state.draft.scope.rpId}</code></p>
        <p>{en ? 'Policy hash' : 'Hash de la política'}: <code>{state.draft.hash}</code></p>
        <ul>{state.draft.factors.map((factor) => <li key={factor.signerId}>
          <code>{factor.credential ? factor.credential.credential_ref.slice(-8) : factor.descriptor.key}</code> · <code>{factor.signerId}</code></li>)}</ul>
      </details>
    </div> : null}
    {state.draft?.profile === 'independent-recovery' && bootstrap ? <ActivationOperationPanel
      key={`${uid}:${pin.digest}:${consent.preparation.initialization_id}:${bootstrap.wallet_id}:${bootstrap.wallet_account_id}:${state.draft.hash}`}
      runtime={runtime} uid={uid} pin={pin} consent={consent} bootstrap={bootstrap} addresses={state.draft.addresses}
      english={en} onStatusChange={setActivation} /> : null}
  </section>;
}
