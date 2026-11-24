import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HomeAudience,
  HomeCalculator,
  HomeContact,
  HomeExperience,
  HomeFaq,
  HomeFooter,
  HomeHowItWorks,
  HomeLoader,
  HomeNav,
  HomePlatform,
  HomeStart,
  HomeVoice,
  useHomeIntro,
} from '../features/home';

export function HomePage() {
  const { t, i18n } = useTranslation();
  const { progress, phase, reducedMotion } = useHomeIntro();

  useEffect(() => {
    const previous = document.title;
    document.title = t('home.pageTitle');
    return () => { document.title = previous; };
  }, [t, i18n.resolvedLanguage]);

  return (
    <div className="home-page">
      <HomeLoader progress={progress} phase={phase} />
      <HomeNav ready={phase !== 'loading'} />
      <main aria-busy={phase === 'loading'}>
        <HomeExperience ready={phase !== 'loading'} reducedMotion={reducedMotion} />
        <HomeStart />
        <HomeCalculator />
        <HomeHowItWorks reducedMotion={reducedMotion} />
        <HomePlatform />
        <HomeAudience />
        <HomeVoice />
        <HomeContact />
        <HomeFaq />
      </main>
      <HomeFooter />
    </div>
  );
}
