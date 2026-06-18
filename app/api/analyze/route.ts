import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

export async function POST(req: NextRequest) {
  try {
    const { holeCards, communityCards, potSize, playerStats } = await req.json();

    const prompt = `
      You are an expert Poker AI Strategist. 
      Analyze the current game state and provide recommendations.
      
      Your Hand: ${holeCards.map((c: any) => c.rank + c.suit).join(', ')}
      Community: ${communityCards.map((c: any) => c.rank + c.suit).join(', ')}
      Pot Size: ${potSize}
      Player Stats: VPIP: ${playerStats.vpip}, PFR: ${playerStats.pfr}
      
      Provide a concise 3-bullet point strategy:
      1. Overall Hand Strength & Probability
      2. Recommended Move (Fold, Call, Raise)
      3. Psychological Edge or Risk Factor
      
      Keep it professional, high-stakes tone, and scientific.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });

    return NextResponse.json({ text: response.text });
  } catch (error) {
    console.error("AI Analysis Error:", error);
    return NextResponse.json({ error: "Failed to analyze hand" }, { status: 500 });
  }
}
