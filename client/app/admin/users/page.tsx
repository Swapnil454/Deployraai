"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import Image from "next/image";

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL || '${process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_API_URL}`}'}`}/api/admin/users`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setUsers(data.users);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-8">Users</h1>
      
      <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/50">
        <table className="w-full text-left text-sm text-zinc-400">
          <thead className="bg-zinc-900 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-6 py-4 font-medium">User</th>
              <th className="px-6 py-4 font-medium">Role</th>
              <th className="px-6 py-4 font-medium">Connections</th>
              <th className="px-6 py-4 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50 bg-black/40">
            {users.map((u: any) => (
              <tr key={u._id} className="hover:bg-zinc-800/20 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    {u.avatar ? (
                      <Image src={u.avatar} alt="Avatar" width={32} height={32} className="rounded-full" />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-zinc-800"></div>
                    )}
                    <div>
                      <div className="font-medium text-white">{u.name || 'Unnamed'}</div>
                      <div className="text-xs text-zinc-500">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-xs uppercase ${u.role === 'admin' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'bg-zinc-800 text-zinc-400'}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-2">
                    {u.githubConnected && <span className="h-2 w-2 rounded-full bg-emerald-500" title="GitHub"></span>}
                    {u.vercelConnected && <span className="h-2 w-2 rounded-full bg-emerald-500" title="Vercel"></span>}
                    {u.renderConnected && <span className="h-2 w-2 rounded-full bg-emerald-500" title="Render"></span>}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
