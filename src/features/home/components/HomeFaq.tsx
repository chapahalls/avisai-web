import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const TABS = ['product', 'value', 'rollout'] as const;
type Tab = (typeof TABS)[number];
type FaqItem = { q: string; a: string };

/** Perguntas frequentes em abas, com acordeão acessível. */
export function HomeFaq() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('product');
  const [open, setOpen] = useState(0);
  const items = t(`home.faq.items.${tab}`, { returnObjects: true }) as FaqItem[];

  return (
    <section id="perguntas" className="home-light home-faq" aria-labelledby="home-faq-title">
      <div>
        <h2 id="home-faq-title">{t('home.faq.title')}</h2>
        <p>{t('home.faq.subtitle')}</p>
      </div>
      <div>
        <div className="home-chip-tabs" role="tablist" aria-label={t('home.faq.title')}>
          {TABS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => { setTab(key); setOpen(0); }}
            >
              {t(`home.faq.tabs.${key}`)}
            </button>
          ))}
        </div>
        <ul className="home-faq-list" role="tabpanel">
          {items.map((item, index) => {
            const expanded = open === index;
            const panelId = `home-faq-${tab}-${index}`;
            return (
              <li key={item.q}>
                <h3>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => setOpen(expanded ? -1 : index)}
                  >
                    {item.q}
                    <span aria-hidden="true">{expanded ? '×' : '+'}</span>
                  </button>
                </h3>
                <p id={panelId} hidden={!expanded}>{item.a}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
