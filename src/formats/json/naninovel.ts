import { NamedVariable } from '../types';
import { childOf, containerOf, JNode, Step } from './doc';
import { JsonSave } from './save';
import { treeNodeAt } from './tree';

/**
 * Naninovel (a visual novel engine for Unity) saves its state as
 * `{ "objectJsonMap": { "keys": [type names...], "values": [JSON texts...] } }`:
 * each state is JSON inside a string. The story's own variables are the
 * "CustomVariableManager" state: `{ name, scope, value: { type, stringValue,
 * numericValue, booleanValue } }`, where `type` 0 is text, 1 a number and 2
 * true/false.
 */
const VALUE_FIELD = ['stringValue', 'numericValue', 'booleanValue'] as const;
const CUSTOM_VARIABLES = 'Naninovel.CustomVariableManager+GameState';

const textOf = (node: JNode | undefined) => (node?.k === 'string' ? node.value : undefined);

/** A type name without its assembly: "Money.MoneyService+State, Assembly-CSharp, Version=..." -> "Money.MoneyService+State". */
const shortName = (typeName: string) => typeName.split(',')[0].trim();

/** The story's variables by name, then the values of the game's own states (`Money.MoneyService+State.balance`); null when the save isn't Naninovel's. */
export function naninovelVariables(save: JsonSave): NamedVariable[] | null {
  const map = childOf(save.doc.root, 'objectJsonMap');
  const keys = map && childOf(map, 'keys');
  const values = map && childOf(map, 'values');
  if (!map || keys?.k !== 'array' || values?.k !== 'array' || keys.items.length !== values.items.length) return null;

  const result: NamedVariable[] = [];
  const add = (name: string, ref: Step[]) => {
    const node = treeNodeAt(save, ref);
    if (node?.editable) result.push({ name, node });
  };

  const names = keys.items.map((key) => shortName(textOf(key) ?? ''));
  const total = new Map<string, number>();
  names.forEach((name) => total.set(name, (total.get(name) ?? 0) + 1));
  const seen = new Map<string, number>();

  values.items.forEach((state, i) => {
    const container = containerOf(state);
    if (state.k !== 'string' || container.k !== 'object') return;
    const at: Step[] = ['objectJsonMap', 'values', i];

    if (names[i] === CUSTOM_VARIABLES) {
      for (const [list, suffix] of [['LocalVariables', ''], ['GlobalVariables', ' (global)']] as const) {
        const variables = childOf(state, list);
        if (variables?.k !== 'array') continue;
        variables.items.forEach((variable, j) => {
          const name = textOf(childOf(variable, 'name'));
          const value = childOf(variable, 'value');
          const type = value && childOf(value, 'type');
          if (name === undefined || type?.k !== 'number' || !VALUE_FIELD[type.value]) return;
          add(`${name}${suffix}`, [...at, list, j, 'value', VALUE_FIELD[type.value]]);
        });
      }
      return;
    }

    const count = (seen.get(names[i]) ?? 0) + 1;
    seen.set(names[i], count);
    const prefix = (total.get(names[i]) ?? 0) > 1 ? `${names[i]}#${count}` : names[i];
    for (const member of container.members) add(`${prefix}.${member.key}`, [...at, member.key]);
  });
  return result;
}
