"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, Plus, ArrowLeft, Save, Trash2, X, LayoutDashboard, ChevronDown, Check, Edit2 } from "lucide-react";
import Link from "next/link";
import GridLayout from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { debounce } from "lodash";
import { DashboardWidget, WidgetDef } from "@/components/observability/DashboardWidget";
import { toast } from "sonner";

function CustomSelect({ value, onChange, options, label, direction = 'down' }: { value: string, onChange: (v: string) => void, options: {label: string, value: string}[], label: string, direction?: 'up' | 'down' }) {
  const [open, setOpen] = useState(false);
  
  useEffect(() => {
    const handleClick = () => setOpen(false);
    if (open) window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [open]);

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <label className="block text-xs font-semibold text-zinc-400 mb-1.5 tracking-tight uppercase">{label}</label>
      <button 
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full bg-[#111] border border-[#333] hover:border-zinc-500 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none transition-colors flex items-center justify-between"
      >
        <span className="truncate pr-2">{options.find(o => o.value === value)?.label || "Select..."}</span>
        <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''} shrink-0`} />
      </button>
      
      {open && (
        <div className={`absolute z-50 ${direction === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'} w-full bg-[#0f0f11] border border-[#222] rounded-lg shadow-2xl py-1.5 overflow-hidden animate-in fade-in zoom-in-95 duration-100`}>
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full text-left px-3.5 py-2.5 text-sm flex items-center justify-between hover:bg-[#1a1a1a] transition-colors ${value === opt.value ? 'text-white font-medium bg-[#1a1a1a]/50' : 'text-zinc-400'}`}
            >
              <span className="truncate pr-2">{opt.label}</span>
              {value === opt.value && <Check className="h-4 w-4 shrink-0 text-white" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SingleDashboardPage() {
  const params = useParams();
  const projectId = params?.projectId as string;
  const dashboardId = params?.dashboardId as string;
  const router = useRouter();

  const [dashboard, setDashboard] = useState<any>(null);
  const [layout, setLayout] = useState<any[]>([]);
  const [widgets, setWidgets] = useState<WidgetDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [availableEvents, setAvailableEvents] = useState<string[]>([]);

  // Widget Builder State
  const [wTitle, setWTitle] = useState("");
  const [wEventName, setWEventName] = useState("");
  const [wType, setWType] = useState<'line' | 'bar' | 'number'>('line');
  const [wAgg, setWAgg] = useState<'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX'>('COUNT');
  const [wProp, setWProp] = useState("");
  const [wWindow, setWWindow] = useState<'1h' | '24h' | '7d'>('24h');
  const [errorMsg, setErrorMsg] = useState("");

  const fetchAvailableEvents = useCallback(async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/observability/custom-dashboards/events?projectId=${projectId}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setAvailableEvents(data.events || []);
      }
    } catch (err) {
      console.error(err);
    }
  }, [projectId]);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/observability/custom-dashboards/${dashboardId}?projectId=${projectId}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setDashboard(data.dashboard);
        setLayout(data.dashboard.layout_json || []);
        setWidgets(data.dashboard.widgets_json || []);
      } else {
        router.push(`/dashboard/observability/dashboards/${projectId}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [dashboardId, projectId, router]);

  useEffect(() => {
    fetchDashboard();
    fetchAvailableEvents();
  }, [fetchDashboard, fetchAvailableEvents]);

  // Handle Debounced Save Layout
  const saveLayout = useMemo(
    () => debounce(async (newLayout: any[], currentWidgets: WidgetDef[]) => {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/observability/custom-dashboards/${dashboardId}?projectId=${projectId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ layout_json: newLayout, widgets_json: currentWidgets }),
        });
      } catch (err) {
        console.error("Failed to save layout:", err);
      }
    }, 1000),
    [dashboardId, projectId]
  );

  const onLayoutChange = (newLayout: any) => {
    setLayout(newLayout as any[]);
    if (!loading && dashboard) {
      saveLayout(newLayout as any[], widgets);
    }
  };

  const handleAddWidget = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!wTitle.trim() || !wEventName.trim()) {
      setErrorMsg("Title and Event Name are required.");
      return;
    }
    if (wAgg !== 'COUNT' && !wProp.trim()) {
      setErrorMsg(`Property name is required for ${wAgg} aggregation.`);
      return;
    }
    if (wProp && !/^[a-zA-Z0-9_.]{1,64}$/.test(wProp)) {
      setErrorMsg("Property name must be alphanumeric, dots, or underscores only (max 64 chars).");
      return;
    }

    const newWidget: WidgetDef = {
      id: crypto.randomUUID(),
      title: wTitle.trim(),
      eventName: wEventName.trim(),
      chartType: wType,
      aggregation: wAgg,
      property: wAgg !== 'COUNT' ? wProp.trim() : undefined,
      window: wWindow
    };

    const newLayoutItem = {
      i: newWidget.id,
      x: (layout.length * 4) % 12,
      y: Infinity, // puts it at the bottom
      w: 4,
      h: 3,
      minW: 2,
      minH: 2
    };

    const updatedWidgets = [...widgets, newWidget];
    const updatedLayout = [...layout, newLayoutItem];
    
    setWidgets(updatedWidgets);
    setLayout(updatedLayout);
    saveLayout(updatedLayout, updatedWidgets);
    
    setModalOpen(false);
    toast.success("Widget saved successfully!", { position: 'bottom-right' });
    
    // Reset form
    setWTitle(""); setWEventName(""); setWProp("");
    setWType("line"); setWAgg("COUNT"); setWWindow("24h");
  };

  const removeWidget = (id: string) => {
    const updatedWidgets = widgets.filter(w => w.id !== id);
    const updatedLayout = layout.filter(l => l.i !== id);
    setWidgets(updatedWidgets);
    setLayout(updatedLayout);
    saveLayout(updatedLayout, updatedWidgets);
  };

  const handleNameChange = async (e: React.FocusEvent<HTMLInputElement>) => {
    const newName = e.target.value.trim();
    if (!newName || newName === dashboard?.name) return;
    
    setDashboard({ ...dashboard, name: newName });
    await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/observability/custom-dashboards/${dashboardId}?projectId=${projectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name: newName }),
    });
  };

  if (loading) {
    return (
      <div className="w-full h-screen flex items-center justify-center text-zinc-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto py-10 px-8 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#222] pb-6 mb-8 shrink-0">
        <div className="flex items-center gap-3">
          <Link 
            href={`/dashboard/observability/dashboards/${projectId}`}
            className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="relative flex items-center group">
            <input 
              type="text" 
              defaultValue={dashboard?.name}
              onBlur={handleNameChange}
              className="bg-transparent text-2xl font-semibold text-white tracking-tight outline-none focus:bg-[#111] focus:ring-1 focus:ring-[#333] hover:bg-[#111] rounded-lg px-3 py-1.5 transition-all w-80 pr-8"
              placeholder="Dashboard Name"
            />
            <Edit2 className="h-4 w-4 text-zinc-500 absolute right-3 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity" />
          </div>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 bg-white text-black hover:bg-zinc-200 px-4 py-2 text-sm font-medium rounded-lg transition-all shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Add Widget
        </button>
      </div>

      {/* Grid Area */}
      <div className="flex-1 min-h-[500px]">
        {widgets.length === 0 ? (
          <div className="h-full min-h-[400px] border border-dashed border-[#333] bg-[#0a0a0a]/50 rounded-2xl flex flex-col items-center justify-center text-center">
            <div className="h-14 w-14 rounded-2xl bg-[#111] border border-[#222] flex items-center justify-center mb-5 shadow-xl">
               <LayoutDashboard className="h-6 w-6 text-zinc-500" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2 tracking-tight">This dashboard is empty</h3>
            <p className="text-[15px] text-zinc-400 mb-6 max-w-sm leading-relaxed">
              Add your first widget to start visualizing custom business metrics and event data.
            </p>
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 bg-white text-black hover:bg-zinc-200 px-5 py-2.5 text-sm font-medium rounded-lg transition-all shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Add First Widget
            </button>
          </div>
        ) : (
          <GridLayout
            className="layout -mx-4"
            layout={layout}
            width={1200} // We could use a ResponsiveGridLayout to handle resizing better, but specifying a fixed width for now or a width provider
            {...({ cols: 12 } as any)}
            rowHeight={100}
            draggableHandle=".drag-handle"
            onLayoutChange={onLayoutChange}
          >
            {widgets.map(w => (
              <div key={w.id} className="relative group h-full">
                {/* Drag Handle */}
                <div className="absolute top-0 left-0 w-full h-8 bg-black/60 backdrop-blur-md border-b border-[#222]/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between px-3 cursor-move widget-drag-handle drag-handle z-10 rounded-t-xl">
                  <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Drag to Move</span>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      removeWidget(w.id);
                    }}
                    className="p-1 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 rounded transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                
                {/* Widget Content */}
                <div className="w-full h-full relative z-0">
                  <DashboardWidget projectId={projectId} widget={w} />
                </div>
              </div>
            ))}
          </GridLayout>
        )}
      </div>

      {/* Add Widget Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0a0a0a] border border-[#222] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-[#222]">
              <h2 className="text-lg font-semibold text-white tracking-tight">Add Widget</h2>
              <button onClick={() => setModalOpen(false)} className="text-zinc-500 hover:text-white transition-colors p-1 rounded-md hover:bg-zinc-800">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleAddWidget} className="p-6 flex flex-col gap-5">
              {errorMsg && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-lg">
                  {errorMsg}
                </div>
              )}
              
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1.5 tracking-tight uppercase">Widget Title</label>
                <input 
                  type="text" 
                  value={wTitle} 
                  onChange={e => setWTitle(e.target.value)} 
                  placeholder="e.g., Pro Plan Signups" 
                  className="w-full bg-[#111] border border-[#333] rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-zinc-500 transition-colors" 
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1.5 tracking-tight uppercase">Event Name (Exact Match)</label>
                <input 
                  type="text" 
                  value={wEventName} 
                  onChange={e => setWEventName(e.target.value)} 
                  placeholder="e.g., User Signed Up" 
                  list="eventNamesList"
                  className="w-full bg-[#111] border border-[#333] rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-zinc-500 transition-colors" 
                />
                <datalist id="eventNamesList">
                  {availableEvents.map(ev => (
                    <option key={ev} value={ev} />
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <CustomSelect 
                  label="Chart Type"
                  value={wType}
                  onChange={(v) => setWType(v as any)}
                  options={[
                    { label: 'Line Chart', value: 'line' },
                    { label: 'Bar Chart', value: 'bar' },
                    { label: 'Big Number', value: 'number' }
                  ]}
                />
                <CustomSelect 
                  label="Time Window"
                  value={wWindow}
                  onChange={(v) => setWWindow(v as any)}
                  options={[
                    { label: 'Last 1 Hour', value: '1h' },
                    { label: 'Last 24 Hours', value: '24h' },
                    { label: 'Last 7 Days', value: '7d' }
                  ]}
                />
              </div>

              <div className="grid grid-cols-2 gap-5">
                <CustomSelect 
                  label="Aggregation"
                  value={wAgg}
                  onChange={(v) => setWAgg(v as any)}
                  direction="up"
                  options={[
                    { label: 'Count Total Events', value: 'COUNT' },
                    { label: 'Sum of Property', value: 'SUM' },
                    { label: 'Average of Property', value: 'AVG' },
                    { label: 'Max of Property', value: 'MAX' },
                    { label: 'Min of Property', value: 'MIN' }
                  ]}
                />
                {wAgg !== 'COUNT' && (
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-1.5 tracking-tight uppercase">Property to Aggregate</label>
                    <input 
                      type="text" 
                      value={wProp} 
                      onChange={e => setWProp(e.target.value)} 
                      placeholder="e.g., revenue" 
                      className="w-full bg-[#111] border border-[#333] rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-zinc-500 transition-colors" 
                    />
                  </div>
                )}
              </div>

              <div className="mt-2 flex items-center justify-end gap-3 border-t border-[#222] pt-5">
                <button 
                  type="button" 
                  onClick={() => setModalOpen(false)} 
                  className="text-sm font-medium text-zinc-400 hover:text-white px-4 py-2.5 rounded-lg hover:bg-[#111] transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="bg-white text-black hover:bg-zinc-200 text-sm font-medium px-5 py-2.5 rounded-lg transition-colors shadow-sm"
                >
                  Save Widget
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
