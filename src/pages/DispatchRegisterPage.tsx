import { Navigate, useParams } from 'react-router-dom';
import { RegisterWizard } from '../features/dispatch';
import { APP_ROUTES } from '../lib/routes';

/** Cadastro passo a passo de motorista ou operador do CCO (Demo e API). */
export function DispatchRegisterPage() {
  const { kind } = useParams();
  if (kind !== 'driver' && kind !== 'operator') return <Navigate to={APP_ROUTES.dispatch} replace />;
  return <RegisterWizard key={kind} kind={kind} />;
}
