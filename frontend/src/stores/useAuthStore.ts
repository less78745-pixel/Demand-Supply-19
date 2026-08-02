import { create } from 'zustand';

export type UserRole = 'Super Admin' | 'Supervisor' | 'Regional';

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
  R1: {
    password: 'DSP19',
    user: { id: 'u-r1', name: 'R1', role: 'Regional' },
  },
  R2: {
    password: 'DSP19',
    user: { id: 'u-r2', name: 'R2', role: 'Regional' },
  },
  R3: {
    password: 'DSP19',
    user: { id: 'u-r3', name: 'R3', role: 'Regional' },
  },
  R4: {
    password: 'DSP19',
    user: { id: 'u-r4', name: 'R4', role: 'Regional' },
  },
  SPV: {
    password: 'DSP19',
    user: { id: 'u-spv', name: 'SPV', role: 'Supervisor' },
  },
};

// --- Role-based menu access ---
// Which routes each role can access
export const ROLE_ACCESS: Record<UserRole, string[]> = {
  'Super Admin': [
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
  ],
  Supervisor: [
    '/dashboard-harian',
    '/kalkulator-dsp/forecast',
    '/kalkulator-dsp/ddmrp',
    '/kalkulator-dsp/ddmrp-phase2',
    // Legacy routes (redirect)
    '/forecast',
    '/soh-to-analysis',
    '/history-sales',
    '/pr-update',
  ],
  Regional: [
    '/dashboard-harian',
    '/kalkulator-dsp/forecast',
    '/kalkulator-dsp/ddmrp',
    '/kalkulator-dsp/ddmrp-phase2',
    // Legacy routes (redirect)
    '/forecast',
    '/soh-to-analysis',
    '/history-sales',
    '/pr-update',
  ],
};

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
