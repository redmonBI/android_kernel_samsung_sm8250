import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "./db";
import { verifySessionToken } from "./session";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  department_id: string | null;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const jar = await cookies();
  const token = jar.get("fk_session")?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;
  const user = getDb()
    .prepare("SELECT id, email, name, role, department_id FROM users WHERE id = ?")
    .get(session.uid) as CurrentUser | undefined;
  return user ?? null;
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
