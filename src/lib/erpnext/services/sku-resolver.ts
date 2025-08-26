import crypto from 'crypto';

interface ResolverInput {
  supplierCode?: string;
  name: string;
  brand?: string;
}

interface CatalogEntry {
  itemCode: string;
  supplierCodes: string[];
  name: string;
  brand?: string;
  provisional?: boolean;
  disabled?: boolean;
}

const STORAGE_KEY = 'erpnextCatalogMap';

function normalise(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function similarity(a: string, b: string): number {
  const al = a.length;
  const bl = b.length;
  const dp = Array.from({ length: al + 1 }, () => new Array(bl + 1).fill(0));
  for (let i = 0; i <= al; i++) dp[i][0] = i;
  for (let j = 0; j <= bl; j++) dp[0][j] = j;
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  const distance = dp[al][bl];
  return 1 - distance / Math.max(al, bl, 1);
}

class CatalogMap {
  private entries: CatalogEntry[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        try {
          this.entries = JSON.parse(raw);
        } catch {
          this.entries = [];
        }
      }
    }
  }

  private persist(): void {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries));
    }
  }

  findBySupplier(code: string): CatalogEntry | undefined {
    return this.entries.find(e => e.supplierCodes.includes(code));
  }

  findByName(name: string, brand?: string): CatalogEntry | undefined {
    const target = normalise(`${brand ?? ''} ${name}`);
    let best: { entry: CatalogEntry; score: number } | undefined;
    for (const entry of this.entries) {
      const candidate = normalise(`${entry.brand ?? ''} ${entry.name}`);
      const score = similarity(target, candidate);
      if (score > 0.8 && (!best || score > best.score)) {
        best = { entry, score };
      }
    }
    return best?.entry;
  }

  add(entry: CatalogEntry): void {
    this.entries.push(entry);
    this.persist();
  }

  mapSupplier(code: string, entry: CatalogEntry): void {
    if (!entry.supplierCodes.includes(code)) {
      entry.supplierCodes.push(code);
      this.persist();
    }
  }

  relink(from: string, to: string): void {
    for (const entry of this.entries) {
      if (entry.itemCode === from) entry.itemCode = to;
      entry.supplierCodes = entry.supplierCodes.map(c => (c === from ? to : c));
    }
    this.persist();
  }

  disable(itemCode: string): void {
    const entry = this.entries.find(e => e.itemCode === itemCode);
    if (entry) {
      entry.disabled = true;
      this.persist();
    }
  }
}

const catalog = new CatalogMap();

export async function resolveOrCreateItem(data: ResolverInput): Promise<string> {
  if (data.supplierCode) {
    const bySupplier = catalog.findBySupplier(data.supplierCode);
    if (bySupplier) return bySupplier.itemCode;
  }

  const byName = catalog.findByName(data.name, data.brand);
  if (byName) {
    if (data.supplierCode) catalog.mapSupplier(data.supplierCode, byName);
    return byName.itemCode;
  }

  const now = new Date();
  const yymm = now.toISOString().slice(0, 7).replace('-', '');
  const hash = crypto
    .createHash('md5')
    .update(`${data.supplierCode || ''}|${data.name}|${data.brand || ''}|${now.getTime()}`)
    .digest('hex')
    .slice(0, 6);
  const itemCode = `TMP-${yymm}-${hash}`;
  const entry: CatalogEntry = {
    itemCode,
    supplierCodes: data.supplierCode ? [data.supplierCode] : [],
    name: data.name,
    brand: data.brand,
    provisional: true,
  };
  catalog.add(entry);
  return itemCode;
}

export function mergeItems(from: string, to: string): void {
  catalog.relink(from, to);
  catalog.disable(from);
}

export { CatalogMap, catalog as CatalogMapInstance };

