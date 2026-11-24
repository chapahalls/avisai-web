import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const MODULES = ['road', 'receiver', 'cco', 'numbers'] as const;
type Module = (typeof MODULES)[number];

/** Plataforma modular: abas e carrossel com os quatro pontos da operação. */
export function HomePlatform() {
  const { t } = useTranslation();
  const [active, setActive] = useState<Module>('road');
  const trackRef = useRef<HTMLDivElement | null>(null);

  const show = (module: Module) => {
    setActive(module);
    const card = trackRef.current?.querySelector<HTMLElement>(`[data-module='${module}']`);
    trackRef.current?.scrollTo({ left: card ? card.offsetLeft - trackRef.current.offsetLeft : 0, behavior: 'smooth' });
  };
  const step = (delta: number) => {
    const index = MODULES.indexOf(active);
    show(MODULES[(index + delta + MODULES.length) % MODULES.length]);
  };

  return (
    <section id="plataforma" className="home-light home-platform" aria-labelledby="home-platform-title">
      <p className="home-light-eyebrow">{t('home.platform.eyebrow')}</p>
      <h2 id="home-platform-title" className="home-light-title">
        {t('home.platform.titleBefore')}
        <span className="home-highlight">{t('home.platform.titleHighlight')}</span>
        {t('home.platform.titleAfter')}
      </h2>
      <p className="home-light-subtitle">{t('home.platform.subtitle')}</p>

      <div className="home-platform-controls">
        <div className="home-chip-tabs" role="tablist" aria-label={t('home.platform.eyebrow')}>
          {MODULES.map((module) => (
            <button
              key={module}
              type="button"
              role="tab"
              aria-selected={active === module}
              aria-controls={`home-module-${module}`}
              onClick={() => show(module)}
            >
              {t(`home.platform.items.${module}.tab`)}
            </button>
          ))}
        </div>
        <div className="home-platform-arrows">
          <button type="button" onClick={() => step(-1)} aria-label={t('home.platform.previous')}>‹</button>
          <button type="button" onClick={() => step(1)} aria-label={t('home.platform.next')}>›</button>
        </div>
      </div>

      <div className="home-platform-track" ref={trackRef}>
        {MODULES.map((module) => (
          <article
            key={module}
            id={`home-module-${module}`}
            className="home-platform-card"
            data-module={module}
            data-active={active === module}
            role="tabpanel"
          >
            <p className="home-card-tag">{t(`home.platform.items.${module}.tab`)}</p>
            <h3>{t(`home.platform.items.${module}.title`)}</h3>
            <p>{t(`home.platform.items.${module}.body`)}</p>
            <span className="home-platform-card-art" aria-hidden="true" />
            <Link className="home-card-button" to="/login">{t('home.platform.viewScreen')}</Link>
          </article>
        ))}
      </div>
    </section>
  );
}
