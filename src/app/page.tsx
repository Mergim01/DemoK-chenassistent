'use client';

import { useState, useEffect, useRef } from 'react';

interface InventoryItem {
  name: string;
  quantity: number;
  unit?: string;
}

// NEW: Transaction interface matching the DB one
interface Transaction {
  id: string;
  timestamp: number;
  type: 'ADD' | 'REMOVE';
  name: string;
  quantity: number;
  unit?: string;
}

export default function Home() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [message, setMessage] = useState("");
  
  // Use a ref to keep track of the recognition instance
  const recognitionRef = useRef<any>(null);

  // NEW: Helper to normalize units (copied from db.ts logic)
  const normalize = (quantity: number, unit?: string): { quantity: number, unit: string } => {
    if (!unit) return { quantity, unit: 'stück' }; 
    const u = unit.toLowerCase().trim();
    if (['kg', 'kilo', 'kilogramm'].includes(u)) return { quantity: quantity * 1000, unit: 'g' };
    if (['g', 'gramm', 'gr'].includes(u)) return { quantity: quantity, unit: 'g' };
    if (['l', 'liter'].includes(u)) return { quantity: quantity * 1000, unit: 'ml' };
    if (['ml', 'milliliter'].includes(u)) return { quantity: quantity, unit: 'ml' };
    return { quantity, unit: u };
  };

  // NEW: Calculate inventory from transactions locally
  const calculateInventory = (transactions: Transaction[]) => {
    const inventoryMap = new Map<string, { quantity: number, unit: string }>();

    for (const tx of transactions) {
      const key = tx.name.toLowerCase();
      if (!inventoryMap.has(key)) {
        inventoryMap.set(key, { quantity: 0, unit: tx.unit || 'stück' });
      }

      const current = inventoryMap.get(key)!;
      
      if (tx.type === 'ADD') {
        if (current.quantity === 0) {
            current.unit = tx.unit || 'stück';
            current.quantity += tx.quantity;
        } else {
            // Simple addition (assuming compatible units for this demo)
            current.quantity += tx.quantity;
        }
      } else if (tx.type === 'REMOVE') {
        current.quantity -= tx.quantity;
      }
    }

    const result: InventoryItem[] = [];
    inventoryMap.forEach((value, key) => {
      if (value.quantity > 0) {
        // Use the capitalized name from the last transaction if possible, else key
        const lastTx = transactions.slice().reverse().find(t => t.name.toLowerCase() === key);
        result.push({
          name: lastTx ? lastTx.name : key,
          quantity: value.quantity,
          unit: value.unit
        });
      }
    });
    return result;
  };

  useEffect(() => {
    fetchInventory();

    // Initialize SpeechRecognition
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false; // Stop after one sentence for this PoC
        recognition.lang = 'de-DE';
        recognition.interimResults = true;

        recognition.onresult = (event: any) => {
          const currentTranscript = Array.from(event.results)
            .map((result: any) => result[0].transcript)
            .join('');
          setTranscript(currentTranscript);
        };

        recognition.onend = () => {
          setIsListening(false);
        };
        
        recognition.onerror = (event: any) => {
          console.error("Speech recognition error", event.error);
          setIsListening(false);
          setMessage("Fehler bei der Spracherkennung: " + event.error);
        };

        recognitionRef.current = recognition;
      } else {
        setMessage("Dein Browser unterstützt keine Spracherkennung.");
      }
    }
  }, []);

  const fetchInventory = async () => {
    // CHANGE: Read from localStorage instead of API
    try {
      const stored = localStorage.getItem('kitchen_transactions');
      if (stored) {
        const transactions: Transaction[] = JSON.parse(stored);
        const calculated = calculateInventory(transactions);
        setInventory(calculated);
      }
    } catch (error) {
      console.error("Failed to load local inventory", error);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      setMessage("");
      setTranscript("");
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const processCommand = async () => {
    if (!transcript) return;
    
    setMessage("Verarbeite...");
    try {
      // CHANGE: Send parseOnly request
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: transcript, parseOnly: true }),
      });
      
      const data = await res.json();
      
      if (res.ok && data.parsed && data.parsed.action !== 'unknown') {
        const parsed = data.parsed;
        
        // NEW: Create and save transaction locally
        const normalized = normalize(parsed.quantity, parsed.unit);
        
        const newTransaction: Transaction = {
          id: Date.now().toString(),
          timestamp: Date.now(),
          type: parsed.action === 'add' ? 'ADD' : 'REMOVE',
          name: parsed.item,
          quantity: normalized.quantity,
          unit: normalized.unit
        };

        // Update Local Storage
        const stored = localStorage.getItem('kitchen_transactions');
        const transactions: Transaction[] = stored ? JSON.parse(stored) : [];
        transactions.push(newTransaction);
        localStorage.setItem('kitchen_transactions', JSON.stringify(transactions));

        // Update UI
        const updatedInventory = calculateInventory(transactions);
        setInventory(updatedInventory);
        
        const actionText = parsed.action === 'add' ? 'hinzugefügt' : 'entfernt';
        setMessage(`Habe ${parsed.quantity} ${parsed.unit ? parsed.unit + ' ' : ''}${parsed.item} ${actionText} (Lokal gespeichert).`);
        setTranscript(""); 

      } else {
        setMessage("Konnte den Befehl nicht verstehen oder Fehler beim Parsen.");
      }
    } catch (error) {
      setMessage("Netzwerkfehler beim Senden des Befehls.");
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center p-8 bg-gray-100 text-gray-800">
      <h1 className="text-4xl font-bold mb-8 text-blue-600">Küchenassistent PoC</h1>
      
      <div className="w-full max-w-md bg-white rounded-xl shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Spracheingabe</h2>
        
        <div className="min-h-[60px] p-4 bg-gray-50 rounded border border-gray-200 mb-4 italic">
          {transcript || "Sage etwas wie 'Füge zwei Äpfel hinzu'..."}
        </div>

        <div className="flex gap-4">
          <button
            onClick={toggleListening}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
              isListening 
                ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse' 
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}
          >
            {isListening ? 'Stop' : 'Sprechen'}
          </button>
          
          <button
            onClick={processCommand}
            disabled={!transcript || isListening}
            className="flex-1 py-3 px-4 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Ausführen
          </button>
        </div>
        
        {message && (
          <div className={`mt-4 p-3 rounded ${message.startsWith("Fehler") ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
            {message}
          </div>
        )}
      </div>

      <div className="w-full max-w-md bg-white rounded-xl shadow-md p-6">
        <div className="flex justify-between items-center mb-4 border-b pb-2">
          <h2 className="text-xl font-semibold">Inventar</h2>
          <button 
            onClick={fetchInventory} 
            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
            title="Inventar aktualisieren"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          </button>
        </div>
        {inventory.length === 0 ? (
          <p className="text-gray-500 text-center py-4">Das Inventar ist leer.</p>
        ) : (
          <ul className="space-y-2">
            {inventory.map((item, index) => (
              // Key needs to be unique but inventory doesn't have IDs anymore (generated on fly)
              // Using name + index as simple key
              <li key={item.name + index} className="flex justify-between items-center p-2 hover:bg-gray-50 rounded">
                <span className="font-medium capitalize">{item.name}</span>
                <span className="bg-blue-100 text-blue-800 py-1 px-3 rounded-full text-sm">
                  {item.quantity} {item.unit}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
