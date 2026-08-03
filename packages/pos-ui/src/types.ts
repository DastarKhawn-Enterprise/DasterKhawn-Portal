export type { ThemeConfig } from '@sat-sys/ui';

export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string | null;
  available: boolean | null;
}

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}
