import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../../components/Icon';
import { APP_ROUTES } from '../../../lib/routes';
import { ApiError } from '../../../services/api/client';
import {
  getApiClient, registerDemoDriver, registerDemoOperator, registrationFormatIssue, registrationIssue, useMode,
} from '../../../services/operations';

export type RegisterKind = 'driver' | 'operator';
type Step = 'identity' | 'contact' | 'review';
const STEPS: Step[] = ['identity', 'contact', 'review'];

/**
 * Cadastro passo a passo (identificação → contato → revisão), igual na Demo e na API.
 * Demo: grava no cadastro local em memória. API: `POST /motoristas` ou `POST /usuarios`
 * (perfil `cco`), sem repetição automática. Ao concluir, volta ao despacho com aviso.
 */
export function RegisterWizard({ kind }: { kind: RegisterKind }) {
  const { t } = useTranslation();
  const mode = useMode();
  const client = getApiClient();
  const navigate = useNavigate();
  const fieldId = useId();
  const [step, setStep] = useState<Step>('identity');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  // Ao trocar de etapa, o foco vai para o título dela (leitores de tela anunciam a etapa).
  useEffect(() => { heading.current?.focus(); }, [step]);

  const index = STEPS.indexOf(step);
  const input = { name, email, phone: kind === 'driver' ? phone : undefined };
  const isApi = mode === 'api';

  /** Valida só o que a etapa atual pede; a duplicidade na Demo é conferida ao sair do contato. */
  const stepIssue = (current: Step): string | null => {
    if (current === 'identity') return name.trim() ? null : 'name';
    if (current === 'contact') {
      const issue = isApi ? registrationFormatIssue(input) : registrationIssue(input);
      return issue === 'required' ? 'emailRequired' : issue;
    }
    return null;
  };

  const next = (event: FormEvent) => {
    event.preventDefault();
    const issue = stepIssue(step);
    if (issue) { setError(issue); return; }
    setError(null);
    if (step !== 'review') { setStep(STEPS[index + 1]); return; }
    void submit();
  };

  const submit = async () => {
    if (busy.current) return;
    if (!isApi) {
      const created = kind === 'driver' ? registerDemoDriver(input) : registerDemoOperator(input);
      navigate(APP_ROUTES.dispatch, { state: { notice: `${kind}Registered`, name: created.name } });
      return;
    }
    if (!client) return;
    busy.current = true; setPending(true); setError(null);
    try {
      const createdName = kind === 'driver'
        ? (await client.createDriver({ nome: name, email, telefone_e164: phone || null })).nome
        : (await client.createOperator({ nome: name, email })).name;
      if (mounted.current) navigate(APP_ROUTES.dispatch, { state: { notice: `${kind}Registered`, name: createdName } });
    } catch (failure) {
      // 409: e-mail já usado. Outras falhas: o servidor pode ter gravado; o despacho recarrega a lista e nada é repetido.
      if (mounted.current) setError(failure instanceof ApiError && failure.status === 409 ? 'duplicate' : 'registerFailed');
    } finally { busy.current = false; if (mounted.current) setPending(false); }
  };

  const clear = () => setError(null);
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '—';
  const review: [string, string][] = [
    [t('dispatch.register.fields.email'), email.trim().toLowerCase()],
    ...(kind === 'driver' ? [[t('dispatch.register.fields.phone'), phone.trim() || '—'] as [string, string]] : []),
  ];

  return (
    <div className="drw">
      <Link to={APP_ROUTES.dispatch} className="drw-back">← {t('dispatch.list.title')}</Link>
      <div className="drw-shell">
        <aside className="drw-aside">
          <div className="drw-kind">
            <span className="drw-kind-icon" aria-hidden="true"><Icon name={kind === 'driver' ? 'truck' : 'dashboard'} className="h-5 w-5" /></span>
            <div>
              <p className="drw-eyebrow">{t(isApi ? 'dispatch.register.eyebrowApi' : 'dispatch.register.eyebrowDemo')}</p>
              <h1>{t(`dispatch.register.${kind}.title`)}</h1>
            </div>
          </div>
          <p className="drw-lead">{t(`dispatch.register.${kind}.hint`)}</p>
          <ol className="drw-steps" aria-label={t('dispatch.register.stepsLabel')}>
            {STEPS.map((item, position) => (
              <li key={item} data-state={position < index ? 'done' : position === index ? 'current' : 'next'} aria-current={position === index ? 'step' : undefined}>
                <span className="drw-step-number" aria-hidden="true">{position < index ? '✓' : position + 1}</span>
                <span className="drw-step-text">
                  <strong>{t(`dispatch.register.steps.${kind}.${item}`)}</strong>
                  <span>{t(`dispatch.register.stepHints.${kind}.${item}`)}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="drw-mode">{t(isApi ? `dispatch.register.${kind}.apiNotice` : 'dispatch.register.demoNotice')}</p>
        </aside>

        <form className="drw-card" onSubmit={next} noValidate>
          <div className="drw-progress" aria-hidden="true"><span style={{ width: `${((index + 1) / STEPS.length) * 100}%` }} /></div>
          <header className="drw-card-heading">
            <p>{t('dispatch.register.stepOf', { current: index + 1, total: STEPS.length })}</p>
            <h2 ref={heading} tabIndex={-1}>{t(`dispatch.register.steps.${kind}.${step}`)}</h2>
            <span>{t(`dispatch.register.stepHints.${kind}.${step}`)}</span>
          </header>

          <div className="drw-fields">
            {step === 'identity' && (
              <label className="drw-field" htmlFor={`${fieldId}-name`}>
                <span>{t('dispatch.register.fields.name')}</span>
                <input id={`${fieldId}-name`} required autoComplete="off" value={name} placeholder={t(`dispatch.register.${kind}.namePlaceholder`)}
                  aria-describedby={`${fieldId}-name-hint`} onChange={(event) => { setName(event.target.value); clear(); }} />
                <small id={`${fieldId}-name-hint`}>{t(`dispatch.register.fieldHints.${kind}.name`)}</small>
              </label>
            )}
            {step === 'contact' && (
              <>
                <label className="drw-field" htmlFor={`${fieldId}-email`}>
                  <span>{t('dispatch.register.fields.email')}</span>
                  <input id={`${fieldId}-email`} type="email" required autoComplete="off" value={email} placeholder={t(`dispatch.register.${kind}.emailPlaceholder`)}
                    aria-describedby={`${fieldId}-email-hint`} onChange={(event) => { setEmail(event.target.value); clear(); }} />
                  <small id={`${fieldId}-email-hint`}>{t(`dispatch.register.fieldHints.${kind}.email`)}</small>
                </label>
                {kind === 'driver' && (
                  <label className="drw-field" htmlFor={`${fieldId}-phone`}>
                    <span>{t('dispatch.register.fields.phone')}</span>
                    <input id={`${fieldId}-phone`} type="tel" autoComplete="off" value={phone} placeholder="+5511999999999"
                      aria-describedby={`${fieldId}-phone-hint`} onChange={(event) => { setPhone(event.target.value); clear(); }} />
                    <small id={`${fieldId}-phone-hint`}>{t('dispatch.register.fieldHints.driver.phone')}</small>
                  </label>
                )}
              </>
            )}
            {step === 'review' && (
              <div className="drw-review">
                <div className="drw-review-head">
                  <span className="drw-avatar" aria-hidden="true">{initials}</span>
                  <div>
                    <strong>{name.trim()}</strong>
                    <span>{t(`dispatch.register.roles.${kind}`)}</span>
                  </div>
                </div>
                <dl>{review.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
              </div>
            )}
            {error && <p role="alert" className="dsp-error">{t(`dispatch.register.errors.${error}`)}</p>}
          </div>

          <footer className="drw-actions">
            {index === 0
              ? <Link className="dsp-button" to={APP_ROUTES.dispatch}>{t('dispatch.list.editor.cancel')}</Link>
              : <button type="button" className="dsp-button" disabled={pending} onClick={() => { setError(null); setStep(STEPS[index - 1]); }}>← {t('dispatch.register.back')}</button>}
            <button type="submit" className="dsp-button" data-variant="primary" disabled={pending} aria-busy={pending}>
              {step === 'review' ? t(pending ? 'dispatch.saving' : 'dispatch.register.submit') : `${t('dispatch.register.next')} →`}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
