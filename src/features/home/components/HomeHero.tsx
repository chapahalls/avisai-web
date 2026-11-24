import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { RodarMark } from '../../../components/RodarLogo';
import './home.css';

/** Primeira cena da home: o símbolo RODAR ocupa o lugar exato onde o anel do loader termina de encolher. */
export function HomeHero({ ready }: { ready: boolean }) {
  const { t } = useTranslation();
  return (
    <section className="home-hero" data-ready={ready} aria-labelledby="home-hero-title">
      <div className="home-hero-grid" aria-hidden="true" />
      <RodarMark label={t('home.hero.markAlt')} className="home-hero-mark" />
      <div className="home-hero-copy">
        <p className="home-eyebrow">{t('home.hero.eyebrow')}</p>
        <h1 id="home-hero-title" className="home-hero-title">{t('home.hero.title')}</h1>
        <p className="home-hero-subtitle">{t('home.hero.subtitle')}</p>
        <div className="home-hero-actions">
          <Link to="/login" className="home-button home-button-primary">{t('home.hero.primary')}</Link>
          <a href="#como-funciona" className="home-button home-button-secondary">{t('home.hero.secondary')}</a>
        </div>
      </div>
      <a href="#como-funciona" className="home-scroll-hint">{t('home.hero.scroll')}</a>
    </section>
  );
}
