import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import arCommon from './ar/common.json';
import enCommon from './en/common.json';
import arLanding from './ar/landing.json';
import enLanding from './en/landing.json';
import { getStoredTheme, applyTheme } from '../components/ui/theme';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      ar: { common: arCommon, landing: arLanding },
      en: { common: enCommon, landing: enLanding },
    },
    lng: localStorage.getItem('cos_language') || 'ar',
    fallbackLng: 'en',
    supportedLngs: ['ar', 'en'],
    returnEmptyString: false,
    defaultNS: 'common',
    interpolation: {
      escapeValue: false,
    },
  });

// Automatically synchronize document direction with language
i18n.on('languageChanged', (lng) => {
  const dir = lng === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.dir = dir;
  document.documentElement.lang = lng;
  localStorage.setItem('cos_language', lng);
});

document.documentElement.dir = 'rtl';
document.documentElement.lang = 'ar';
applyTheme(getStoredTheme());

export default i18n;