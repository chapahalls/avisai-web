import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ptBR from '../assets/locales/pt-BR.json';
import en from '../assets/locales/en.json';

i18n.use(initReactI18next).init({
  resources: { 'pt-BR': { translation: ptBR }, en: { translation: en } },
  lng: navigator.language.startsWith('pt') ? 'pt-BR' : 'en',
  fallbackLng: 'pt-BR',
  interpolation: { escapeValue: false },
});

export default i18n;
