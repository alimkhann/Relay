import { ProjectSwitcher } from "./project-switcher";
import { listProjectsForUser } from "@/server/services/project-service";
import { getAuthServer } from "@/lib/auth/server";

export async function ProjectSwitcherWrapper() {
  const auth = getAuthServer();
  if (!auth) return null;

  const { data } = await auth.getSession();
  const userId = data?.user?.id;
  if (!userId) return null;

  const projects = await listProjectsForUser(userId);
  if (projects.length === 0) return null;

  return (
    <ProjectSwitcher
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      currentId={projects[0]?.id ?? ""}
    />
  );
}
