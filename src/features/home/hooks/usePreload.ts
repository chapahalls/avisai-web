import { useEffect, useState } from 'react';

/**
 * Progresso real (0–1) do carregamento das fontes e das imagens da abertura.
 * Falhas contam como concluídas: uma imagem indisponível não bloqueia a página.
 * `urls` deve ser uma lista estável (constante de módulo).
 */
export function usePreload(urls: readonly string[]): number {
  const [done, setDone] = useState(0);
  const total = urls.length + 1;
  useEffect(() => {
    let active = true;
    setDone(0);
    const fonts: Promise<unknown> = document.fonts ? document.fonts.ready : Promise.resolve();
    const images = urls.map((url) => {
      const image = new Image();
      image.decoding = 'async';
      image.src = url;
      return image.decode();
    });
    for (const task of [fonts, ...images]) {
      void task.catch(() => undefined).finally(() => { if (active) setDone((count) => count + 1); });
    }
    return () => { active = false; };
  }, [urls]);
  return Math.min(1, done / total);
}
