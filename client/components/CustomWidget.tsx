import React, { useEffect, useState } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Loader2 } from "lucide-react";

interface CustomWidgetProps {
  projectId: string;
  config: {
    title: string;
    dimensions: string[];
    metrics: string[];
    chartType: "line" | "bar" | "number";
    timeRange: { from: string; to: string };
  };
}

export const CustomWidget: React.FC<CustomWidgetProps> = ({ projectId, config }) => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const configString = JSON.stringify(config);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const ANALYTICS_API_URL = process.env.NEXT_PUBLIC_API_URL 
          ? `${process.env.NEXT_PUBLIC_API_URL}/api/observability` 
          : "http://localhost:5000/api/observability";

        const res = await fetch(`${ANALYTICS_API_URL}/metrics/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            projectId,
            dimensions: config.dimensions,
            metrics: config.metrics,
            timeRange: config.timeRange,
          })
        });

        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error("Failed to load custom widget data", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [projectId, configString]);

  if (loading) {
    return (
      <div className="w-full h-full flex justify-center items-center">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  // Format data for Recharts based on dimensions and metrics
  // m0, m1 are returned by the API
  const xKey = config.dimensions.length > 0 ? config.dimensions[0] : "m0";
  const yKey = "m0"; 

  if (config.chartType === "number") {
    return (
      <div className="flex flex-col justify-center items-center h-full">
        <span className="text-4xl font-bold">{data[0]?.[yKey] || 0}</span>
      </div>
    );
  }

  const ChartComp = config.chartType === "bar" ? BarChart : LineChart;
  const DataComp = config.chartType === "bar" ? Bar : Line;

  return (
    <div className="w-full h-full pt-4">
      <ResponsiveContainer width="100%" height="100%">
        <ChartComp data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
          <XAxis dataKey={xKey} stroke="#52525b" />
          <YAxis stroke="#52525b" />
          <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', borderColor: '#27272a', color: '#fff' }} />
          {/* @ts-ignore */}
          <DataComp dataKey={yKey} stroke="#3b82f6" fill="#3b82f6" name="Value" strokeWidth={2} />
        </ChartComp>
      </ResponsiveContainer>
    </div>
  );
};
