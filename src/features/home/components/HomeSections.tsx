import { useTranslation } from 'react-i18next';

/** Citação do princípio de produto, em faixa escura com recortes. */
export function HomeVoice() {
  const { t } = useTranslation();
  return (
    <section className="home-voice" aria-labelledby="home-voice-eyebrow">
      <p id="home-voice-eyebrow" className="home-voice-eyebrow">{t('home.voice.eyebrow')}</p>
      <blockquote>
        <p>{t('home.voice.quote')}</p>
        <footer>{t('home.voice.caption')}</footer>
      </blockquote>
    </section>
  );
}

const AUDIENCE = ['carriers', 'drivers', 'receivers', 'cco', 'shippers', 'risk'] as const;

/** Para quem é a RODAR. */
export function HomeAudience() {
  const { t } = useTranslation();
  return (
    <section className="home-light home-audience" aria-labelledby="home-audience-title">
      <h2 id="home-audience-title" className="home-light-title">{t('home.audience.title')}</h2>
      <ul className="home-audience-grid">
        {AUDIENCE.map((key) => (
          <li key={key} tabIndex={0}>
            <h3>{t(`home.audience.items.${key}.title`)}</h3>
            <p>{t(`home.audience.items.${key}.body`)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

const PLANS = ['quick', 'growing', 'network'] as const;

/** Por onde começar: três tamanhos de operação. */
export function HomeStart() {
  const { t } = useTranslation();
  return (
    <section className="home-light home-start" aria-labelledby="home-start-title">
      <h2 id="home-start-title" className="home-light-title">
        {t('home.start.titleA')}
        <br />
        {t('home.start.titleB')}
      </h2>
      <ol className="home-start-grid">
        {PLANS.map((plan) => (
          <li key={plan} className="home-start-card" data-plan={plan}>
            <p className="home-card-tag">{t(`home.start.plans.${plan}.tag`)}</p>
            <h3>{t(`home.start.plans.${plan}.title`)}</h3>
            <p>{t(`home.start.plans.${plan}.body`)}</p>
            <span className="home-start-art" aria-hidden="true" />
            <a className="home-start-cta" href="#contato">{t(`home.start.plans.${plan}.cta`)}</a>
          </li>
        ))}
      </ol>
    </section>
  );
}
