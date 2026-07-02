import { redirect } from 'next/navigation';

export default async function StatusPageRoot({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!projectId || projectId === 'undefined') {
    redirect('/dashboard/status-pages');
  }
  redirect(`/dashboard/status-pages/${projectId}/settings`);
}
