import { useEffect, useState } from 'react';

/**
 * Progresso real (0–1) do carregamento das fontes e dos arquivos da abertura.
 * Falhas contam como concluídas: um arquivo indisponível não bloqueia a página.
 * `urls` deve ser uma lista estável (constante de módulo).
 */
export function usePreload(urls: readonly string[]): number {
  const [done, setDone] = useState(0);
  const total = urls.length + 1;
  useEffect(() => {
    let active = true;
    setDone(0);
    const fonts: Promise<unknown> = document.fonts ? document.fonts.ready : Promise.resolve();
    const assets = urls.map((url) => {
      const pathname = new URL(url, window.location.href).pathname.toLowerCase();
      if (/\.(?:avif|gif|jpe?g|png|svg|webp)$/.test(pathname)) {
        const image = new Image();
        image.decoding = 'async';
        image.src = url;
        return image.decode();
      }
      return fetch(url, { cache: 'force-cache' }).then((response) => {
        if (!response.ok) throw new Error(`Falha ao carregar ${url}`);
        return response.arrayBuffer();
      });
    });
    for (const task of [fonts, ...assets]) {
      void task.catch(() => undefined).finally(() => { if (active) setDone((count) => count + 1); });
    }
    return () => { active = false; };
  }, [urls]);
  return Math.min(1, done / total);
}
