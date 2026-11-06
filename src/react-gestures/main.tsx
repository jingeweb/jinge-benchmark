import { createRoot } from 'react-dom/client';
import { useState, useLayoutEffect, memo } from 'react';
import { createHandlers, entries } from '../shared/gestures';
import '../shared/gestures.css';
const Items = memo(function Items() {
  return (
    <>
      {entries.map((id) => (
        <div key={id} className="item">
          Row {id}
        </div>
      ))}
    </>
  );
});
function App() {
  const [state, setState] = useState({ scroll: 0, x: 0 });
  const [h] = useState(() =>
    createHandlers((patch) => setState((state) => ({ ...state, ...patch }))),
  );
  useLayoutEffect(() => {
    window.__gesture.ready = true;
  }, []);
  return (
    <>
      <div id="scroller" onScroll={(event) => h.scroll(event.nativeEvent)}>
        <Items />
      </div>
      <output id="scroll-value">{state.scroll}</output>
      <div
        id="track"
        onPointerDown={(event) => h.down(event as unknown as PointerEvent)}
        onPointerMove={(event) => h.move(event.nativeEvent)}
        onPointerUp={h.up}
      >
        <div id="thumb" style={{ transform: `translateX(${state.x}px)` }} />
      </div>
      <output id="drag-value">{state.x}</output>
    </>
  );
}
createRoot(document.getElementById('app')!).render(<App />);
