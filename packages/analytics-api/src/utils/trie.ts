export interface FlamegraphNode {
  name: string;
  value: number;
  children?: FlamegraphNode[];
}

export interface ProfileRow {
  stack_trace: string[];
  total_value: number;
}

interface InternalNode {
  name: string;
  value: number;
  childrenMap: Map<string, InternalNode>;
}

export function buildFlamegraphTrie(rows: ProfileRow[]): FlamegraphNode {
  // We initialize the root node. The name doesn't matter too much, Pyroscope uses "root".
  // The value of the root node is the sum of all values.
  const rootMap: InternalNode = { name: 'root', value: 0, childrenMap: new Map() };

  for (const row of rows) {
    let current = rootMap;
    rootMap.value += row.total_value;
    
    // Prevent Maximum Call Stack Size Exceeded (Recursion DoS)
    const safeStackTrace = row.stack_trace.slice(0, 500);

    for (let i = 0; i < safeStackTrace.length; i++) {
      const frameName = safeStackTrace[i];
      
      // Skip the frame if it's "root" and it's the very first frame, to prevent a double "root" node
      if (i === 0 && frameName === 'root') {
        continue;
      }

      let next = current.childrenMap.get(frameName);

      if (!next) {
        next = { name: frameName, value: 0, childrenMap: new Map() };
        current.childrenMap.set(frameName, next);
      }

      next.value += row.total_value;
      current = next;
    }
  }

  function toFlamegraphNode(node: InternalNode): FlamegraphNode {
    const fn: FlamegraphNode = { name: node.name, value: node.value };
    if (node.childrenMap.size > 0) {
      fn.children = Array.from(node.childrenMap.values()).map(toFlamegraphNode);
    }
    return fn;
  }

  return toFlamegraphNode(rootMap);
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
