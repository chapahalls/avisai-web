import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RodarLogo } from '../../../components/RodarLogo';
import './home.css';
import './landing.css';

/** Navegação fixa da home: acompanha a história 3D e as seções seguintes. */
export function HomeNav({ ready }: { ready: boolean }) {
  const { t } = useTranslation();
  return (
    <header className="home-nav" data-ready={ready}>
      <Link to="/home" aria-label={t('app.name')}><RodarLogo size={34} /></Link>
      <nav aria-label={t('nav.main')}>
        <a href="#plataforma">{t('home.story.nav.platform')}</a>
        <a href="#como-funciona">{t('home.story.nav.how')}</a>
        <a href="#calculadora">{t('home.story.nav.calculator')}</a>
        <a href="#perguntas">{t('home.story.nav.faq')}</a>
      </nav>
      <div className="home-nav-actions">
        <a className="home-nav-product" href="#plataforma">{t('home.story.nav.product')}</a>
        <a className="home-nav-demo" href="#contato">{t('home.story.nav.demo')}</a>
      </div>
    </header>
  );
}
