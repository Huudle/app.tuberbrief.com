// We can keep this type for now to help with transition
// but mark it as deprecated
/** @deprecated Use database plans instead */
export type UserPlan = "free" | "basic" | "pro";

export const PLAN_LIMITS: Record<UserPlan, number> = {
  free: 3,
  basic: 10,
  pro: 35,
};
