/** Ícones de traço do app do motorista (mesma família dos ícones do rodar-mobile). */
const paths = {
  home: 'M3 11.5 12 4l9 7.5M5.5 9.5V20h4.5v-5.5h4V20h4.5V9.5',
  map: 'M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Zm0 0v14m6-12v14',
  document: 'M6 3h8l4 4v14H6V3Zm8 0v4h4M9 12h6M9 16h6',
  chat: 'M4 12a8 8 0 1 1 3.4 6.5L4 20l1.2-3.6A8 8 0 0 1 4 12Z',
  mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Zm-6 9a6 6 0 0 0 12 0M12 18v3',
  micOff: 'M9 9v3a3 3 0 0 0 5 2.2M15 10V6a3 3 0 0 0-5.7-1.3M6 12a6 6 0 0 0 9.8 4.6M18 12a6 6 0 0 1-.4 2M12 18v3M4 4l16 16',
  speaker: 'M4 9h4l5-4v14l-5-4H4V9Zm13 0a4 4 0 0 1 0 6',
  back: 'm15 5-7 7 7 7',
  play: 'm8 5 11 7-11 7V5Z',
  list: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  navigate: 'M21 3 3 11l7.5 2.5L13 21l8-18Z',
  check: 'm5 12 5 5 9-10',
  connect: 'M10 13a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7l-1.6 1.6M14 11a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 0 0 5.7 5.7l1.6-1.6',
  connected: 'M12 3a9 9 0 1 0 9 9M8 12l3 3 9-9',
  clock: 'M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  sliders: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4',
} as const;

export type AppIconName = keyof typeof paths;

export function AppIcon({ name, size = 20, className }: { name: AppIconName; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
