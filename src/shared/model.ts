export type Row = { id: number; label: string };
export type Cell = { id: number; value: number };
export type Alias = { id: number; ref: { value: number } };
export type Scene =
  | 'empty'
  | 'table'
  | 'bindings'
  | 'nested'
  | 'shared'
  | 'mount'
  | 'form'
  | 'route';
export type Fixture = { scene: Scene; count?: number; visible?: boolean };
export type Model = {
  scene: Scene;
  rows: Row[];
  selected: number;
  cells: Cell[];
  deep: { child: { value: number } };
  aliases: Alias[];
  visible: boolean;
};
export type Command = {
  type:
    | 'rows'
    | 'update'
    | 'select'
    | 'swap'
    | 'remove'
    | 'append'
    | 'clear'
    | 'cells'
    | 'leaf'
    | 'middle'
    | 'root'
    | 'shared'
    | 'visible'
    | 'input'
    | 'route';
  count?: number;
  step?: number;
  index?: number;
  value?: string | number | boolean;
};
export const makeRows = (count: number, start = 1): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: start + i, label: `Row ${start + i}` }));
export function makeModel(fixture: Fixture): Model {
  const shared = { value: 0 };
  return {
    scene: fixture.scene,
    selected: -1,
    deep: { child: { value: 0 } },
    visible: fixture.visible ?? false,
    rows: fixture.scene === 'table' ? makeRows(fixture.count ?? 0) : [],
    cells: ['bindings', 'form', 'mount'].includes(fixture.scene)
      ? Array.from({ length: fixture.count ?? 0 }, (_, id) => ({ id, value: 0 }))
      : [],
    aliases:
      fixture.scene === 'shared'
        ? Array.from({ length: fixture.count ?? 0 }, (_, id) => ({ id, ref: shared }))
        : [],
  };
}
// React makes immutable changes; Proxy frameworks mutate their reactive objects.
// Only containers along changed paths are copied; there is no deep-clone/Immer layer.
export function apply(model: Model, command: Command, immutable = false): Model {
  const next = immutable ? { ...model } : model;
  const { type, count = 1, step = 1, index = 0, value } = command;
  switch (type) {
    case 'rows':
      next.rows = makeRows(count, 100001 + index * count);
      break;
    case 'update':
      if (immutable) next.rows = model.rows.slice();
      for (let i = 0; i < next.rows.length; i += step) {
        if (immutable) next.rows[i] = { ...next.rows[i] };
        next.rows[i].label += '!';
      }
      break;
    case 'select':
      next.selected = Number(value);
      break;
    case 'swap': {
      if (immutable) next.rows = model.rows.slice();
      const row = next.rows[1];
      next.rows[1] = next.rows[next.rows.length - 2];
      next.rows[next.rows.length - 2] = row;
      break;
    }
    case 'remove':
      if (immutable) next.rows = model.rows.slice();
      next.rows.splice(index, 1);
      break;
    case 'append': {
      const rows = makeRows(count, 100001);
      if (immutable) next.rows = model.rows.concat(rows);
      else next.rows.push(...rows);
      break;
    }
    case 'clear':
      next.rows = [];
      break;
    case 'cells':
      if (immutable) next.cells = model.cells.slice();
      for (
        let i = index, changed = 0;
        i < next.cells.length && changed < count;
        i += step, changed++
      ) {
        if (immutable) next.cells[i] = { ...next.cells[i] };
        next.cells[i].value++;
      }
      break;
    case 'leaf':
      if (immutable) next.deep = { ...model.deep, child: { ...model.deep.child } };
      next.deep.child.value++;
      break;
    case 'middle':
      next.deep = immutable ? { ...model.deep, child: { value: 1 } } : next.deep;
      if (!immutable) next.deep.child = { value: 1 };
      break;
    case 'root':
      next.deep = { child: { value: 1 } };
      break;
    case 'shared':
      if (immutable) {
        const ref = { value: model.aliases[0].ref.value + 1 };
        next.aliases = model.aliases.map((alias) => ({ ...alias, ref }));
      } else next.aliases[0].ref.value++;
      break;
    case 'visible':
      next.visible = Boolean(value);
      break;
    case 'input':
      if (immutable) {
        next.cells = model.cells.slice();
        next.cells[index] = { ...model.cells[index] };
      }
      next.cells[index].value = Number(value);
      break;
    case 'route':
      break;
  }
  return next;
}
export function oracle(model: Model) {
  switch (model.scene) {
    case 'table':
      return model.rows.map((row) => [String(row.id), row.label, row.id === model.selected]);
    case 'bindings':
    case 'form':
      return model.cells.map((cell) => [String(cell.id), String(cell.value)]);
    case 'nested':
      return String(model.deep.child.value);
    case 'shared':
      return model.aliases.map((alias) => [String(alias.id), String(alias.ref.value)]);
    case 'mount':
      return model.visible ? model.cells.map((cell) => [String(cell.id), String(cell.value)]) : [];
    default:
      return [];
  }
}
