import type { SVGProps } from 'react';

type IconName = 'dashboard' | 'metrics' | 'receivers' | 'calls' | 'pause' | 'play' | 'logout' | 'truck' | 'mobile' | 'clock' | 'chevron' | 'sun' | 'moon';

const paths: Record<IconName, string> = {
  dashboard: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  metrics: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  receivers: 'M3 21V7l9-4 9 4v14M8 21v-8h8v8M7 9h.01M17 9h.01M12 7h.01',
  calls: 'M6 3H3v4c0 7.7 6.3 14 14 14h4v-3l-5-2-2 2a15 15 0 0 1-8-8l2-2z',
  pause: 'M8 5v14M16 5v14',
  play: 'm8 5 11 7-11 7z',
  logout: 'M10 5H4v14h6M14 8l4 4-4 4M8 12h10',
  truck: 'M3 6h11v12H3zM14 10h4l3 4v4h-7M7 18a2 2 0 1 0 0 .01M18 18a2 2 0 1 0 0 .01',
  mobile: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2',
  clock: 'M12 8v4l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  chevron: 'm6 9 6 6 6-6',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
};

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d={paths[name]} />
    </svg>
  );
}
