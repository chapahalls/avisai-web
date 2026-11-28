import { type FormEvent, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type RealCallError, requestRealCall } from '../api/realCall';

type State = { kind: 'idle' } | { kind: 'sending' } | { kind: 'ringing'; masked: string } | { kind: 'error'; error: RealCallError };

/** Cartão da Demo: o agente de voz liga de verdade para o celular de quem está vendo, como se fosse o recebedor. */
export function RealCallCard({ onCallStarted }: { onCallStarted?: (routeId: number, maskedPhone: string) => void }) {
  const { t } = useTranslation();
  const id = useId();
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<State>({ kind: 'idle' });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (state.kind === 'sending') return;
    setState({ kind: 'sending' });
    const result = await requestRealCall(phone, consent);
    setState(result.ok ? { kind: 'ringing', masked: result.masked } : { kind: 'error', error: result.error });
    if (result.ok) onCallStarted?.(result.routeId, result.masked);
  };

  return (
    <form className="rc-real" onSubmit={(event) => void submit(event)} aria-labelledby={`${id}-title`}>
      <p className="rc-real-tag">{t('driverApp.realCall.tag')}</p>
      <h3 id={`${id}-title`}>{t('driverApp.realCall.title')}</h3>
      <p className="rc-real-hint">{t('driverApp.realCall.hint')}</p>
      <label htmlFor={`${id}-phone`}>{t('driverApp.realCall.phoneLabel')}</label>
      <input id={`${id}-phone`} type="tel" inputMode="tel" autoComplete="tel" placeholder={t('driverApp.realCall.phonePlaceholder')}
        value={phone} onChange={(event) => setPhone(event.target.value)} aria-invalid={state.kind === 'error' && state.error === 'invalid_phone'} />
      <label className="rc-real-consent">
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
        <span>{t('driverApp.realCall.consent')}</span>
      </label>
      <button type="submit" disabled={state.kind === 'sending'} aria-busy={state.kind === 'sending'}>
        {t(state.kind === 'sending' ? 'driverApp.realCall.sending' : 'driverApp.realCall.submit')}
      </button>
      <p role="status" className="rc-real-status" data-kind={state.kind}>
        {state.kind === 'ringing' && t('driverApp.realCall.ringing', { phone: state.masked })}
        {state.kind === 'error' && t(`driverApp.realCall.errors.${state.error}`)}
      </p>
      <p className="rc-real-privacy">{t('driverApp.realCall.privacy')}</p>
    </form>
  );
}
