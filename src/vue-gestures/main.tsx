import { createApp, defineComponent, reactive, onMounted } from 'vue';
import { createHandlers, entries } from '../shared/gestures';
import '../shared/gestures.css';
const Items = defineComponent(() => () => (
  <>
    {entries.map((id) => (
      <div key={id} class="item">
        Row {id}
      </div>
    ))}
  </>
));
const App = defineComponent(() => {
  const state = reactive({ scroll: 0, x: 0 });
  const h = createHandlers((patch) => Object.assign(state, patch));
  onMounted(() => {
    window.__gesture.ready = true;
  });
  return () => (
    <>
      <div id="scroller" onScroll={h.scroll}>
        <Items />
      </div>
      <output id="scroll-value">{state.scroll}</output>
      <div id="track" onPointerdown={h.down} onPointermove={h.move} onPointerup={h.up}>
        <div id="thumb" style={{ transform: `translateX(${state.x}px)` }} />
      </div>
      <output id="drag-value">{state.x}</output>
    </>
  );
});
createApp(App).mount('#app');
