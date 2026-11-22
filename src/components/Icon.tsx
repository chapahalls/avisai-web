import type { SVGProps } from 'react';

type IconName = 'dashboard' | 'metrics' | 'receivers' | 'calls' | 'pause' | 'play' | 'logout' | 'truck' | 'clock' | 'chevron';

const paths: Record<IconName, string> = {
  dashboard: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  metrics: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  receivers: 'M3 21V7l9-4 9 4v14M8 21v-8h8v8M7 9h.01M17 9h.01M12 7h.01',
  calls: 'M6 3H3v4c0 7.7 6.3 14 14 14h4v-3l-5-2-2 2a15 15 0 0 1-8-8l2-2z',
  pause: 'M8 5v14M16 5v14',
  play: 'm8 5 11 7-11 7z',
  logout: 'M10 5H4v14h6M14 8l4 4-4 4M8 12h10',
  truck: 'M3 6h11v12H3zM14 10h4l3 4v4h-7M7 18a2 2 0 1 0 0 .01M18 18a2 2 0 1 0 0 .01',
  clock: 'M12 8v4l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  chevron: 'm6 9 6 6 6-6',
};

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d={paths[name]} />
    </svg>
  );
}
