"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

import { Plus, Trash2, Loader2, Server, GripVertical } from "lucide-react";


export default function StatusComponentsPage() {
  const params = useParams();
  const projectId = params?.projectId;

  
  const [components, setComponents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isCreating, setIsCreating] = useState(false);
  const [newComponent, setNewComponent] = useState({ name: "", description: "" });

  useEffect(() => {
    if (!projectId) return;
    fetchComponents();
  }, [projectId]);

  async function fetchComponents() {
    try {
      setLoading(true);
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/status-components`, {
        credentials: "include"
      });
      if (res.ok) {
        setComponents(await res.json());
      }
    } catch (err) {
      alert("Failed to load components");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/status-components`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newComponent)
      });
      if (!res.ok) throw new Error("Failed to create");
      
      alert("Component created");
      setIsCreating(false);
      setNewComponent({ name: "", description: "" });
      fetchComponents();
    } catch (err) {
      alert("Failed to create component");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure?")) return;
    try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/status-components/${id}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (!res.ok) throw new Error("Failed to delete");
      alert("Component deleted");
      setComponents(components.filter(c => c.id !== id));
    } catch (err) {
      alert("Failed to delete component");
    }
  }

  async function handleStatusChange(id: string, newStatus: string) {
    try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/status-components/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_status: newStatus })
      });
      if (!res.ok) throw new Error("Failed to update status");
      alert("Status updated");
      setComponents(components.map(c => c.id === id ? { ...c, current_status: newStatus } : c));
    } catch (err) {
      alert("Failed to update status");
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground"><Loader2 className="animate-spin inline mr-2"/>Loading components...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Status Page Components</h1>
          <p className="text-muted-foreground">Define the systems that appear on your public status page.</p>
        </div>
        
        {isCreating && <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"><div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl shadow-2xl p-6 w-full max-w-md relative">
          
            <button type="button" className="h-10 px-4 flex items-center justify-center bg-white text-black hover:bg-zinc-200 rounded-md font-medium text-sm transition-colors"><Plus className="w-4 h-4 mr-2" /> New Component</button>
          
          
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-white">Add Component</h2>
            </div>
            <form onSubmit={handleCreate} className="space-y-4 pt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-200">Name</label>
                <input className="w-full bg-[#0a0a0a] border border-zinc-800 rounded-md h-10 px-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors" 
                  required 
                  placeholder="e.g., REST API" 
                  value={newComponent.name} 
                  onChange={e => setNewComponent({...newComponent, name: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-200">Description</label>
                <input className="w-full bg-[#0a0a0a] border border-zinc-800 rounded-md h-10 px-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors" 
                  placeholder="e.g., Core application backend" 
                  value={newComponent.description} 
                  onChange={e => setNewComponent({...newComponent, description: e.target.value})}
                />
              </div>
              <button type="submit" className="h-10 px-4 w-full flex items-center justify-center bg-white text-black hover:bg-zinc-200 rounded-md font-medium text-sm transition-colors">Create Component</button>
            </form>
          
        </div></div>}
      </div>

      {components.length === 0 ? (
        <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl overflow-hidden mb-6 text-center p-12 bg-muted/50 border-dashed">
          <Server className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold">No components defined</h3>
          <p className="text-muted-foreground mb-4">Add your infrastructure components to show their status publicly.</p>
          <button type="button" className="h-10 px-4 flex items-center justify-center border border-zinc-800 rounded-md hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors text-sm font-medium" onClick={() => setIsCreating(true)}>Add Component</button>
        </div>
      ) : (
        <div className="bg-[#0a0a0a] border border-zinc-800 rounded-xl overflow-hidden mb-6">
          <div className="divide-y">
            {components.map(component => (
              <div key={component.id} className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="text-slate-400 cursor-move">
                    <GripVertical className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800">{component.name}</h3>
                    {component.description && <p className="text-sm text-slate-500">{component.description}</p>}
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <select value={component.current_status} onChange={(e) => handleStatusChange(component.id, e.target.value)} className="h-9 px-3 w-[180px] bg-[#0a0a0a] border border-zinc-800 rounded-md text-sm text-zinc-300 focus:outline-none">
                    
                      
                    
                    
                      <option value="operational">Operational</option>
                      <option value="degraded">Degraded Performance</option>
                      <option value="partial_outage">Partial Outage</option>
                      <option value="major_outage">Major Outage</option>
                      <option value="maintenance">Under Maintenance</option>
                    
                  </select>
                  
                  <button type="button" className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-white hover:text-red-500 transition-colors" onClick={() => handleDelete(component.id)}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
