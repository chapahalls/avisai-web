import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ptBR from '../assets/locales/pt-BR.json';
import en from '../assets/locales/en.json';
import { dispatchPt, dispatchEn } from '../assets/locales/dispatch';
import { pt as backendMetricsPt, en as backendMetricsEn } from '../assets/locales/backend-metrics';
import { homePt, homeEn } from '../assets/locales/home';

void i18n.use(initReactI18next).init({
  resources: { 'pt-BR': { translation: { ...ptBR, dispatch: dispatchPt, backendMetrics: backendMetricsPt, home: homePt } }, en: { translation: { ...en, dispatch: dispatchEn, backendMetrics: backendMetricsEn, home: homeEn } } },
  lng: navigator.language.toLowerCase().startsWith('en') ? 'en' : 'pt-BR',
  supportedLngs: ['pt-BR', 'en'],
  fallbackLng: 'pt-BR',
  interpolation: { escapeValue: false },
});

const syncDocumentLanguage = () => {
  document.documentElement.lang = i18n.resolvedLanguage ?? 'pt-BR';
  document.title = i18n.t('app.pageTitle');
};
i18n.on('languageChanged', syncDocumentLanguage);
syncDocumentLanguage();

export default i18n;
