import { useTranslation } from 'react-i18next';
import './home.css';

const PILLARS = ['road', 'receiver', 'cco'] as const;

/** Resumo dos três pontos da operação; destino da âncora "Ver como funciona". */
export function HomePillars() {
  const { t } = useTranslation();
  return (
    <section id="como-funciona" className="home-pillars" aria-labelledby="home-pillars-title">
      <h2 id="home-pillars-title" className="home-section-title">{t('home.pillars.title')}</h2>
      <ol className="home-pillar-list">
        {PILLARS.map((key, index) => (
          <li key={key} className="home-pillar">
            <span className="home-pillar-number">{String(index + 1).padStart(2, '0')}</span>
            <h3>{t(`home.pillars.items.${key}.title`)}</h3>
            <p>{t(`home.pillars.items.${key}.body`)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
