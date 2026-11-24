import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { HomeExperience, HomeLoader, HomePillars, useHomeIntro } from '../features/home';

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
      <main aria-busy={phase === 'loading'}>
        <HomeExperience ready={phase !== 'loading'} reducedMotion={reducedMotion} />
        <HomePillars />
      </main>
    </div>
  );
}
