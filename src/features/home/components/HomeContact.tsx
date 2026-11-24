import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

const REASONS = ['demo', 'pilot', 'partnership', 'other'] as const;

/** Contato: formulário MOCK, validado no navegador e nunca enviado. */
export function HomeContact() {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);
  const bullets = t('home.contact.bullets', { returnObjects: true }) as string[];

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    setSent(true);
  };

  const field = (
    name: 'name' | 'role' | 'phone' | 'email' | 'company',
    { required = true, type = 'text', autoComplete }: { required?: boolean; type?: string; autoComplete?: string } = {},
  ) => (
    <label className={`home-field home-field-${name}`}>
      <span>
        {t(`home.contact.fields.${name}`)}
        {required ? <abbr title={t('home.contact.required')}> *</abbr> : null}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        placeholder={t(`home.contact.fields.${name}Placeholder`)}
        onChange={() => setSent(false)}
      />
    </label>
  );

  return (
    <section id="contato" className="home-contact" aria-labelledby="home-contact-title">
      <h2 id="home-contact-title">
        {t('home.contact.titleA')}
        <span className="home-highlight">{t('home.contact.titleHighlight')}</span>
        <span className="home-contact-title-muted">{t('home.contact.titleB')}</span>
      </h2>
      <div className="home-contact-body">
        <div>
          <p>{t('home.contact.intro')}</p>
          <ul>{bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
        </div>
        <form className="home-contact-form" onSubmit={submit}>
          {field('name', { autoComplete: 'name' })}
          {field('role', { autoComplete: 'organization-title' })}
          {field('phone', { required: false, type: 'tel', autoComplete: 'tel' })}
          {field('email', { type: 'email', autoComplete: 'email' })}
          {field('company', { autoComplete: 'organization' })}
          <label className="home-field home-field-reason">
            <span>{t('home.contact.fields.reason')}<abbr title={t('home.contact.required')}> *</abbr></span>
            <select name="reason" required defaultValue="demo" onChange={() => setSent(false)}>
              {REASONS.map((reason) => (
                <option key={reason} value={reason}>{t(`home.contact.reasons.${reason}`)}</option>
              ))}
            </select>
          </label>
          <button type="submit">{t('home.contact.submit')}</button>
          {sent ? <p role="status" className="home-form-note">{t('home.contact.sent')}</p> : null}
        </form>
      </div>
    </section>
  );
}
