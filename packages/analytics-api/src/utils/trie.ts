export interface FlamegraphNode {
  name: string;
  value: number;
  children?: FlamegraphNode[];
}

export interface ProfileRow {
  stack_trace: string[];
  total_value: number;
}

export function buildFlamegraphTrie(rows: ProfileRow[]): FlamegraphNode {
  // We initialize the root node. The name doesn't matter too much, Pyroscope uses "root".
  // The value of the root node is the sum of all values.
  const root: FlamegraphNode = { name: 'root', value: 0, children: [] };

  for (const row of rows) {
    let current = root;
    root.value += row.total_value;

    for (let i = 0; i < row.stack_trace.length; i++) {
      const frameName = row.stack_trace[i];
      
      if (!current.children) {
        current.children = [];
      }

      // Check if we already have a child for this frame
      let next = current.children.find(c => c.name === frameName);

      if (!next) {
        next = { name: frameName, value: 0, children: [] };
        current.children.push(next);
      }

      next.value += row.total_value;
      current = next;
    }
  }

  // Optional: simplify tree by removing empty children arrays
  function cleanup(node: FlamegraphNode) {
    if (node.children && node.children.length === 0) {
      delete node.children;
    } else if (node.children) {
      for (const child of node.children) {
        cleanup(child);
      }
    }
  }
  cleanup(root);

  return root;
}
