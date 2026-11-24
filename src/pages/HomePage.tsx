import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { HomeHero, HomeLoader, HomePillars, useHomeIntro } from '../features/home';

export function HomePage() {
  const { t, i18n } = useTranslation();
  const { progress, phase, chipUrl } = useHomeIntro();

  useEffect(() => {
    const previous = document.title;
    document.title = t('home.pageTitle');
    return () => { document.title = previous; };
  }, [t, i18n.resolvedLanguage]);

  return (
    <div className="home-page">
      <HomeLoader progress={progress} phase={phase} />
      <main aria-busy={phase === 'loading'}>
        <HomeHero chipUrl={chipUrl} ready={phase !== 'loading'} />
        <HomePillars />
      </main>
    </div>
  );
}
