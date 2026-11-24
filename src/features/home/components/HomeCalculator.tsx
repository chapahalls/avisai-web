import { useId, useState, type CSSProperties, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { BUSINESS, LANDING_CALCULATOR } from '../../../lib/config';
import { fleetRecovery, type FleetInputs } from '../model';

type Field = {
  key: keyof FleetInputs;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Calculadora de estadia (estimativa local; o e-mail é MOCK e não sai do navegador). */
export function HomeCalculator() {
  const { t, i18n } = useTranslation();
  const emailId = useId();
  const [inputs, setInputs] = useState<FleetInputs>({
    trucks: 20,
    deliveriesPerDay: 1.5,
    lateShare: 0.35,
    extraHours: 2,
    loadTons: 22,
  });
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'invalid' | 'sent'>('idle');

  const locale = i18n.resolvedLanguage;
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const rate = new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL' }).format(BUSINESS.stayRatePerTonHour);
  const hours = BUSINESS.franchiseHours;
  const result = fleetRecovery(inputs);

  const fields: Field[] = [
    { key: 'trucks', label: t('home.calculator.fields.trucks'), min: 1, max: 200, step: 1, format: (v) => number.format(v) },
    { key: 'deliveriesPerDay', label: t('home.calculator.fields.deliveries'), min: 0.5, max: 4, step: 0.5, format: (v) => number.format(v) },
    { key: 'lateShare', label: t('home.calculator.fields.late', { hours }), min: 0, max: 1, step: 0.05, format: (v) => `${Math.round(v * 100)}%` },
    { key: 'extraHours', label: t('home.calculator.fields.extraHours'), min: 1, max: 10, step: 1, format: (v) => `${number.format(v)} h` },
    { key: 'loadTons', label: t('home.calculator.fields.load'), min: 1, max: 40, step: 1, format: (v) => `${number.format(v)} t` },
  ];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setStatus(EMAIL.test(email.trim()) ? 'sent' : 'invalid');
  };

  return (
    <section id="calculadora" className="home-light home-calculator-section" aria-labelledby="home-calculator-title">
      <p className="home-light-eyebrow">{t('home.calculator.sectionEyebrow')}</p>
      <h2 id="home-calculator-title" className="home-light-title">{t('home.calculator.sectionTitle')}</h2>
      <div className="home-calculator">
      <div className="home-calculator-inputs">
        <p className="home-light-eyebrow home-align-left">{t('home.calculator.eyebrow')}</p>
        <h3>{t('home.calculator.title')}</h3>
        {fields.map((field) => {
          const id = `home-calc-${field.key}`;
          const value = inputs[field.key];
          const fill = ((value - field.min) / (field.max - field.min)) * 100;
          return (
            <div key={field.key} className="home-range">
              <label htmlFor={id}>{field.label}</label>
              <output htmlFor={id}>{field.format(value)}</output>
              <input
                id={id}
                type="range"
                min={field.min}
                max={field.max}
                step={field.step}
                value={value}
                aria-valuetext={field.format(value)}
                style={{ '--range-fill': `${fill}%` } as CSSProperties}
                onChange={(event) => setInputs((current) => ({ ...current, [field.key]: Number(event.target.value) }))}
              />
            </div>
          );
        })}
      </div>

      <div className="home-calculator-result" aria-live="polite">
        <div className="home-calculator-headline">
          <p>
            {t('home.calculator.leadA')}
            <br />
            <span>{t('home.calculator.leadB')}</span>
          </p>
          <div>
            <strong>{money.format(result.monthly)}</strong>
            <small>{t('home.calculator.perMonth', { year: money.format(result.yearly) })}</small>
          </div>
        </div>
        <dl>
          <div><dt>{t('home.calculator.rows.lateDeliveries', { hours })}</dt><dd>{number.format(result.lateDeliveries)}</dd></div>
          <div><dt>{t('home.calculator.rows.stoppedHours')}</dt><dd>{number.format(result.stoppedHours)}</dd></div>
          <div><dt>{t('home.calculator.rows.stayPerDelivery')}</dt><dd>{money.format(result.perDelivery)}</dd></div>
        </dl>
        <form className="home-calculator-form" onSubmit={submit} noValidate>
          <label htmlFor={emailId}>{t('home.calculator.emailLabel')}</label>
          <input
            id={emailId}
            type="email"
            autoComplete="email"
            placeholder={t('home.calculator.emailPlaceholder')}
            value={email}
            aria-invalid={status === 'invalid'}
            onChange={(event) => { setEmail(event.target.value); setStatus('idle'); }}
          />
          <button type="submit">{t('home.calculator.submit')}</button>
          {status === 'invalid' ? <p role="alert" className="home-form-error">{t('home.calculator.invalidEmail')}</p> : null}
          {status === 'sent' ? <p role="status" className="home-form-note">{t('home.calculator.sent')}</p> : null}
        </form>
        <p className="home-calculator-rule">
          {t('home.calculator.rule', { rate, hours, days: LANDING_CALCULATOR.workingDaysPerMonth })}
        </p>
      </div>
      </div>
    </section>
  );
}
