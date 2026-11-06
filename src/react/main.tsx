import { memo, useState, useLayoutEffect, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrowserRouter,
  Routes,
  Route,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { initialModel, register, mounted, bridge, input, lifecycle } from '../shared/bridge';
import {
  apply,
  type Row as RowData,
  type Cell as CellData,
  type Alias as AliasData,
} from '../shared/model';
import '../shared/style.css';
const Row = memo(function Row(props: { row: RowData; selected: boolean }) {
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
});
const Cell = memo(function Cell(props: { cell: CellData }) {
  return (
    <span className="cell" id={`cell-${props.cell.id}`} data-id={props.cell.id}>
      {props.cell.value}
    </span>
  );
});
const Alias = memo(function Alias(props: { alias: AliasData }) {
  return (
    <span className="alias" id={`alias-${props.alias.id}`} data-id={props.alias.id}>
      {props.alias.ref.value}
    </span>
  );
});
const Field = memo(function Field(props: { cell: CellData }) {
  return (
    <label>
      <input
        id={`input-${props.cell.id}`}
        data-id={props.cell.id}
        value={props.cell.value}
        onChange={(event) => input(props.cell.id, event.target.value)}
      />
      <span id={`echo-${props.cell.id}`}>{props.cell.value}</span>
    </label>
  );
});
function useLifecycle() {
  useEffect(() => {
    lifecycle.mounted++;
    return () => {
      lifecycle.unmounted++;
    };
  }, []);
}
const PanelCell = memo(function PanelCell(props: { cell: CellData }) {
  useLifecycle();
  return (
    <span className="cell" data-id={props.cell.id}>
      {props.cell.value}
    </span>
  );
});
function User() {
  const params = useParams();
  const [query] = useSearchParams();
  useLifecycle();
  return (
    <div id="route-page" data-page="user">
      <span id="route-id">{params.id}</span>
      <span id="route-query">{query.get('tab')}</span>
    </div>
  );
}
function Other() {
  useLifecycle();
  return (
    <div id="route-page" data-page="other">
      Other
    </div>
  );
}
function Workload() {
  const [state, setState] = useState(initialModel);
  const navigate = useNavigate();
  useLayoutEffect(() => {
    register(
      {
        reset: (model) => setState(model),
        update: (command) => setState((previous) => apply(previous, command, true)),
        navigate: (path) => {
          void navigate(path);
        },
      },
      state,
    );
    mounted();
  }, []);
  return (
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
        {state.scene === 'route' && (
          <Routes>
            <Route path="/case/user/:id" element={<User />} />
            <Route path="/case/other" element={<Other />} />
          </Routes>
        )}
      </main>
    </>
  );
}
createRoot(document.getElementById('app')!).render(
  <BrowserRouter basename="/react">
    <Workload />
  </BrowserRouter>,
);
