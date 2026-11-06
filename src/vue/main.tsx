import { createApp, defineComponent, reactive, onMounted, onUnmounted } from 'vue';
import { createRouter, createWebHistory, RouterView, useRoute } from 'vue-router';
import { initialModel, register, mounted, bridge, input, lifecycle } from '../shared/bridge';
import {
  apply,
  type Row as RowData,
  type Cell as CellData,
  type Alias as AliasData,
} from '../shared/model';
import '../shared/style.css';
const state = reactive(initialModel());
const Row = defineComponent<{ row: RowData; selected: boolean }>(
  (props) => () => (
    <tr id={`row-${props.row.id}`} data-id={props.row.id} class={props.selected ? 'selected' : ''}>
      <td>{props.row.id}</td>
      <td class="label" id={`label-${props.row.id}`}>
        {props.row.label}
      </td>
    </tr>
  ),
  { props: ['row', 'selected'] },
);
const Cell = defineComponent<{ cell: CellData }>(
  (props) => () => (
    <span class="cell" id={`cell-${props.cell.id}`} data-id={props.cell.id}>
      {props.cell.value}
    </span>
  ),
  { props: ['cell'] },
);
const Alias = defineComponent<{ alias: AliasData }>(
  (props) => () => (
    <span class="alias" id={`alias-${props.alias.id}`} data-id={props.alias.id}>
      {props.alias.ref.value}
    </span>
  ),
  { props: ['alias'] },
);
const Field = defineComponent<{ cell: CellData }>(
  (props) => () => (
    <label>
      <input
        id={`input-${props.cell.id}`}
        data-id={props.cell.id}
        value={props.cell.value}
        onInput={(event: Event) => input(props.cell.id, (event.target as HTMLInputElement).value)}
      />
      <span id={`echo-${props.cell.id}`}>{props.cell.value}</span>
    </label>
  ),
  { props: ['cell'] },
);
const PanelCell = defineComponent<{ cell: CellData }>(
  (props) => {
    onMounted(() => {
      lifecycle.mounted++;
    });
    onUnmounted(() => {
      lifecycle.unmounted++;
    });
    return () => (
      <span class="cell" data-id={props.cell.id}>
        {props.cell.value}
      </span>
    );
  },
  { props: ['cell'] },
);
const User = defineComponent(() => {
  const route = useRoute();
  onMounted(() => {
    lifecycle.mounted++;
  });
  onUnmounted(() => {
    lifecycle.unmounted++;
  });
  return () => (
    <div id="route-page" data-page="user">
      <span id="route-id">{route.params.id}</span>
      <span id="route-query">{route.query.tab}</span>
    </div>
  );
});
const Other = defineComponent(() => {
  onMounted(() => {
    lifecycle.mounted++;
  });
  onUnmounted(() => {
    lifecycle.unmounted++;
  });
  return () => (
    <div id="route-page" data-page="other">
      Other
    </div>
  );
});
const router = createRouter({
  history: createWebHistory('/vue'),
  routes: [
    { path: '/case/user/:id', component: User },
    { path: '/case/other', component: Other },
  ],
});
const App = defineComponent(() => {
  register(
    {
      reset: (model) => Object.assign(state, model),
      update: (command) => {
        apply(state, command);
      },
      navigate: (path) => {
        void router.push(path);
      },
    },
    state,
  );
  onMounted(mounted);
  return () => (
    <>
      <div id="controls">
        <button id="run" onClick={() => bridge.start()}>
          Run
        </button>
      </div>
      <main id="scene" data-scene={state.scene}>
        {state.scene === 'table' && (
          <table>
            <tbody id="rows">
              {state.rows.map((row) => (
                <Row key={row.id} row={row} selected={state.selected === row.id} />
              ))}
            </tbody>
          </table>
        )}
        {state.scene === 'bindings' && (
          <div id="cells">
            {state.cells.map((cell) => (
              <Cell key={cell.id} cell={cell} />
            ))}
          </div>
        )}
        {state.scene === 'nested' && <span id="deep">{state.deep.child.value}</span>}
        {state.scene === 'shared' && (
          <div id="aliases">
            {state.aliases.map((alias) => (
              <Alias key={alias.id} alias={alias} />
            ))}
          </div>
        )}
        {state.scene === 'mount' && state.visible && (
          <div id="panel">
            {state.cells.map((cell) => (
              <PanelCell key={cell.id} cell={cell} />
            ))}
          </div>
        )}
        {state.scene === 'form' && (
          <div id="form">
            {state.cells.map((cell) => (
              <Field key={cell.id} cell={cell} />
            ))}
          </div>
        )}
        {state.scene === 'route' && <RouterView />}
      </main>
    </>
  );
});
createApp(App).use(router).mount('#app');
