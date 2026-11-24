import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ptBR from '../assets/locales/pt-BR.json';
import en from '../assets/locales/en.json';
import { dispatchPt, dispatchEn } from '../assets/locales/dispatch';
import { pt as backendMetricsPt, en as backendMetricsEn } from '../assets/locales/backend-metrics';
import { homePt, homeEn } from '../assets/locales/home';

/** Idioma salvo pelo visitante; sem escolha, o padrão é pt-BR. */
const LANGUAGE_KEY = 'rodar.language';
const savedLanguage = (() => {
  try {
    const value = window.localStorage.getItem(LANGUAGE_KEY);
    return value === 'en' || value === 'pt-BR' ? value : null;
  } catch {
    return null;
  }
})();

void i18n.use(initReactI18next).init({
  resources: { 'pt-BR': { translation: { ...ptBR, dispatch: dispatchPt, backendMetrics: backendMetricsPt, home: homePt } }, en: { translation: { ...en, dispatch: dispatchEn, backendMetrics: backendMetricsEn, home: homeEn } } },
  lng: savedLanguage ?? 'pt-BR',
  supportedLngs: ['pt-BR', 'en'],
  fallbackLng: 'pt-BR',
  interpolation: { escapeValue: false },
});

const syncDocumentLanguage = () => {
  document.documentElement.lang = i18n.resolvedLanguage ?? 'pt-BR';
  document.title = i18n.t('app.pageTitle');
};
i18n.on('languageChanged', syncDocumentLanguage);
i18n.on('languageChanged', (language) => {
  try {
    window.localStorage.setItem(LANGUAGE_KEY, language === 'en' ? 'en' : 'pt-BR');
  } catch {
    // Sem armazenamento (aba privada): a escolha vale só nesta visita.
  }
});
syncDocumentLanguage();

export default i18n;
