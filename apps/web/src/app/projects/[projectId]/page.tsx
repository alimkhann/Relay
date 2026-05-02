import { redirect } from "next/navigation";

import { requirePageViewer } from "@/server/policies/viewer";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requirePageViewer(`/projects/${projectId}`);
  redirect(`/dashboard?project=${projectId}`);
}
