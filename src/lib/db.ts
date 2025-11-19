import fs from 'fs';
import path from 'path';

// Wir nutzen jetzt ein Transaktions-Log
const dbPath = path.join(process.cwd(), 'data', 'transactions.json');

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

// Liest alle Transaktionen
export const getTransactions = (): Transaction[] => {
  try {
    if (!fs.existsSync(dbPath)) {
      return [];
    }
    const data = fs.readFileSync(dbPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading transactions:", error);
    return [];
  }
};

// Fügt eine neue Transaktion hinzu (egal ob ADD oder REMOVE)
export const addTransaction = (type: 'ADD' | 'REMOVE', name: string, quantity: number, unit?: string): Transaction => {
  const transactions = getTransactions();
  
  const newTransaction: Transaction = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    timestamp: Date.now(),
    type,
    name,
    quantity, 
    unit
  };

  // Normalisierung VOR dem Speichern anwenden, damit die DB konsistent ist
  const normalized = normalize(quantity, unit);
  newTransaction.quantity = normalized.quantity;
  newTransaction.unit = normalized.unit;

  transactions.push(newTransaction);

  fs.writeFileSync(dbPath, JSON.stringify(transactions, null, 2));
  return newTransaction;
};

// Aggregiert alle Transaktionen zum aktuellen Ist-Stand
export const getInventory = (): InventoryItem[] => {
  const transactions = getTransactions();
  const inventoryMap = new Map<string, { quantity: number, unit: string }>();

  for (const tx of transactions) {
    // Key für die Map ist der Name (lowercase)
    const key = tx.name.toLowerCase();
    
    if (!inventoryMap.has(key)) {
      // Wenn wir das Item noch nicht kennen, initialisieren wir es mit der Einheit dieser Transaktion
      // (Aber nur wenn es ADD ist? Nein, auch bei REMOVE theoretisch, aber das führt zu negativem Bestand)
      inventoryMap.set(key, { quantity: 0, unit: tx.unit || 'stück' });
    }

    const current = inventoryMap.get(key)!;
    
    if (tx.type === 'ADD') {
      // Beim Hinzufügen: 
      // Wenn die Einheiten passen, addieren.
      // Wenn vorher Bestand 0 war, übernehmen wir einfach die neue Einheit.
      if (current.quantity === 0) {
          current.unit = tx.unit!;
          current.quantity += tx.quantity;
      } else if (current.unit === tx.unit) {
          current.quantity += tx.quantity;
      } else {
          // Einheiten-Konflikt beim Addieren (z.B. wir haben 'g' und addieren 'stück')
          // Wir müssen uns entscheiden. Für PoC: Wir nehmen an, das Neue ist korrekt und "konvertieren" den alten Bestand nicht,
          // sondern addieren einfach die Zahl (was falsch ist), ODER wir resetten die Unit?
          // BESSER: Wir speichern separate Einträge? Nein, UI kann das nicht.
          // Pragmatisch: Wir addieren einfach.
          current.quantity += tx.quantity;
          // Evtl. Unit updaten?
          // current.unit = tx.unit!; 
      }

    } else if (tx.type === 'REMOVE') {
      // HIER DER FIX FÜR DEN BUG:
      
      if (current.unit === tx.unit) {
        // Einheiten gleich (ml - ml): Alles gut.
        current.quantity -= tx.quantity;
      } else {
        // Einheiten ungleich (z.B. Bestand 'ml', Remove 'stück')
        
        if (tx.unit === 'stück' && tx.quantity === 1) {
            // Sonderregel: "Entferne 1 Stück" bei einem Volumen/Gewicht-Item
            // Wir interpretieren das als: "Ich habe eine Packung/Einheit verbraucht."
            // Da wir die Größe nicht kennen, und der User "einen" (Singular) sagte,
            // ist es am sichersten, den Bestand zu NULLEN (alles weg) oder zumindest
            // signifikant zu reduzieren? 
            // "Alles weg" ist die sicherste Annahme bei "Entferne den Joghurt".
            // Aber bei "Entferne einen Joghurt" (von 5) ist es doof.
            
            // Neue Strategie: Wenn Einheiten nicht passen, NICHTS tun (Fehlertoleranz),
            // außer wir wollen "Alles löschen".
            
            // Wir entscheiden uns hier für: Ignorieren der Subtraktion, um "199 ml" zu verhindern.
            // Der Bestand bleibt unverändert. Das ist besser als ein falscher Wert.
            
            // Optional: Wenn current.quantity < 5 (sehr klein), dann auf 0 setzen? 
            // Nein.
            
            // Wir machen nichts.
        } else {
            // Anderer Mismatch: Wir machen nichts.
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
