import Dexie, { type Table } from 'dexie';

export interface OfflineMenuItem {
  slug: string;
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string | null;
  available: boolean;
}

export interface OfflineSetting {
  slug: string;
  tax_enabled: boolean;
  tax_rate: number;
  currency_symbol: string;
  receipt_footer_text: string;
  enabled_modules?: Record<string, any>;
}

class OfflineDb extends Dexie {
  menuItems!: Table<OfflineMenuItem, [string, string]>;
  settings!: Table<OfflineSetting, string>;

  constructor() {
    super('DastarkhwanOffline');
    this.version(1).stores({
      menuItems: '[slug+id], slug, name, category',
      settings: 'slug',
    });
  }
}

const db = new OfflineDb();

export async function cacheMenuItems(slug: string, items: OfflineMenuItem[]): Promise<void> {
  const tx = db.transaction('rw', db.menuItems, async () => {
    await db.menuItems.where('slug').equals(slug).delete();
    await db.menuItems.bulkAdd(items);
  });
  await tx;
}

export async function getCachedMenuItems(slug: string): Promise<OfflineMenuItem[]> {
  return db.menuItems.where('slug').equals(slug).toArray();
}

export async function cacheSettings(slug: string, setting: OfflineSetting): Promise<void> {
  await db.settings.put(setting);
}

export async function getCachedSettings(slug: string): Promise<OfflineSetting | undefined> {
  return db.settings.get(slug);
}

export default db;
