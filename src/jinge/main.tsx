import { bootstrap, vm, onMount, onUnmount, type WithChildren, type JNode } from 'jinge';
import { createRouter, Router, RouterView, useNavigate, useParams, useQuery } from 'jinge-router';
import { initialModel, register, mounted, bridge, input, lifecycle } from '../shared/bridge';
import {
  apply,
  type Model,
  type Row as RowData,
  type Cell as CellData,
  type Alias as AliasData,
} from '../shared/model';
import '../shared/style.css';
const state = vm(initialModel());
function Row(props: { row: RowData; selected: boolean }) {
  return (
    <tr
      id={`row-${props.row.id}`}
      data-id={props.row.id}
      className={props.selected ? 'selected' : ''}
    >
      <td>{props.row.id}</td>
      <td className="label" id={`label-${props.row.id}`}>
        {props.row.label}
      </td>
    </tr>
  );
}
function Cell(props: { cell: CellData }) {
  return (
    <span className="cell" id={`cell-${props.cell.id}`} data-id={props.cell.id}>
      {props.cell.value}
    </span>
  );
}
function Alias(props: { alias: AliasData }) {
  return (
    <span className="alias" id={`alias-${props.alias.id}`} data-id={props.alias.id}>
      {props.alias.ref.value}
    </span>
  );
}
function Field(props: { cell: CellData }) {
  return (
    <label>
      <input
        id={`input-${props.cell.id}`}
        data-id={props.cell.id}
        value={props.cell.value}
        on:input={(event) => input(props.cell.id, event.target.value)}
      />
      <span id={`echo-${props.cell.id}`}>{props.cell.value}</span>
    </label>
  );
}
function PanelCell(props: { cell: CellData }) {
  onMount(() => {
    lifecycle.mounted++;
  });
  onUnmount(() => {
    lifecycle.unmounted++;
  });
  return (
    <span className="cell" data-id={props.cell.id}>
      {props.cell.value}
    </span>
  );
}
function User() {
  const params = useParams<{ id: number }>();
  const query = useQuery();
  onMount(() => {
    lifecycle.mounted++;
  });
  onUnmount(() => {
    lifecycle.unmounted++;
  });
  return (
    <div id="route-page" data-page="user">
      <span id="route-id">{params.id}</span>
      <span id="route-query">{query.tab}</span>
    </div>
  );
}
function Other() {
  onMount(() => {
    lifecycle.mounted++;
  });
  onUnmount(() => {
    lifecycle.unmounted++;
  });
  return (
    <div id="route-page" data-page="other">
      Other
    </div>
  );
}
const router = createRouter({
  mode: 'html5',
  baseHref: '/jinge',
  routes: [
    { path: '/case/user/:id<num>', component: User },
    { path: '/case/other', component: Other },
  ],
});
function Workload() {
  const navigate = useNavigate();
  register(
    {
      reset: (model) => Object.assign(state, model),
      update: (command) => {
        apply(state, command);
      },
      navigate: (path) => navigate(path),
    },
    state,
  );
  onMount(mounted);
  return (
    <>
      <div id="controls">
        <button id="run" on:click={() => bridge.start()}>
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
        {state.scene === 'mount' && (
          <>
            {state.visible && (
              <div id="panel">
                {state.cells.map((cell) => (
                  <PanelCell key={cell.id} cell={cell} />
                ))}
              </div>
            )}
          </>
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
}
function App() {
  return (
    <Router router={router}>
      <Workload />
    </Router>
  );
}
bootstrap(App, document.getElementById('app')!);
