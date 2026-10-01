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
      
      const isEmpty = !node.name || node.name.trim() === '';
      
      if (!isEmpty) {
        if (!map.has(node.name)) {
          map.set(node.name, { name: node.name, selfValue: 0, totalValue: 0 });
        }
        
        const entry = map.get(node.name)!;
        entry.selfValue += selfValue;
        entry.totalValue += node.value;
      }
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
      
      const isEmpty = !node.name || node.name.trim() === '';
      
      if (!isEmpty) {
        rows.push({
          name: node.name,
          selfValue,
          totalValue: node.value,
          depth
        });
      }

      for (const child of children) {
        traverse(child, isEmpty ? depth : depth + 1);
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
    <div className="w-full h-full flex flex-col">
      <div className="flex items-center gap-2 p-3 border-b border-zinc-800/60 bg-zinc-900/30">
        <Button 
          variant={tableMode === 'tree' ? 'secondary' : 'ghost'} 
          size="sm" 
          onClick={() => setTableMode('tree')}
          className={tableMode === 'tree' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}
        >
          Call Tree View
        </Button>
        <Button 
          variant={tableMode === 'flat' ? 'secondary' : 'ghost'} 
          size="sm" 
          onClick={() => setTableMode('flat')}
          className={tableMode === 'flat' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}
        >
          Top Bottlenecks (Flat)
        </Button>
      </div>
      
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead className="text-xs uppercase bg-zinc-900/50 border-b border-zinc-800/60 text-zinc-400 sticky top-0 z-10 backdrop-blur-xl">
            <tr>
              <th className="px-6 py-4 font-semibold tracking-wider">Function Name</th>
              <th 
                className={`px-6 py-4 font-semibold tracking-wider w-[220px] ${tableMode === 'flat' ? 'cursor-pointer hover:bg-zinc-800/50 transition-colors' : ''}`}
                onClick={() => toggleSort('selfValue')}
              >
                <div className="flex items-center gap-2">
                  Self Time {tableMode === 'flat' && <ArrowUpDown className="w-3 h-3 text-zinc-500" />}
                </div>
              </th>
              <th 
                className={`px-6 py-4 font-semibold tracking-wider w-[220px] ${tableMode === 'flat' ? 'cursor-pointer hover:bg-zinc-800/50 transition-colors' : ''}`}
                onClick={() => toggleSort('totalValue')}
              >
                <div className="flex items-center gap-2">
                  Total Time {tableMode === 'flat' && <ArrowUpDown className="w-3 h-3 text-zinc-500" />}
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
                  <tr key={idx} className="border-b border-zinc-800/40 hover:bg-zinc-800/30 transition-colors font-mono">
                    <td className="px-6 py-4 text-zinc-300">
                      {row.name}
                    </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-zinc-200 font-semibold">{formatValue(row.selfValue)}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden shadow-inner">
                        <div 
                          className="h-full bg-orange-500 rounded-full shadow-[0_0_8px_rgba(249,115,22,0.6)]" 
                          style={{ width: `${selfPct}%` }}
                        />
                      </div>
                      <span className="text-xs text-zinc-500 font-sans w-10">{selfPct.toFixed(1)}%</span>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-zinc-200">{formatValue(row.totalValue)}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden shadow-inner">
                        <div 
                          className="h-full bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.6)]" 
                          style={{ width: `${totalPct}%` }}
                        />
                      </div>
                      <span className="text-xs text-zinc-500 font-sans w-10">{totalPct.toFixed(1)}%</span>
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
                  <tr key={idx} className="border-b border-zinc-800/40 hover:bg-zinc-800/30 transition-colors font-mono">
                    <td className="px-6 py-4 text-zinc-300" style={{ paddingLeft: `${row.depth * 1.5 + 1.5}rem` }}>
                      <div className="flex items-center gap-3">
                        {row.depth > 0 && <div className="w-3 h-px bg-zinc-700 shrink-0"></div>}
                        <span className={row.depth === 0 ? "text-indigo-400 font-semibold" : ""}>{row.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-zinc-200 font-semibold">{formatValue(row.selfValue)}</span>
                        <div className="flex items-center gap-3">
                          <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden shadow-inner">
                            <div 
                              className="h-full bg-orange-500 rounded-full shadow-[0_0_8px_rgba(249,115,22,0.6)]" 
                              style={{ width: `${selfPct}%` }}
                            />
                          </div>
                          <span className="text-xs text-zinc-500 font-sans w-10">{selfPct.toFixed(1)}%</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-zinc-200">{formatValue(row.totalValue)}</span>
                        <div className="flex items-center gap-3">
                          <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden shadow-inner">
                            <div 
                              className="h-full bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.6)]" 
                              style={{ width: `${totalPct}%` }}
                            />
                          </div>
                          <span className="text-xs text-zinc-500 font-sans w-10">{totalPct.toFixed(1)}%</span>
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
