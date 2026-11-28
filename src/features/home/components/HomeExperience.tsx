import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useTranslation } from 'react-i18next';
import { RodarMark } from '../../../components/RodarLogo';
import type { HomeSceneController } from '../three/createHomeScene';
import {
  clamp01,
  sampleHomeTimeline,
  segment,
  storyLineAt,
} from '../three/timeline';
import './home.css';

type SceneState = 'loading' | 'ready' | 'failed' | 'reduced';

function HomeSceneCanvas({
  progress,
  reducedMotion,
  onStateChange,
}: {
  progress: number;
  reducedMotion: boolean;
  onStateChange: (state: SceneState) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const controllerRef = useRef<HomeSceneController | null>(null);
  const progressRef = useRef(progress);

  useEffect(() => {
    progressRef.current = progress;
    controllerRef.current?.setProgress(progress);
  }, [progress]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || reducedMotion) {
      onStateChange('reduced');
      return;
    }

    let active = true;
    let controller: HomeSceneController | null = null;
    let observer: ResizeObserver | null = null;
    onStateChange('loading');

    const resize = () => {
      if (!controller || !active) return;
      const bounds = canvas.getBoundingClientRect();
      controller.resize(bounds.width, bounds.height, window.devicePixelRatio || 1);
    };
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      if (active) onStateChange('failed');
    };
    canvas.addEventListener('webglcontextlost', handleContextLost);

    void (async () => {
      try {
        const { createHomeScene } = await import('../three/createHomeScene');
        if (!active) return;
        const nextController = await createHomeScene(canvas);
        if (!active) {
          nextController.dispose();
          return;
        }
        controller = nextController;
        controllerRef.current = controller;
        observer = new ResizeObserver(resize);
        observer.observe(canvas);
        resize();
        controller.setProgress(progressRef.current);
        onStateChange('ready');
      } catch {
        if (active) onStateChange('failed');
      }
    })();

    return () => {
      active = false;
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      observer?.disconnect();
      controllerRef.current = null;
      controller?.dispose();
    };
  }, [onStateChange, reducedMotion]);

  return <canvas ref={canvasRef} className="home-story-canvas" />;
}

function TypedHeadline({
  text,
  reveal,
}: {
  text: string;
  reveal: number;
}) {
  const characters = Array.from(text);
  const visible = Math.max(0, Math.min(characters.length, Math.round(characters.length * reveal)));
  const currentIndex = visible > 0 ? visible - 1 : -1;
  return (
    <span className="home-story-typed-text" aria-label={text}>
      <span aria-hidden="true">{characters.slice(0, Math.max(0, currentIndex)).join('')}</span>
      <span className="home-story-current-character" aria-hidden="true">
        {currentIndex >= 0 ? characters[currentIndex] : ''}
      </span>
      <span className="home-story-untyped" aria-hidden="true">{characters.slice(visible).join('')}</span>
    </span>
  );
}

/** Uma única cena e uma única câmera: chip, celular, caminhão, Brasil e mundo. */
export function HomeExperience({ ready, reducedMotion }: { ready: boolean; reducedMotion: boolean }) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [sceneState, setSceneState] = useState<SceneState>(reducedMotion ? 'reduced' : 'loading');

  useEffect(() => {
    if (reducedMotion) {
      setProgress(0.09);
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const root = rootRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      const travel = Math.max(1, rect.height - window.innerHeight);
      const next = clamp01(-rect.top / travel);
      setProgress((current) => Math.abs(current - next) < 0.0008 ? current : next);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [reducedMotion]);

  const effectiveProgress = reducedMotion ? 0.09 : progress;
  const sample = sampleHomeTimeline(effectiveProgress);
  const typed = storyLineAt(effectiveProgress);
  const stage = typed.line.stage;
  const title = t(`home.story.${stage}.title`);
  const kicker = t(`home.story.${stage}.kicker`);
  const fallbackVisible = sceneState !== 'ready';
  const handleSceneState = useCallback((state: SceneState) => setSceneState(state), []);
  const style = {
    '--story-grid-opacity': String(
      0.1
      + segment(effectiveProgress, 0.34, 0.62) * 0.17
      - segment(effectiveProgress, 0.84, 0.98) * 0.1,
    ),
    '--story-copy-opacity': String(typed.opacity),
    '--story-progress': `${effectiveProgress * 100}%`,
    '--story-exit-y': `${(1 - segment(effectiveProgress, 0.965, 1)) * 100}%`,
  } as CSSProperties;

  return (
    <section
      id="experiencia"
      ref={rootRef}
      className="home-experience"
      data-ready={ready}
      data-scene={sceneState}
      data-stage={stage}
      style={style}
      aria-label={t('home.story.label')}
    >
      <div className="home-experience-sticky">
        <div className="home-story-scene">
          <HomeSceneCanvas
            progress={effectiveProgress}
            reducedMotion={reducedMotion}
            onStateChange={handleSceneState}
          />
          <div className="home-story-fallback" aria-hidden="true" data-visible={fallbackVisible}>
            <span className="home-story-fallback-halo" />
            <RodarMark className="home-story-fallback-mark" />
          </div>
        </div>
        <div className="home-story-grid" aria-hidden="true" />
        <div className="home-story-vignette" aria-hidden="true" />

        <div className="home-story-copy" data-stage={stage}>
          <p>{kicker}</p>
          <h1>
            <TypedHeadline text={title} reveal={typed.reveal} />
          </h1>
        </div>

        <div className="home-story-stage-index" aria-hidden="true">
          <span>{String(typed.index + 1).padStart(2, '0')}</span>
          <i />
          <span>05</span>
        </div>
        <div
          className="home-story-scroll"
          aria-hidden="true"
          style={{ opacity: 1 - segment(effectiveProgress, 0.01, 0.08) }}
        >
          {t('home.hero.scroll')}
        </div>
        <div className="home-story-exit-mask" aria-hidden="true" />
      </div>
    </section>
  );
}
