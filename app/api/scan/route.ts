import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
});

export async function POST(req: NextRequest) {
  try {
    const { imageBase64 } = await req.json();

    if (!imageBase64) {
      return NextResponse.json({ error: "Missing imageBase64" }, { status: 400 });
    }

    // Убираем Data URI префикс, если он есть
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const prompt = `Ты — ИИ-агент для автоматического распознавания покерного стола (приложение CoinPoker).
У тебя на входе скриншот мобильного телефона.
Найди:
1. "board" - общие карты, которые лежат в центре стола (борд). От 0 до 5 карт.
2. "hand" - карманные карты игрока (героя), которые находятся в самом низу по центру экрана (ровно 2 карты). Обязательно только те, что прямо над ником героя внизу (обычно это часть с зеленым свечением таймера вокруг аватарки или ником).

Выведи результат строго в формате JSON, без выделений markdown, содержащий два массива строк.
Формат написания одной карты: ранг (2, 3, 4, 5, 6, 7, 8, 9, T, J, Q, K, A) + масть (s = пики ♠, h = черви ♥, d = бубны ♦, c = трефы ♣).
Пример: "As", "Kh", "Tc", "2d", "9s".

Пример ответа:
{
  "board": ["Ah", "Kc", "7s", "2d", "9h"],
  "hand": ["8c", "8s"]
}

Если карт на борде еще нет (префлоп), верни пустой массив в "board": [].`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        { text: prompt },
        { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
      ],
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text || "{}";
    const result = JSON.parse(text);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Automation API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
