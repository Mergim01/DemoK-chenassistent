'use client';

import { useState, useEffect, useRef } from 'react';

interface InventoryItem {
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
    try {
      const res = await fetch('/api/inventory');
      const data = await res.json();
      setInventory(data);
    } catch (error) {
      console.error("Failed to fetch inventory", error);
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
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: transcript }),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setMessage(data.message);
        setInventory(data.inventory);
        setTranscript(""); // Clear after success
      } else {
        setMessage("Fehler: " + data.message);
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
        <h2 className="text-xl font-semibold mb-4 border-b pb-2">Inventar</h2>
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
