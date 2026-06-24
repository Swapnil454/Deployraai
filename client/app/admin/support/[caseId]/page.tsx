"use client";

import { useParams } from "next/navigation";
import SupportChat from "@/components/support/SupportChat";

export default function AdminSupportChatPage() {
  const params = useParams();
  const caseId = params?.caseId as string;

  if (!caseId) return null;

  return <SupportChat caseId={caseId} initialIsAdmin={true} />;
}
