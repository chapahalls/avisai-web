import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RodarLogo } from '../../../components/RodarLogo';
import './home.css';
import './landing.css';

/** Navegação fixa da home: acompanha a história 3D e as seções seguintes. */
export function HomeNav({ ready }: { ready: boolean }) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage === 'en' ? 'en' : 'pt-BR';
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
        <div className="home-nav-language" role="group" aria-label={t('app.language')}>
          {(['pt-BR', 'en'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={language === option}
              lang={option}
              onClick={() => void i18n.changeLanguage(option)}
            >
              {t(option === 'en' ? 'app.languages.en' : 'app.languages.pt')}
            </button>
          ))}
        </div>
        <a className="home-nav-product" href="#plataforma">{t('home.story.nav.product')}</a>
        <Link className="home-nav-demo" to="/login">{t('home.story.nav.demo')}</Link>
      </div>
    </header>
  );
}
