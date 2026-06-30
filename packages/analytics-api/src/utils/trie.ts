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
    
    // Prevent Maximum Call Stack Size Exceeded (Recursion DoS)
    const safeStackTrace = row.stack_trace.slice(0, 500);

    for (let i = 0; i < safeStackTrace.length; i++) {
      const frameName = safeStackTrace[i];
      
      // Skip the frame if it's "root" and it's the very first frame, to prevent a double "root" node
      if (i === 0 && frameName === 'root') {
        continue;
      }

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

export function convertTreeToFlamebearer(root: FlamegraphNode, units: string = "samples") {
  const names: string[] = [];
  const nameMap = new Map<string, number>();

  function getNameIndex(name: string) {
    if (nameMap.has(name)) return nameMap.get(name)!;
    const idx = names.length;
    names.push(name);
    nameMap.set(name, idx);
    return idx;
  }

  const levels: number[][] = [];
  let maxSelf = 0;

  function traverse(node: FlamegraphNode, depth: number, offset: number) {
    if (!levels[depth]) levels[depth] = [];
    
    const children = node.children || [];
    let childrenTotal = 0;
    for (const child of children) {
      childrenTotal += child.value;
    }
    const self = node.value - childrenTotal;
    if (self > maxSelf) maxSelf = self;

    levels[depth].push(
      offset,
      node.value,
      self,
      getNameIndex(node.name)
    );

    let childOffset = offset;
    for (const child of children) {
      traverse(child, depth + 1, childOffset);
      childOffset += child.value;
    }
  }

  traverse(root, 0, 0);

  return {
    version: 1,
    flamebearer: {
      names,
      levels,
      numTicks: root.value,
      maxSelf
    },
    metadata: {
      format: "single",
      sampleRate: 100,
      units: units
    }
  };
}
