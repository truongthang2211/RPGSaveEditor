import { GameDatabase, SaveTree, TreeNode } from '../../formats';

/** What the IDs inside a container refer to. */
type NameKind = 'items' | 'weapons' | 'armors' | 'switches' | 'variables';

/**
 * Containers holding database IDs, by class and key. RPG Maker uses the same
 * class names in every engine: "@items" in XP/VX/VX Ace, "_items" in MV/MZ.
 */
const ID_CONTAINERS: Record<string, Record<string, NameKind>> = {
  Game_Party: {
    '@items': 'items',
    _items: 'items',
    '@weapons': 'weapons',
    _weapons: 'weapons',
    '@armors': 'armors',
    _armors: 'armors',
  },
  Game_Switches: { '@data': 'switches', _data: 'switches' },
  Game_Variables: { '@data': 'variables', _data: 'variables' },
};

/** "3", "[3]" -> 3; anything else -> undefined. */
function idOf(key: string): number | undefined {
  const match = /^\[?(\d+)\]?$/.exec(key);
  return match ? Number(match[1]) : undefined;
}

function nameIn(database: GameDatabase, kind: NameKind, id: number): string | undefined {
  const name =
    kind === 'switches' ? database.system?.switches?.[id]
    : kind === 'variables' ? database.system?.variables?.[id]
    : database[kind]?.[id]?.name;
  return name?.trim() || undefined;
}

/**
 * The tree with each database ID labelled with its name (an item ID with the
 * item's name, a switch index with the switch's name...), so they can be
 * shown and searched. Saves only store IDs; the names come from the game's
 * database. Without a database the tree is returned as is.
 */
export function withNames<S>(tree: SaveTree<S>, database: GameDatabase | null | undefined): SaveTree<S> {
  if (!database) return tree;
  // Node id -> what the IDs in that container refer to.
  const containers = new Map<string, NameKind>();

  const label = (parent: TreeNode | null, node: TreeNode): TreeNode => {
    const parentKind = parent ? containers.get(parent.id) : undefined;
    const kind = parent ? ID_CONTAINERS[parent.type]?.[node.key] : undefined;
    if (kind) {
      containers.set(node.id, kind);
      return node;
    }
    if (parentKind && node.key === '@a') {
      // MV wraps arrays as {"@a": [...]}: the IDs are one level down.
      containers.set(node.id, parentKind);
      return node;
    }
    const id = parentKind ? idOf(node.key) : undefined;
    const name = id !== undefined ? nameIn(database, parentKind!, id) : undefined;
    return name ? { ...node, label: name } : node;
  };

  return {
    ...tree,
    roots: (save) => tree.roots(save).map((node) => label(null, node)),
    children: (save, parent) => tree.children(save, parent).map((node) => label(parent, node)),
  };
}
