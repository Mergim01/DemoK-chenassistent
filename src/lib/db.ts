import fs from 'fs/promises';
import path from 'path';
import { put, list } from '@vercel/blob';
import { sql } from '@vercel/postgres';

export interface Transaction {
  id: string;
  timestamp: number;
  type: 'ADD' | 'REMOVE';
  name: string;
  quantity: number;
  unit?: string;
}

export interface InventoryItem {
  name: string;
  quantity: number;
  unit: string;
}

const normalize = (quantity: number, unit?: string): { quantity: number, unit: string } => {
  if (!unit) return { quantity, unit: 'stück' }; 
  const u = unit.toLowerCase().trim();
  if (['kg', 'kilo', 'kilogramm'].includes(u)) return { quantity: quantity * 1000, unit: 'g' };
  if (['g', 'gramm', 'gr'].includes(u)) return { quantity: quantity, unit: 'g' };
  if (['l', 'liter'].includes(u)) return { quantity: quantity * 1000, unit: 'ml' };
  if (['ml', 'milliliter'].includes(u)) return { quantity: quantity, unit: 'ml' };
  return { quantity, unit: u };
};

// --- POSTGRES IMPLEMENTATION ---

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      timestamp BIGINT,
      type TEXT,
      name TEXT,
      quantity DOUBLE PRECISION,
      unit TEXT
    );
  `;
}

const getTransactionsPG = async (): Promise<Transaction[]> => {
  try {
    const { rows } = await sql`SELECT * FROM transactions ORDER BY timestamp ASC`;
    return rows.map((row: any) => ({
      id: row.id,
      timestamp: Number(row.timestamp),
      type: row.type as 'ADD' | 'REMOVE',
      name: row.name,
      quantity: Number(row.quantity),
      unit: row.unit || undefined
    }));
  } catch (error: any) {
    if (error.message && (error.message.includes('does not exist') || error.code === '42P01')) {
      console.log("Table does not exist, creating...");
      await ensureTable();
      return [];
    }
    console.error("Error reading transactions (PG):", error);
    return [];
  }
};

const addTransactionPG = async (transaction: Transaction): Promise<void> => {
  try {
    await sql`
      INSERT INTO transactions (id, timestamp, type, name, quantity, unit)
      VALUES (${transaction.id}, ${transaction.timestamp}, ${transaction.type}, ${transaction.name}, ${transaction.quantity}, ${transaction.unit})
    `;
  } catch (error: any) {
     if (error.message && (error.message.includes('does not exist') || error.code === '42P01')) {
        await ensureTable();
        await sql`
          INSERT INTO transactions (id, timestamp, type, name, quantity, unit)
          VALUES (${transaction.id}, ${transaction.timestamp}, ${transaction.type}, ${transaction.name}, ${transaction.quantity}, ${transaction.unit})
        `;
     } else {
        throw error;
     }
  }
};

// --- BLOB STORAGE IMPLEMENTATION ---
const BLOB_URL = process.env.BLOB_JSON_URL; // URL to the transactions.json in blob storage
const BLOB_FILE_NAME = 'transactions.json';

const getTransactionsBlob = async (): Promise<Transaction[]> => {
  try {
    // If we have a direct URL, fetch it
    if (BLOB_URL) {
      const response = await fetch(BLOB_URL, { cache: 'no-store' });
      if (!response.ok) {
        if (response.status === 404) return [];
        throw new Error(`Failed to fetch blob: ${response.statusText}`);
      }
      return await response.json();
    } 
    
    // Otherwise list to find it (slower)
    const { blobs } = await list({ prefix: BLOB_FILE_NAME, limit: 1 });
    if (blobs.length > 0) {
       const response = await fetch(blobs[0].url, { cache: 'no-store' });
       return await response.json();
    }
    
    return [];
  } catch (error) {
    console.error("Error reading transactions (Blob):", error);
    return [];
  }
};

const addTransactionBlob = async (transaction: Transaction): Promise<void> => {
  try {
    const transactions = await getTransactionsBlob();
    transactions.push(transaction);
    
    // Overwrite the file in Blob storage
    await put(BLOB_FILE_NAME, JSON.stringify(transactions, null, 2), { 
      access: 'public',
      addRandomSuffix: false // Important to keep the same filename
    });
  } catch (error) {
    console.error("Error saving transaction (Blob):", error);
    throw error;
  }
};


// --- LOCAL FILE IMPLEMENTATION ---

const DATA_FILE = path.join(process.cwd(), 'data', 'transactions.json');

async function ensureDataFile() {
  try {
    await fs.access(DATA_FILE);
  } catch {
    const dir = path.dirname(DATA_FILE);
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
    await fs.writeFile(DATA_FILE, '[]', 'utf-8');
  }
}

const getTransactionsLocal = async (): Promise<Transaction[]> => {
  try {
    await ensureDataFile();
    const data = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading transactions (Local):", error);
    return [];
  }
};

const addTransactionLocal = async (transaction: Transaction): Promise<void> => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error("Cannot write to local file in production. Please configure Postgres or Blob Storage.");
  }

  try {
    const transactions = await getTransactionsLocal();
    transactions.push(transaction);
    await fs.writeFile(DATA_FILE, JSON.stringify(transactions, null, 2), 'utf-8');
  } catch (error) {
    console.error("Error saving transaction (Local):", error);
    throw error;
  }
};

// --- MAIN EXPORTS ---

const USE_POSTGRES = !!process.env.POSTGRES_URL;
const USE_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;

export const getTransactions = async (): Promise<Transaction[]> => {
  if (USE_POSTGRES) {
    return getTransactionsPG();
  } else if (USE_BLOB) {
    return getTransactionsBlob();
  } else {
    if (process.env.NODE_ENV === 'production') {
       console.warn("Running in production without database connection. Returning empty inventory.");
       return [];
    }
    return getTransactionsLocal();
  }
};

export const addTransaction = async (type: 'ADD' | 'REMOVE', name: string, quantity: number, unit?: string): Promise<Transaction> => {
  const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
  const timestamp = Date.now();

  const normalized = normalize(quantity, unit);
  const finalQuantity = normalized.quantity;
  const finalUnit = normalized.unit;

  const newTransaction: Transaction = {
    id,
    timestamp,
    type,
    name,
    quantity: finalQuantity, 
    unit: finalUnit
  };

  if (USE_POSTGRES) {
    await addTransactionPG(newTransaction);
  } else if (USE_BLOB) {
    await addTransactionBlob(newTransaction);
  } else {
    await addTransactionLocal(newTransaction);
  }

  return newTransaction;
};

export const getInventory = async (): Promise<InventoryItem[]> => {
  const transactions = await getTransactions();
  const inventoryMap = new Map<string, { quantity: number, unit: string }>();

  for (const tx of transactions) {
    const key = tx.name.toLowerCase();
    
    if (!inventoryMap.has(key)) {
      inventoryMap.set(key, { quantity: 0, unit: tx.unit || 'stück' });
    }

    const current = inventoryMap.get(key)!;
    
    if (tx.type === 'ADD') {
      if (current.quantity === 0) {
          current.unit = tx.unit!;
          current.quantity += tx.quantity;
      } else if (current.unit === tx.unit) {
          current.quantity += tx.quantity;
      } else {
          current.quantity += tx.quantity;
      }
    } else if (tx.type === 'REMOVE') {
      if (current.unit === tx.unit) {
        current.quantity -= tx.quantity;
      } else {
        // Logic for unit mismatches
      }
    }
  }

  const result: InventoryItem[] = [];
  inventoryMap.forEach((value, key) => {
    if (value.quantity > 0) {
      const lastTx = transactions.slice().reverse().find(t => t.name.toLowerCase() === key);
      const displayName = lastTx ? lastTx.name : key;

      result.push({
        name: displayName,
        quantity: value.quantity,
        unit: value.unit
      });
    }
  });

  return result;
};
