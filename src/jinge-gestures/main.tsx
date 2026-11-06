import { bootstrap, vm, onMount } from 'jinge';
import { createHandlers, entries } from '../shared/gestures';
import '../shared/gestures.css';
function Items() {
  return (
    <>
      {entries.map((id) => (
        <div key={id} className="item">
          Row {id}
        </div>
      ))}
    </>
  );
}
function App() {
  const state = vm({ scroll: 0, x: 0 });
  const h = createHandlers((patch) => Object.assign(state, patch));
  onMount(() => {
    window.__gesture.ready = true;
  });
  return (
    <>
      <div id="scroller" on:scroll={h.scroll}>
        <Items />
      </div>
      <output id="scroll-value">{state.scroll}</output>
      <div id="track" on:pointerDown={h.down} on:pointerMove={h.move} on:pointerUp={h.up}>
        <div id="thumb" style={`transform:translateX(${state.x}px)`} />
      </div>
      <output id="drag-value">{state.x}</output>
    </>
  );
}
bootstrap(App, document.getElementById('app')!);
