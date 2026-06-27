import { redirect } from 'next/navigation';

export default function StatusPageRoot({ params }: { params: { projectId: string } }) {
  redirect(`/dashboard/status-pages/${params.projectId}/settings`);
}
