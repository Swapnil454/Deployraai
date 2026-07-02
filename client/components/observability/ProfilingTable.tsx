import React, { useMemo, useState } from 'react';
import { ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FlamegraphNode {
  name: string;
  value: number;
  children?: FlamegraphNode[];
}

interface TableRow {
  name: string;
  selfValue: number;
  totalValue: number;
}

export function ProfilingTable({ data, profileType }: { data: FlamegraphNode, profileType: string }) {
  const [sortCol, setSortCol] = useState<'selfValue' | 'totalValue'>('selfValue');
  const [sortDesc, setSortDesc] = useState(true);
  const [tableMode, setTableMode] = useState<'flat' | 'tree'>('tree');

  const formatValue = (val: number) => {
    if (profileType === 'memory') {
      const mb = val / (1024 * 1024);
      if (mb < 1) {
        return `${(val / 1024).toFixed(2)} KB`;
      }
      return `${mb.toFixed(2)} MB`;
    }
    return val.toLocaleString() + ' samples';
  };

  const rows = useMemo(() => {
    const map = new Map<string, TableRow>();
    let totalSamples = data.value;

    function traverse(node: FlamegraphNode) {
      let childrenSum = 0;
      const children = node.children || [];
      for (const c of children) {
        childrenSum += c.value;
        traverse(c);
      }
      
      // Calculate self value
      const selfValue = node.value - childrenSum;
      
      if (!map.has(node.name)) {
        map.set(node.name, { name: node.name, selfValue: 0, totalValue: 0 });
      }
      
      const entry = map.get(node.name)!;
      entry.selfValue += selfValue;
      entry.totalValue += node.value;
    }

    if (data) {
      traverse(data);
    }

    let arr = Array.from(map.values());
    
    // Sort
    arr.sort((a, b) => {
      const valA = a[sortCol];
      const valB = b[sortCol];
      if (sortDesc) return valB - valA;
      return valA - valB;
    });

    return { arr, totalSamples };
  }, [data, sortCol, sortDesc]);

  // Generate tree rows
  const treeRows = useMemo(() => {
    const rows: (TableRow & { depth: number })[] = [];
    if (!data) return rows;

    function traverse(node: FlamegraphNode, depth: number) {
      let childrenSum = 0;
      const children = node.children || [];
      for (const c of children) {
        childrenSum += c.value;
      }
      const selfValue = node.value - childrenSum;
      
      // Skip the artificial duplicate root if necessary, but we already fixed it in trie.ts
      rows.push({
        name: node.name,
        selfValue,
        totalValue: node.value,
        depth
      });

      for (const child of children) {
        traverse(child, depth + 1);
      }
    }
    
    traverse(data, 0);
    return rows;
  }, [data]);

  const toggleSort = (col: 'selfValue' | 'totalValue') => {
    if (tableMode === 'tree') return; // Don't sort tree mode to preserve structure
    if (sortCol === col) {
      setSortDesc(!sortDesc);
    } else {
      setSortCol(col);
      setSortDesc(true);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-black/50 border border-white/10 rounded-md overflow-hidden">
      <div className="flex items-center gap-2 p-2 border-b border-white/10 bg-white/5">
        <Button 
          variant={tableMode === 'tree' ? 'secondary' : 'ghost'} 
          size="sm" 
          onClick={() => setTableMode('tree')}
        >
          Call Tree View
        </Button>
        <Button 
          variant={tableMode === 'flat' ? 'secondary' : 'ghost'} 
          size="sm" 
          onClick={() => setTableMode('flat')}
        >
          Top Bottlenecks (Flat)
        </Button>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs uppercase bg-white/5 border-b border-white/10 text-gray-400 sticky top-0 z-10 backdrop-blur-md">
            <tr>
              <th className="px-6 py-3 font-medium">Function Name</th>
              <th 
                className={`px-6 py-3 font-medium w-[200px] ${tableMode === 'flat' ? 'cursor-pointer hover:bg-white/10 transition-colors' : ''}`}
                onClick={() => toggleSort('selfValue')}
              >
                <div className="flex items-center gap-2">
                  Self Time {tableMode === 'flat' && <ArrowUpDown className="w-3 h-3 opacity-50" />}
                </div>
              </th>
              <th 
                className={`px-6 py-3 font-medium w-[200px] ${tableMode === 'flat' ? 'cursor-pointer hover:bg-white/10 transition-colors' : ''}`}
                onClick={() => toggleSort('totalValue')}
              >
                <div className="flex items-center gap-2">
                  Total Time {tableMode === 'flat' && <ArrowUpDown className="w-3 h-3 opacity-50" />}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {tableMode === 'flat' ? (
              rows.arr.map((row, idx) => {
                const selfPct = rows.totalSamples > 0 ? (row.selfValue / rows.totalSamples) * 100 : 0;
                const totalPct = rows.totalSamples > 0 ? (row.totalValue / rows.totalSamples) * 100 : 0;
                
                return (
                  <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors font-mono">
                    <td className="px-6 py-3 break-all text-gray-200">
                      {row.name}
                    </td>
                <td className="px-6 py-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-gray-300 font-semibold">{formatValue(row.selfValue)}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-orange-500 rounded-full" 
                          style={{ width: `${selfPct}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 w-10">{selfPct.toFixed(1)}%</span>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-gray-300">{formatValue(row.totalValue)}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-500 rounded-full" 
                          style={{ width: `${totalPct}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 w-10">{totalPct.toFixed(1)}%</span>
                    </div>
                  </div>
                </td>
              </tr>
            );
          })
        ) : (

              treeRows.map((row, idx) => {
                const totalSamples = rows.totalSamples;
                const selfPct = totalSamples > 0 ? (row.selfValue / totalSamples) * 100 : 0;
                const totalPct = totalSamples > 0 ? (row.totalValue / totalSamples) * 100 : 0;
                
                return (
                  <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors font-mono">
                    <td className="px-6 py-3 break-all text-gray-200" style={{ paddingLeft: `${row.depth * 2 + 1.5}rem` }}>
                      <div className="flex items-center gap-2">
                        {row.depth > 0 && <div className="w-2 h-px bg-white/20"></div>}
                        {row.name}
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-gray-300 font-semibold">{formatValue(row.selfValue)}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-orange-500 rounded-full" 
                              style={{ width: `${selfPct}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 w-10">{selfPct.toFixed(1)}%</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-gray-300">{formatValue(row.totalValue)}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-blue-500 rounded-full" 
                              style={{ width: `${totalPct}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 w-10">{totalPct.toFixed(1)}%</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
