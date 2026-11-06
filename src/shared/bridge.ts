import { makeModel, apply, oracle, type Model, type Command, type Fixture } from './model';
export type Adapter = {
  reset(model: Model): void;
  update(command: Command): void;
  navigate(path: string): void;
};
export const lifecycle = { mounted: 0, unmounted: 0 };
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
export async function quiet() {
  await frame();
  await frame();
}
export function snapshot() {
  const scene = document.getElementById('scene')?.getAttribute('data-scene');
  if (scene === 'table')
    return [...document.querySelectorAll('#rows > tr')].map((row) => [
      row.getAttribute('data-id'),
      row.querySelector('.label')?.textContent,
      row.classList.contains('selected'),
    ]);
  if (scene === 'form')
    return [...document.querySelectorAll<HTMLInputElement>('#form input')].map((input) => [
      input.getAttribute('data-id'),
      input.value,
    ]);
  if (scene === 'nested') return document.getElementById('deep')?.textContent;
  if (scene === 'route')
    return [
      document.getElementById('route-page')?.getAttribute('data-page'),
      document.getElementById('route-id')?.textContent,
      document.getElementById('route-query')?.textContent,
    ];
  return [...document.querySelectorAll('#cells > span, #aliases > span, #panel > span')].map(
    (cell) => [cell.getAttribute('data-id'), cell.textContent],
  );
}
function quick(model: Model, command?: Command): () => boolean {
  const scene = model.scene;
  if (scene === 'route') {
    const path = String(command?.value ?? '/case/user/1?tab=a');
    if (path.includes('/other'))
      return () => document.getElementById('route-page')?.getAttribute('data-page') === 'other';
    const id = path.includes('/2') ? '2' : '1',
      query = path.includes('tab=b') ? 'b' : 'a';
    return () =>
      document.getElementById('route-id')?.textContent === id &&
      document.getElementById('route-query')?.textContent === query;
  }
  if (scene === 'table')
    return () => {
      const rows = document.getElementById('rows');
      if (!rows || rows.children.length !== model.rows.length) return false;
      if (!model.rows.length) return true;
      if (command?.type === 'select')
        return (
          document.getElementById(`row-${model.selected}`)?.classList.contains('selected') === true
        );
      const index =
        command?.type === 'remove'
          ? 500
          : command?.type === 'swap'
            ? 1
            : command?.type === 'update'
              ? Math.floor((model.rows.length - 1) / (command.step ?? 1)) * (command.step ?? 1)
              : 0;
      const expected = model.rows[Math.min(index, model.rows.length - 1)];
      return (
        rows.children[Math.min(index, model.rows.length - 1)]?.getAttribute('data-id') ===
          String(expected.id) &&
        document.getElementById(`label-${expected.id}`)?.textContent === expected.label
      );
    };
  if (scene === 'nested')
    return () => document.getElementById('deep')?.textContent === String(model.deep.child.value);
  if (scene === 'form')
    return () => {
      const inputs = document.querySelectorAll<HTMLInputElement>('#form input');
      const index = command?.index ?? 0;
      return (
        inputs.length === model.cells.length &&
        inputs[index]?.value === String(model.cells[index]?.value) &&
        document.getElementById(`echo-${index}`)?.textContent === String(model.cells[index]?.value)
      );
    };
  if (scene === 'shared')
    return () =>
      document.getElementById('aliases')?.children.length === model.aliases.length &&
      document.getElementById(`alias-${model.aliases.length - 1}`)?.textContent ===
        String(model.aliases.at(-1)?.ref.value);
  if (scene === 'mount')
    return () =>
      model.visible
        ? document.getElementById('panel')?.children.length === model.cells.length
        : !document.getElementById('panel');
  if (scene === 'bindings')
    return () => {
      if (document.getElementById('cells')?.children.length !== model.cells.length) return false;
      const start = command?.index ?? 0,
        end = Math.min(
          model.cells.length - 1,
          start + ((command?.count ?? 1) - 1) * (command?.step ?? 1),
        );
      return [start, end].every(
        (index) =>
          document.getElementById(`cell-${index}`)?.textContent ===
          String(model.cells[index].value),
      );
    };
  return () => document.getElementById('scene')?.getAttribute('data-scene') === 'empty';
}
function observed(mutate: () => void, ready: () => boolean): Promise<number> {
  return new Promise((resolve, reject) => {
    let done = false;
    const observer = new MutationObserver(check);
    const timeout = window.setTimeout(() => {
      observer.disconnect();
      reject(new Error('DOM completion timeout'));
    }, 15000);
    performance.mark('bench:operation-start');
    const started = performance.now();
    function check() {
      if (!done && ready()) {
        done = true;
        const elapsed = performance.now() - started;
        performance.mark('bench:operation-dom');
        observer.disconnect();
        clearTimeout(timeout);
        resolve(elapsed);
      }
    }
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
    mutate();
    check();
  });
}
let adapter: Adapter, model: Model, staged: Command | undefined;
export const bridge = {
  ready: false,
  result: undefined as Promise<number> | undefined,
  events: [] as {
    name: string;
    duration: number;
    interactionId: number;
    inputDelay: number;
    processing: number;
  }[],
  longTasks: [] as number[],
  async prepare(fixture: Fixture) {
    model = makeModel(fixture);
    staged = undefined;
    await observed(() => {
      adapter.reset(makeModel(fixture));
      if (fixture.scene === 'route') adapter.navigate('/case/user/1?tab=a');
    }, quick(model));
    await quiet();
  },
  stage(command: Command) {
    staged = command;
  },
  start() {
    const command = staged;
    if (!command) throw new Error('No staged command');
    staged = undefined;
    model = apply(model, command, true);
    const ready = quick(model, command);
    bridge.result = observed(
      () =>
        command.type === 'route'
          ? adapter.navigate(String(command.value))
          : adapter.update(command),
      ready,
    );
  },
  async run(command: Command) {
    bridge.stage(command);
    bridge.start();
    return await bridge.result!;
  },
  async input(value: string) {
    model = apply(model, { type: 'input', index: 0, value: Number(value) }, true);
    await observed(
      () => {
        const el = document.getElementById('input-0') as HTMLInputElement;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setter.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      },
      quick(model, { type: 'input', index: 0 }),
    );
  },
  expected() {
    return oracle(model);
  },
  snapshot,
  quiet,
  lifecycle,
};
export function input(index: number, value: string) {
  const command: Command = { type: 'input', index, value: Number(value) };
  model = apply(model, command, true);
  bridge.result = observed(() => adapter.update(command), quick(model, command));
}
export function register(value: Adapter, initial: Model) {
  adapter = value;
  model = makeModel({ scene: 'empty' });
  Object.assign(model, initial);
  window.__bench = bridge;
  if (PerformanceObserver.supportedEntryTypes.includes('event'))
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceEventTiming[])
        if (entry.interactionId)
          bridge.events.push({
            name: entry.name,
            duration: entry.duration,
            interactionId: entry.interactionId,
            inputDelay: entry.processingStart - entry.startTime,
            processing: entry.processingEnd - entry.processingStart,
          });
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
  if (PerformanceObserver.supportedEntryTypes.includes('longtask'))
    new PerformanceObserver((list) =>
      bridge.longTasks.push(...list.getEntries().map((entry) => entry.duration)),
    ).observe({ type: 'longtask', buffered: true });
}
export function mounted() {
  performance.mark('bench:ready');
  bridge.ready = true;
}
export function initialModel() {
  const boot = new URL(location.href).searchParams.get('boot');
  return makeModel(
    boot === 'table'
      ? { scene: 'table', count: 1000 }
      : boot === 'form'
        ? { scene: 'form', count: 200 }
        : { scene: 'empty' },
  );
}
declare global {
  interface Window {
    __bench: typeof bridge;
  }
}
