import fs from 'fs/promises';
import path from 'path';

export interface Transaction {
  id: string;
  timestamp: number;
  type: 'ADD' | 'REMOVE';
  name: string;
  quantity: number; // Immer in Basiseinheit oder Rohwert
  unit?: string;    // Die Einheit der Transaktion (z.B. 'liter')
}

// Das Ergebnis für das Frontend (aggregierter Zustand)
export interface InventoryItem {
  name: string;
  quantity: number;
  unit: string;
}

// Helper zur Normalisierung von Einheiten (wiederverwendet)
const normalize = (quantity: number, unit?: string): { quantity: number, unit: string } => {
  if (!unit) return { quantity, unit: 'stück' }; 

  const u = unit.toLowerCase().trim();

  // Gewicht
  if (['kg', 'kilo', 'kilogramm'].includes(u)) return { quantity: quantity * 1000, unit: 'g' };
  if (['g', 'gramm', 'gr'].includes(u)) return { quantity: quantity, unit: 'g' };
  
  // Volumen
  if (['l', 'liter'].includes(u)) return { quantity: quantity * 1000, unit: 'ml' };
  if (['ml', 'milliliter'].includes(u)) return { quantity: quantity, unit: 'ml' };

  return { quantity, unit: u };
};

const DATA_FILE = path.join(process.cwd(), 'data', 'transactions.json');

// Helper function to ensure data directory and file exist
async function ensureDataFile() {
  try {
    await fs.access(DATA_FILE);
  } catch {
    // File doesn't exist, verify directory
    const dir = path.dirname(DATA_FILE);
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
    // Create empty array file
    await fs.writeFile(DATA_FILE, '[]', 'utf-8');
  }
}

// Liest alle Transaktionen
export const getTransactions = async (): Promise<Transaction[]> => {
  try {
    await ensureDataFile();
    const data = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading transactions:", error);
    return [];
  }
};

// Fügt eine neue Transaktion hinzu (egal ob ADD oder REMOVE)
export const addTransaction = async (type: 'ADD' | 'REMOVE', name: string, quantity: number, unit?: string): Promise<Transaction> => {
  const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
  const timestamp = Date.now();

  // Normalisierung VOR dem Speichern anwenden, damit die DB konsistent ist
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

  try {
    const transactions = await getTransactions();
    transactions.push(newTransaction);
    await fs.writeFile(DATA_FILE, JSON.stringify(transactions, null, 2), 'utf-8');
  } catch (error) {
    console.error("Error saving transaction:", error);
    throw error;
  }

  return newTransaction;
};

// Aggregiert alle Transaktionen zum aktuellen Ist-Stand
export const getInventory = async (): Promise<InventoryItem[]> => {
  const transactions = await getTransactions();
  const inventoryMap = new Map<string, { quantity: number, unit: string }>();

  for (const tx of transactions) {
    // Key für die Map ist der Name (lowercase)
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
        if (tx.unit === 'stück' && tx.quantity === 1) {
             // Ignore specific mismatches logic preserved from original
        }
      }
    }
  }

  // Map in Array umwandeln und leere/negative Items filtern
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
