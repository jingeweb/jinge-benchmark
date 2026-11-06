export const entries = Array.from({ length: 200 }, (_, i) => i);
export type GestureState = { scroll: number; x: number };
export function createHandlers(update: (patch: Partial<GestureState>) => void) {
  const data = {
    ready: false,
    mode: 'bound',
    samples: [] as { kind: string; domMs: number | null; eventAgeMs: number; rafMs?: number }[],
    frames: [] as number[],
    recording: false,
  };
  let dragging = false,
    origin = 0;
  function observed(
    kind: string,
    event: Event,
    mutate: () => void,
    complete: () => boolean,
    passive = false,
  ) {
    const start = performance.now(),
      sample = {
        kind,
        domMs: null as number | null,
        eventAgeMs: start - event.timeStamp,
        rafMs: undefined as number | undefined,
      };
    data.samples.push(sample);
    const observer = new MutationObserver(check);
    function finish() {
      observer.disconnect();
      if (!passive) sample.domMs = performance.now() - start;
      requestAnimationFrame(() => {
        sample.rafMs = performance.now() - start;
      });
    }
    function check() {
      if (complete()) finish();
    }
    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
    });
    mutate();
    check();
  }
  const handlers = {
    scroll(event: Event) {
      const target = event.target as HTMLElement,
        scroll = target.scrollTop;
      if (data.mode === 'passive') {
        observed(
          'scroll',
          event,
          () => {},
          () => true,
          true,
        );
        return;
      }
      observed(
        'scroll',
        event,
        () => update({ scroll }),
        () => document.getElementById('scroll-value')?.textContent === String(scroll),
      );
    },
    down(event: PointerEvent) {
      dragging = true;
      origin = event.clientX - Number(document.getElementById('drag-value')?.textContent ?? 0);
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    },
    move(event: PointerEvent) {
      if (!dragging) return;
      const x = Math.max(0, Math.min(300, Math.round(event.clientX - origin)));
      if (document.getElementById('drag-value')?.textContent === String(x)) return;
      observed(
        'drag',
        event,
        () => update({ x }),
        () =>
          document.getElementById('drag-value')?.textContent === String(x) &&
          document.getElementById('thumb')?.style.transform === `translateX(${x}px)`,
      );
    },
    up() {
      dragging = false;
    },
  };
  let frame = 0;
  const api = {
    ...data,
    begin(mode: string) {
      api.mode = mode;
      data.mode = mode;
      data.samples.length = 0;
      data.frames.length = 0;
      data.recording = true;
      const step = (time: number) => {
        if (!data.recording) return;
        data.frames.push(time);
        frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    },
    end() {
      data.recording = false;
      cancelAnimationFrame(frame);
      return {
        samples: data.samples,
        intervals: data.frames.slice(1).map((time, i) => time - data.frames[i]),
      };
    },
  };
  Object.assign(api, { samples: data.samples, frames: data.frames });
  window.__gesture = api;
  return handlers;
}
export interface GestureAPI {
  ready: boolean;
  mode: string;
  samples: { kind: string; domMs: number | null; eventAgeMs: number; rafMs?: number }[];
  frames: number[];
  recording: boolean;
  begin(mode: string): void;
  end(): { samples: GestureAPI['samples']; intervals: number[] };
}
declare global {
  interface Window {
    __gesture: GestureAPI;
  }
}
