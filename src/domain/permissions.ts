export const ROLES = [
  'owner',
  'operations_admin',
  'tracking_operator',
  'customer_support',
  'finance',
  'auditor',
  'business_customer',
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner / Super Administrator',
  operations_admin: 'Operations Administrator',
  tracking_operator: 'Tracking Operator',
  customer_support: 'Customer Support',
  finance: 'Finance',
  auditor: 'Read-Only Auditor',
  business_customer: 'Business Customer',
};

export const PERMISSIONS = [
  'shipments.read',
  'shipments.create',
  'shipments.cancel',
  'shipments.archive',
  'events.create',
  'events.confirm_delivery',
  'events.void',
  'exceptions.manage',
  'tracking_codes.issue',
  'tracking_codes.revoke',
  'quotes.read',
  'quotes.manage',
  'contact.read',
  'documents.generate',
  'audit.read',
  'users.manage',
  'settings.read',
  'finance.read',
  'charges.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: readonly Permission[] = PERMISSIONS;

/**
 * Server-enforced permission matrix. Deny by default: a role only has what is listed.
 * Business customers have no staff permissions; they cannot sign in to the admin console.
 */
export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set(ALL),
  operations_admin: new Set<Permission>([
    'shipments.read',
    'shipments.create',
    'shipments.cancel',
    'shipments.archive',
    'events.create',
    'events.confirm_delivery',
    'events.void',
    'exceptions.manage',
    'tracking_codes.issue',
    'tracking_codes.revoke',
    'quotes.read',
    'quotes.manage',
    'contact.read',
    'documents.generate',
    'audit.read',
    'settings.read',
    'charges.manage',
  ]),
  tracking_operator: new Set<Permission>(['shipments.read', 'events.create', 'exceptions.manage']),
  customer_support: new Set<Permission>([
    'shipments.read',
    'quotes.read',
    'quotes.manage',
    'contact.read',
    'documents.generate',
  ]),
  finance: new Set<Permission>(['shipments.read', 'quotes.read', 'finance.read', 'documents.generate', 'charges.manage']),
  auditor: new Set<Permission>(['shipments.read', 'quotes.read', 'contact.read', 'audit.read', 'settings.read']),
  business_customer: new Set<Permission>(),
};

export const STAFF_ROLES: readonly Role[] = ROLES.filter((r) => r !== 'business_customer');

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function isStaffRole(role: Role): boolean {
  return role !== 'business_customer';
}

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

/** Only owners may grant the owner role; nobody may change their own role. */
export function canAssignRole(actorRole: Role, actorId: string, targetId: string | null, newRole: Role): boolean {
  if (!can(actorRole, 'users.manage')) return false;
  if (targetId !== null && actorId === targetId) return false;
  if (newRole === 'owner' && actorRole !== 'owner') return false;
  return true;
}
