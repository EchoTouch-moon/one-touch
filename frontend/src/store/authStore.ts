import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import * as authApi from '../api/auth';
import {
  bumpAuthSessionEpoch,
  getCurrentAuthToken,
  replaceCurrentAuthToken,
  setCurrentAuthToken,
} from '../api/authSession';

interface AuthState {
  token: string | null;
  username: string | null;
  role: string | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  sendRegistrationCode: (email: string) => Promise<{ ok: boolean; message: string }>;
  register: (email: string, password: string, verificationCode: string) => Promise<{ ok: boolean; message: string }>;
  sendPasswordResetCode: (email: string) => Promise<{ ok: boolean; message: string }>;
  resetPassword: (email: string, password: string, verificationCode: string) => Promise<{ ok: boolean; message: string }>;
  clearError: () => void;
  logout: () => void;
  init: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      username: null,
      role: null,
      loading: false,
      initialized: false,
      error: null,

      login: async (username: string, password: string) => {
        set({ loading: true, error: null });
        try {
          const res = await authApi.login(username, password);
          set({
            token: res.token,
            username: res.username,
            role: res.role,
            loading: false,
            initialized: true,
          });
          replaceCurrentAuthToken(res.token);
          return true;
        } catch {
          set({ loading: false, error: 'Invalid email or password' });
          return false;
        }
      },

      sendRegistrationCode: async (email: string) => {
        set({ loading: true, error: null });
        try {
          const res = await authApi.sendRegistrationCode(email);
          set({ loading: false });
          return { ok: res.sent, message: res.message };
        } catch (error) {
          let message = 'Failed to send verification code';
          if (authApi.isAuthApiError(error)) {
            message = authApi.getAuthApiMessage(error, message);
          }
          set({ loading: false, error: message });
          return { ok: false, message };
        }
      },

      register: async (email: string, password: string, verificationCode: string) => {
        set({ loading: true, error: null });
        try {
          const res = await authApi.register({
            email,
            password,
            verification_code: verificationCode,
          });
          set({ loading: false });
          return { ok: res.accepted, message: res.message };
        } catch (error) {
          let message = 'Registration is not available yet';
          if (authApi.isAuthApiError(error)) {
            message = authApi.getAuthApiMessage(error, message);
          }
          set({ loading: false, error: message });
          return { ok: false, message };
        }
      },

      sendPasswordResetCode: async (email: string) => {
        set({ loading: true, error: null });
        try {
          const res = await authApi.sendPasswordResetCode(email);
          set({ loading: false });
          return { ok: res.sent, message: res.message };
        } catch (error) {
          let message = 'Failed to send verification code';
          if (authApi.isAuthApiError(error)) {
            message = authApi.getAuthApiMessage(error, message);
          }
          set({ loading: false, error: message });
          return { ok: false, message };
        }
      },

      resetPassword: async (email: string, password: string, verificationCode: string) => {
        set({ loading: true, error: null });
        try {
          const res = await authApi.resetPassword({
            email,
            password,
            verification_code: verificationCode,
          });
          set({ loading: false });
          return { ok: res.accepted, message: res.message };
        } catch (error) {
          let message = 'Password reset failed';
          if (authApi.isAuthApiError(error)) {
            message = authApi.getAuthApiMessage(error, message);
          }
          set({ loading: false, error: message });
          return { ok: false, message };
        }
      },

      clearError: () => set({ error: null }),

      logout: () => {
        bumpAuthSessionEpoch();
        setCurrentAuthToken(null);
        set({
          token: null,
          username: null,
          role: null,
          loading: false,
          initialized: true,
          error: null,
        });
      },

      init: async () => {
        const token = get().token;
        if (get().initialized && getCurrentAuthToken() === token) return;
        if (!token) {
          setCurrentAuthToken(null);
          set({ initialized: true });
          return;
        }

        replaceCurrentAuthToken(token);
        set({ loading: true, error: null });
        try {
          const res = await authApi.getAuthStatus();
          if (!res.authenticated) {
            set({
              token: null,
              username: null,
              role: null,
              loading: false,
              initialized: true,
            });
            setCurrentAuthToken(null);
            return;
          }
          set({
            username: res.username,
            role: res.role,
            loading: false,
            initialized: true,
          });
          setCurrentAuthToken(token);
        } catch {
          set({
            token: null,
            username: null,
            role: null,
            loading: false,
            initialized: true,
          });
          setCurrentAuthToken(null);
        }
      },
    }),
    {
      name: 'glm-words-auth',
      partialize: (state) => ({
        token: state.token,
        username: state.username,
        role: state.role,
      }),
    },
  ),
);

window.addEventListener('glm-words-auth-expired', () => {
  useAuthStore.getState().logout();
});
