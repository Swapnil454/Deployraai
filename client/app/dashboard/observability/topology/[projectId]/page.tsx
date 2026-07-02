import { TopologyMap } from '@/components/observability/TopologyMap';

export default async function TopologyPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Service Topology</h1>
        <p className="text-zinc-400 mt-1">Real-time architecture map inferred from distributed traces</p>
      </div>
      
      <div className="flex-1">
        <TopologyMap projectId={projectId} />
      </div>
    </div>
  );
}
