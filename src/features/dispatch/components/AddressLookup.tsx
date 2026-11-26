import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../../services/api/client';
import type { BackendGeocodeResult } from '../../../services/api/types';
import { getApiClient } from '../../../services/operations';
import { changeStopAddress, linkGeocodeResult, stopKeys, type RouteDraft, type StopSide } from '../model';

type LookupState = 'idle' | 'loading' | 'done' | 'empty' | 'unconfigured' | 'provider' | 'failed';

/**
 * Endereço digitado → candidatos do backend → o CCO escolhe um e a coordenada fica vinculada ao lugar.
 * Sem geocodificação disponível, a coordenada pode ser digitada, marcada como manual.
 */
export function AddressLookup({ side, draft, disabled, onChange }: {
  side: StopSide;
  draft: RouteDraft;
  disabled: boolean;
  onChange: (patch: Partial<RouteDraft>) => void;
}) {
  const { t } = useTranslation();
  const client = getApiClient();
  const id = useId();
  const k = stopKeys(side);
  const [state, setState] = useState<LookupState>('idle');
  const [results, setResults] = useState<BackendGeocodeResult[]>([]);
  const [provider, setProvider] = useState('');
  const [attribution, setAttribution] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  const source = draft[k.source];
  const address = draft[k.address];
  const canSearch = Boolean(client) && address.trim().replace(/\s+/g, ' ').length >= 3 && !disabled && state !== 'loading';

  const search = async () => {
    if (!client || !canSearch) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState('loading'); setResults([]);
    try {
      const response = await client.geocode(address, controller.signal);
      if (controller.signal.aborted) return;
      setResults(response.resultados); setProvider(response.provedor); setAttribution(response.atribuicao);
      setState(response.resultados.length ? 'done' : 'empty');
    } catch (error) {
      if (controller.signal.aborted) return;
      const status = error instanceof ApiError ? error.status : undefined;
      setState(status === 503 ? 'unconfigured' : status === 502 ? 'provider' : 'failed');
    }
  };

  const coordinateInput = (key: 'lat' | 'lng') => (
    <label className="dsn-field">
      <span>{t(`dispatch.fields.${side}${key === 'lat' ? 'Lat' : 'Lng'}`)}</span>
      <input name={k[key]} value={draft[k[key]]} onChange={(event) => onChange({ [k[key]]: event.target.value })}
        disabled={disabled} required inputMode="decimal" maxLength={25} placeholder={key === 'lat' ? '-23.5505' : '-46.6333'} />
    </label>
  );

  return (
    <div className="dsn-geo dsn-wide">
      <div className="dsn-geo-search">
        <label className="dsn-field">
          <span>{t(`dispatch.geo.address.${side}`)}</span>
          <input name={k.address} value={address} disabled={disabled} maxLength={300} autoComplete="street-address"
            placeholder={t('dispatch.geo.placeholder')} aria-describedby={`${id}-status`}
            onChange={(event) => { onChange(changeStopAddress(draft, side, event.target.value)); if (state !== 'idle') setState('idle'); }}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void search(); } }} />
        </label>
        <button type="button" className="dsp-button" onClick={() => void search()} disabled={!canSearch} aria-busy={state === 'loading'}>
          {t(state === 'loading' ? 'dispatch.geo.searching' : 'dispatch.geo.search')}
        </button>
      </div>

      <div id={`${id}-status`} role="status" aria-live="polite">
        {source === 'geocodificacao' && (
          <p className="dsn-geo-linked">
            <span aria-hidden="true">✓</span>
            <span><strong>{t('dispatch.geo.linked')}</strong> {draft[k.label]}<br />
              {t('dispatch.geo.coordinates', { lat: draft[k.lat], lng: draft[k.lng] })} · {draft[k.provider]} {draft[k.placeId]}</span>
          </p>
        )}
        {source === 'manual' && <p className="dsn-note">{t('dispatch.geo.manualNote')}</p>}
        {source === '' && state === 'idle' && <p className="dsn-note">{t('dispatch.geo.pending')}</p>}
        {state === 'empty' && <p className="dsn-note">{t('dispatch.geo.empty')}</p>}
        {(state === 'unconfigured' || state === 'provider' || state === 'failed') && <p role="alert" className="dsn-alert">{t(`dispatch.geo.errors.${state}`)}</p>}
      </div>

      {state === 'done' && (
        <fieldset className="dsn-geo-results">
          <legend>{t('dispatch.geo.choose')}</legend>
          <ul>
            {results.map((result) => {
              const chosen = source === 'geocodificacao' && draft[k.placeId] === result.id && draft[k.provider] === provider;
              return (
                <li key={result.id}>
                  <label data-chosen={chosen}>
                    <input type="radio" name={`${id}-result`} checked={chosen} disabled={disabled}
                      onChange={() => onChange(linkGeocodeResult(side, provider, result))} />
                    <span><strong>{result.endereco}</strong>
                      <span>{t('dispatch.geo.coordinates', { lat: result.lat.toFixed(5), lng: result.lng.toFixed(5) })}</span></span>
                  </label>
                </li>
              );
            })}
          </ul>
          {attribution && <p className="dsn-geo-attribution">{t('dispatch.geo.attribution', { source: attribution })}</p>}
        </fieldset>
      )}

      {source === 'manual'
        ? <div className="dsn-grid">
            {coordinateInput('lat')}
            {coordinateInput('lng')}
            <button type="button" className="dsn-link" disabled={disabled}
              onClick={() => onChange({ [k.source]: '', [k.lat]: '', [k.lng]: '' })}>{t('dispatch.geo.backToSearch')}</button>
          </div>
        : <button type="button" className="dsn-link" disabled={disabled}
            onClick={() => onChange({ [k.source]: 'manual', [k.lat]: '', [k.lng]: '', [k.provider]: '', [k.placeId]: '', [k.label]: '' })}>
            {t('dispatch.geo.manual')}
          </button>}
    </div>
  );
}
