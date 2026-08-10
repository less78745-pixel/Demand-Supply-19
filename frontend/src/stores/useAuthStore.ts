import { create } from 'zustand';

export type UserRole = 'Super Admin' | 'DSP' | 'Regional';

interface User {
  id: string;
  name: string;
  role: UserRole;
}

interface AuthState {
  user: User | null;
  login: (userData: User) => void;
  logout: () => void;
}

// --- User credentials database ---
interface UserCredentials {
  password: string;
  user: User;
}

export const USERS_DB: Record<string, UserCredentials> = {
  AFIF: {
    password: 'out19',
    user: { id: 'u-afif', name: 'AFIF', role: 'Super Admin' },
  },
  DSP: {
    password: 'DSP',
    user: { id: 'u-dsp', name: 'DSP', role: 'DSP' },
  },
  R1: {
    password: 'R1',
    user: { id: 'u-r1', name: 'R1', role: 'Regional' },
  },
  R2: {
    password: 'R2',
    user: { id: 'u-r2', name: 'R2', role: 'Regional' },
  },
  R3: {
    password: 'R3',
    user: { id: 'u-r3', name: 'R3', role: 'Regional' },
  },
  R4: {
    password: 'R4',
    user: { id: 'u-r4', name: 'R4', role: 'Regional' },
  },
};

// All routes available in the application
const ALL_ROUTES = [
  '/dashboard',
  '/dashboard-harian',
  '/kalkulator-dsp',
  '/scm-analytic',
  // Legacy routes (redirect)
  '/occupancy',
  '/forecast',
  '/soh-to-analysis',
  '/history-sales',
  '/pr-update',
];

// --- Role-based menu access ---
// Which routes each role can access
export const ROLE_ACCESS: Record<UserRole, string[]> = {
  'Super Admin': ALL_ROUTES,
  DSP: ALL_ROUTES,
  Regional: ALL_ROUTES,
};

// --- Upload permission ---
// Only Super Admin can upload data files
export function canUpload(role: UserRole | undefined): boolean {
  return role === 'Super Admin';
}

export function authenticate(
  username: string,
  password: string
): User | null {
  const entry = USERS_DB[username.toUpperCase()];
  if (!entry) return null;
  if (entry.password !== password) return null;
  return entry.user;
}

export function canAccess(role: UserRole | undefined, path: string): boolean {
  if (!role) return false;
  const allowed = ROLE_ACCESS[role];
  if (!allowed) return false;
  return allowed.some((p) => path.startsWith(p));
}

// --- Zustand store ---
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  login: (userData) => {
    localStorage.setItem('authUser', JSON.stringify(userData));
    set({ user: userData });
  },
  logout: () => {
    localStorage.removeItem('authUser');
    localStorage.removeItem('isAuthenticated');
    set({ user: null });
  },
}));
