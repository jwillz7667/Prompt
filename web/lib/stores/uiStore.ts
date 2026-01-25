import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
}

interface UIState {
  // Sidebar
  sidebarOpen: boolean
  sidebarCollapsed: boolean

  // Mobile menu
  mobileMenuOpen: boolean

  // Modals
  activeModal: string | null
  modalData: Record<string, unknown>

  // Toasts
  toasts: Toast[]

  // Loading states
  globalLoading: boolean
  loadingMessage: string | null

  // Actions
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleMobileMenu: () => void
  closeMobileMenu: () => void
  openModal: (modalId: string, data?: Record<string, unknown>) => void
  closeModal: () => void
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
  setGlobalLoading: (loading: boolean, message?: string) => void
}

let toastId = 0

export const useUIStore = create<UIState>((set, get) => ({
  sidebarOpen: true,
  sidebarCollapsed: false,
  mobileMenuOpen: false,
  activeModal: null,
  modalData: {},
  toasts: [],
  globalLoading: false,
  loadingMessage: null,

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),

  toggleMobileMenu: () => set((state) => ({ mobileMenuOpen: !state.mobileMenuOpen })),

  closeMobileMenu: () => set({ mobileMenuOpen: false }),

  openModal: (activeModal, data = {}) => set({ activeModal, modalData: data }),

  closeModal: () => set({ activeModal: null, modalData: {} }),

  addToast: (toast) => {
    const id = `toast-${++toastId}`
    const newToast = { ...toast, id }
    set((state) => ({ toasts: [...state.toasts, newToast] }))

    // Auto-remove after duration
    const duration = toast.duration ?? 5000
    if (duration > 0) {
      setTimeout(() => {
        get().removeToast(id)
      }, duration)
    }
  },

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  setGlobalLoading: (globalLoading, loadingMessage) =>
    set({ globalLoading, loadingMessage: loadingMessage ?? null }),
}))

// Toast helper functions
export const toast = {
  success: (title: string, message?: string) =>
    useUIStore.getState().addToast({ type: 'success', title, message }),
  error: (title: string, message?: string) =>
    useUIStore.getState().addToast({ type: 'error', title, message }),
  info: (title: string, message?: string) =>
    useUIStore.getState().addToast({ type: 'info', title, message }),
  warning: (title: string, message?: string) =>
    useUIStore.getState().addToast({ type: 'warning', title, message }),
}
