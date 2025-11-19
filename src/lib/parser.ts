import { GoogleGenAI } from "@google/genai";

export interface ParsedCommand {
  action: 'add' | 'remove' | 'unknown';
  item?: string;
  quantity?: number;
  unit?: string;
}

// Initialisiere den Client außerhalb der Funktion für Performance
const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY || '' });

export async function parseCommand(text: string): Promise<ParsedCommand> {
  if (!process.env.GOOGLE_API_KEY) {
    console.error("GOOGLE_API_KEY is missing in .env");
    return { action: 'unknown' };
  }

  try {
    const modelId = process.env.GEMINI_MODEL || "gemini-1.5-flash";
    
    const prompt = `
      Du bist ein Assistent für eine Küchen-Inventar-App.
      Analysiere den folgenden Sprachbefehl und extrahiere die Aktion, den Artikel, die Menge und die Einheit.
      
      Befehl: "${text}"
      
      REGELN:
      - "Füge hinzu", "Packe ein", "Haben wir gekauft" -> action: "add"
      - "Entferne", "Lösche", "Verbraucht", "Haben wir gegessen", "Nimm raus" -> action: "remove"
      - Menge: Immer als Zahl (number). "ein", "eine" -> 1.
      - Einheit: Extrahiere Einheiten wie "Liter", "Gramm", "Stück", "Packung", "kg", "ml". Wenn keine genannt, null/undefined.
      
      Antworte NUR mit einem JSON-Objekt in folgendem Format:
      {
        "action": "add", // oder "remove" oder "unknown"
        "item": "Name des Artikels (z.B. Äpfel, Milch)",
        "quantity": 1, 
        "unit": "kg" 
      }
    `;

    const result = await genAI.models.generateContent({
      model: modelId,
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      config: { responseMimeType: "application/json" },
    });

    const responseText = result.text ? result.text.replace(/```json/g, '').replace(/```/g, '').trim() : "";
    
    if (!responseText) return { action: 'unknown' };

    const parsedData = JSON.parse(responseText);
    
    return {
      action: ['add', 'remove'].includes(parsedData.action) ? parsedData.action : 'unknown',
      item: parsedData.item,
      quantity: typeof parsedData.quantity === 'number' ? parsedData.quantity : 1,
      unit: parsedData.unit || undefined
    };

  } catch (error) {
    console.error("Gemini Parsing Error:", error);
    return { action: 'unknown' };
  }
}
