import { create } from "zustand";

type TFilePanelFile = {
  name: string;
  content: string;
  language: string;
};

type TFilePanelState = {
  file: TFilePanelFile | null;
  open: (file: TFilePanelFile) => void;
  reset: () => void;
};

export const useFilePanelStore = create<TFilePanelState>((set) => ({
  file: null,
  open: (file) => set({ file }),
  reset: () => set({ file: null }),
}));
