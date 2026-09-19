/**
 * Which surface each kind of account owns.
 *
 * There is exactly one home per role and no overlap, which is what makes the
 * separation checkable: a screen belongs to one role or it belongs to nobody.
 */
export const ROLE_HOME: Record<string, string> = {
  physician: "/doctor",
  patient: "/patient",
};

/** Null for a credential with no surface in this build, such as the engineer key. */
export function roleHome(role: string | null | undefined): string | null {
  if (!role) return null;
  return ROLE_HOME[role] ?? null;
}
