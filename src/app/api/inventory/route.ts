import { NextResponse } from 'next/server';
import { getInventory, addTransaction } from '@/lib/db';
import { parseCommand } from '@/lib/parser';

export async function GET() {
  const items = await getInventory();
  return NextResponse.json(items);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    if (body.command) {
      const parsed = await parseCommand(body.command);
      let message = "";

      if ((parsed.action === 'add' || parsed.action === 'remove') && parsed.item && parsed.quantity) {
        const type = parsed.action === 'add' ? 'ADD' : 'REMOVE';
        const actionText = parsed.action === 'add' ? 'hinzugefügt' : 'entfernt';
        
        await addTransaction(type, parsed.item, parsed.quantity, parsed.unit);
        message = `Habe ${parsed.quantity} ${parsed.unit ? parsed.unit + ' ' : ''}${parsed.item} ${actionText}.`;
      } 
      else {
         return NextResponse.json({ message: "Konnte den Befehl nicht verstehen.", parsed }, { status: 400 });
      }

      // Nach der Transaktion den neuen aggregierten Stand holen
      const updatedInventory = await getInventory();

      return NextResponse.json({ 
        message,
        inventory: updatedInventory,
        parsed
      });
    }
    
    return NextResponse.json({ message: "Kein Befehl empfangen." }, { status: 400 });
    
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ message: "Interner Serverfehler" }, { status: 500 });
  }
}
