export const ROLES = [
  "viewer",
  "sales",
  "department_manager",
  "purchasing_support",
  "warehouse_manager",
  "finance_viewer",
  "approver",
  "admin",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  viewer: "조회",
  sales: "영업",
  department_manager: "부서 담당",
  purchasing_support: "구매지원",
  warehouse_manager: "물류",
  finance_viewer: "재무 조회",
  approver: "승인자",
  admin: "관리자",
};

const COST_ROLES: Role[] = ["admin", "finance_viewer", "purchasing_support", "approver"];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function canSeeCost(role: string): boolean {
  return isRole(role) && COST_ROLES.includes(role);
}

export function canReserve(role: string): boolean {
  return ["admin", "sales", "department_manager", "warehouse_manager", "approver"].includes(role);
}

export function canPropose(role: string): boolean {
  return ["admin", "sales", "department_manager", "approver"].includes(role);
}

export function canImport(role: string): boolean {
  return role === "admin" || role === "purchasing_support";
}

export function canApprove(role: string): boolean {
  return role === "admin" || role === "approver";
}

export function canAdjust(role: string): boolean {
  return ["admin", "purchasing_support", "warehouse_manager"].includes(role);
}

export function canEditContent(role: string): boolean {
  return ["admin", "sales", "department_manager"].includes(role);
}

export function canEditSellPrice(role: string): boolean {
  return ["admin", "purchasing_support", "sales"].includes(role);
}

export function canManageCatalog(role: string): boolean {
  return role === "admin" || role === "purchasing_support";
}
