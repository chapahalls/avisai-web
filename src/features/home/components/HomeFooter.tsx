import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RodarLogo } from '../../../components/RodarLogo';

/** CTA final e rodapé. */
export function HomeFooter() {
  const { t } = useTranslation();
  return (
    <footer className="home-footer">
      <div className="home-footer-cta">
        <h2>{t('home.footer.ctaTitle')}</h2>
        <a href="#contato">{t('home.footer.cta')}</a>
      </div>
      <div className="home-footer-grid">
        <div className="home-footer-brand">
          <RodarLogo size={36} />
          <p>{t('home.footer.about')}</p>
        </div>
        <nav aria-labelledby="home-footer-tech">
          <h3 id="home-footer-tech">{t('home.footer.columns.tech.title')}</h3>
          <Link to="/login">{t('home.footer.columns.tech.app')}</Link>
          <Link to="/login">{t('home.footer.columns.tech.cco')}</Link>
          <a href="#calculadora">{t('home.footer.columns.tech.calculator')}</a>
        </nav>
        <nav aria-labelledby="home-footer-company">
          <h3 id="home-footer-company">{t('home.footer.columns.company.title')}</h3>
          <a href="#como-funciona">{t('home.footer.columns.company.how')}</a>
          <a href="#perguntas">{t('home.footer.columns.company.faq')}</a>
          <a href="#contato">{t('home.footer.columns.company.contact')}</a>
        </nav>
        <nav aria-labelledby="home-footer-talk">
          <h3 id="home-footer-talk">{t('home.footer.columns.talk.title')}</h3>
          <a href="#contato">{t('home.footer.columns.talk.demo')}</a>
        </nav>
      </div>
      <div className="home-footer-legal">
        <span>{t('home.footer.rights')}</span>
        <span>{t('home.footer.demoData')}</span>
      </div>
    </footer>
  );
}
