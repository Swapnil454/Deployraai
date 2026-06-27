"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, Plus, ArrowLeft, Save, Trash2, X } from "lucide-react";
import Link from "next/link";
import GridLayout from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { debounce } from "lodash";
import { DashboardWidget, WidgetDef } from "@/components/observability/DashboardWidget";

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
    <div className="w-full max-w-[1400px] mx-auto py-6 px-8 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div className="flex items-center gap-4">
          <Link 
            href={`/dashboard/observability/dashboards/${projectId}`}
            className="p-2 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <input 
            type="text" 
            defaultValue={dashboard?.name}
            onBlur={handleNameChange}
            className="bg-transparent text-xl font-semibold text-white outline-none focus:bg-zinc-900 focus:ring-1 focus:ring-zinc-700 rounded px-2 py-1 -ml-2"
          />
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 bg-white text-black hover:bg-zinc-200 px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Widget
        </button>
      </div>

      {/* Grid Area */}
      <div className="flex-1 overflow-x-hidden min-h-[500px]">
        {widgets.length === 0 ? (
          <div className="h-full border border-dashed border-zinc-800 rounded-lg flex flex-col items-center justify-center mt-4">
            <p className="text-zinc-500 mb-4">This dashboard is empty</p>
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 text-sm font-medium rounded-md transition-colors"
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
            gridConfig={{ cols: 12, rowHeight: 100 }}
            dragConfig={{ handle: '.drag-handle', enabled: true, threshold: 3, bounded: false }}
            onLayoutChange={onLayoutChange}
          >
            {widgets.map(w => (
              <div key={w.id} className="relative group">
                {/* Drag Handle Bar */}
                <div className="absolute top-0 left-0 right-0 h-6 bg-zinc-900/80 backdrop-blur opacity-0 group-hover:opacity-100 transition-opacity z-10 flex items-center justify-between px-2 cursor-grab drag-handle rounded-t-lg">
                  <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider">Drag to move</span>
                  <button onClick={() => removeWidget(w.id)} className="text-zinc-500 hover:text-red-400 p-0.5">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <DashboardWidget projectId={projectId} widget={w} />
              </div>
            ))}
          </GridLayout>
        )}
      </div>

      {/* Add Widget Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f0f11] border border-zinc-800 rounded-xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <h2 className="text-lg font-medium text-white">Add Widget</h2>
              <button onClick={() => setModalOpen(false)} className="text-zinc-500 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleAddWidget} className="p-4 flex flex-col gap-4">
              {errorMsg && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-md">
                  {errorMsg}
                </div>
              )}
              
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Widget Title</label>
                <input 
                  type="text" 
                  value={wTitle} 
                  onChange={e => setWTitle(e.target.value)} 
                  placeholder="e.g., Pro Plan Signups" 
                  className="w-full bg-black border border-zinc-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" 
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Event Name (Exact Match)</label>
                <input 
                  type="text" 
                  value={wEventName} 
                  onChange={e => setWEventName(e.target.value)} 
                  placeholder="e.g., User Signed Up" 
                  list="eventNamesList"
                  className="w-full bg-black border border-zinc-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" 
                />
                <datalist id="eventNamesList">
                  {availableEvents.map(ev => (
                    <option key={ev} value={ev} />
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Chart Type</label>
                  <select 
                    value={wType} 
                    onChange={(e) => setWType(e.target.value as any)} 
                    className="w-full bg-black border border-zinc-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="line">Line Chart</option>
                    <option value="bar">Bar Chart</option>
                    <option value="number">Big Number</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Time Window</label>
                  <select 
                    value={wWindow} 
                    onChange={(e) => setWWindow(e.target.value as any)} 
                    className="w-full bg-black border border-zinc-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="1h">Last 1 Hour</option>
                    <option value="24h">Last 24 Hours</option>
                    <option value="7d">Last 7 Days</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Aggregation</label>
                  <select 
                    value={wAgg} 
                    onChange={(e) => setWAgg(e.target.value as any)} 
                    className="w-full bg-black border border-zinc-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="COUNT">Count Total Events</option>
                    <option value="SUM">Sum of Property</option>
                    <option value="AVG">Average of Property</option>
                    <option value="MAX">Max of Property</option>
                    <option value="MIN">Min of Property</option>
                  </select>
                </div>
                {wAgg !== 'COUNT' && (
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1">Property to Aggregate</label>
                    <input 
                      type="text" 
                      value={wProp} 
                      onChange={e => setWProp(e.target.value)} 
                      placeholder="e.g., revenue" 
                      className="w-full bg-black border border-zinc-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" 
                    />
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center justify-end gap-3 border-t border-zinc-800 pt-4">
                <button 
                  type="button" 
                  onClick={() => setModalOpen(false)} 
                  className="text-sm font-medium text-zinc-400 hover:text-white px-3 py-2"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors"
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
