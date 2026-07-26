import { create } from 'zustand';

export type UserRole = 'Super Admin' | 'Admin Cabang' | 'Staff Cabang';

interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  branch_id: string | null;
}

interface AuthState {
  user: User | null;
  activeBranchId: string | null; // Used primarily by Super Admin via Branch Selector
  login: (userData: User) => void;
  logout: () => void;
  setActiveBranch: (branchId: string | null) => void;
}

// Mock User Data for demonstration
export const MOCK_USER: User = {
  id: 'u1',
  name: 'AFIF',
  email: 'admin@wms.com',
  role: 'Super Admin',
  branch_id: null,
};

export const useAuthStore = create<AuthState>((set) => ({
  user: MOCK_USER, // Automatically logged in as Super Admin for mock
  activeBranchId: 'B-JKT-01', // Default selected branch
  login: (userData) => set({ user: userData }),
  logout: () => set({ user: null, activeBranchId: null }),
  setActiveBranch: (branchId) => set({ activeBranchId: branchId }),
}));
