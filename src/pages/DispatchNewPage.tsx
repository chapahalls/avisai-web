import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RouteCreateForm } from '../features/dispatch';
import { APP_ROUTES } from '../lib/routes';
import { getApiClient, setMode, useMode } from '../services/operations';

/** Cadastro de viagem (mockup 04-trip-dispatch-cadastro). */
export function DispatchNewPage() {
  const { t } = useTranslation();
  const mode = useMode();
  const client = getApiClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  return (
    <div className="dsn-page">
      <Link to={APP_ROUTES.dispatch} className="dsn-back">← {t('dispatch.list.title')}</Link>
      <header className="dsn-header">
        <h1>{t('dispatch.create.title')}</h1>
        <p>{t('dispatch.create.subtitle')}</p>
      </header>
      {mode === 'api' && client
        ? <RouteCreateForm initialDriverId={params.get('driver') ?? ''} onPublished={({ tripKey, failedFiles }) => navigate(APP_ROUTES.dispatch, { state: { notice: failedFiles ? 'publishedFilesFailed' : 'published', tripKey } })} />
        : <div className="dsp-panel dsp-demo">
            <p>{t('dispatch.configureApi')}</p>
            {client && <button type="button" className="dsp-button" data-variant="primary" onClick={() => setMode('api')}>{t('api.connection.useApi')}</button>}
          </div>}
    </div>
  );
}
