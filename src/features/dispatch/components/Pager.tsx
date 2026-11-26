import { useTranslation } from 'react-i18next';
import { DISPATCH_PAGE_SIZE } from '../model';

/** Paginação das listas de despacho (motoristas e operadores): some quando tudo cabe em uma página. */
export function Pager({ total, page, onPage, label }: { total: number; page: number; onPage: (page: number) => void; label: string }) {
  const { t } = useTranslation();
  const pageCount = Math.max(1, Math.ceil(total / DISPATCH_PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  if (total <= DISPATCH_PAGE_SIZE) return null;
  const from = current * DISPATCH_PAGE_SIZE + 1;
  const to = Math.min(total, (current + 1) * DISPATCH_PAGE_SIZE);
  return (
    <nav className="dsp-pagination" aria-label={label}>
      <span>{t('dispatch.list.pagination.range', { from, to, total })}</span>
      <div>
        <button type="button" className="dsp-button" disabled={current === 0} onClick={() => onPage(current - 1)}>{t('dispatch.list.pagination.previous')}</button>
        <span aria-live="polite">{t('dispatch.list.pagination.page', { page: current + 1, pages: pageCount })}</span>
        <button type="button" className="dsp-button" disabled={current >= pageCount - 1} onClick={() => onPage(current + 1)}>{t('dispatch.list.pagination.next')}</button>
      </div>
    </nav>
  );
}

/** Fatia da página atual, com a página limitada ao total (a lista pode encolher). */
export function pageSlice<T>(items: T[], page: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / DISPATCH_PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  return items.slice(current * DISPATCH_PAGE_SIZE, (current + 1) * DISPATCH_PAGE_SIZE);
}
