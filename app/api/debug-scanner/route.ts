import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import Jimp from "jimp";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
  httpOptions: { headers: { "User-Agent": "aistudio-build" } }
});

// Helper for fetching or creating the master calibration config in Firestore
async function getCalibrationConfig() {
  try {
    const docRef = doc(db, "compiled_configuration", "calibration");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as {
        boardRect: { x: number; y: number; w: number; h: number };
        handRect: { x: number; y: number; w: number; h: number };
        hashDict: Record<string, string>;
      };
    }
  } catch (error) {
    console.error("Firestore Calibration Fetch Error:", error);
  }
  return {
    boardRect: { x: 50, y: 550, w: 980, h: 250 },
    handRect: { x: 350, y: 1600, w: 380, h: 250 },
    hashDict: {}
  };
}

// Helper to save calibration config back to Firestore
async function saveCalibrationConfig(config: any) {
  try {
    const docRef = doc(db, "compiled_configuration", "calibration");
    await setDoc(docRef, config);
  } catch (error) {
    console.error("Firestore Calibration Set Error:", error);
  }
}

// Helper to smooth column counts to filter pixel noise
function smoothArray(arr: number[]): number[] {
  const smoothed = [...arr];
  for (let i = 1; i < arr.length - 1; i++) {
    smoothed[i] = Math.max(arr[i - 1], arr[i], arr[i + 1]);
  }
  return smoothed;
}

// Detect individual cards in a vertical band
function detectCardsInBand(image: any, yStart: number, yEnd: number, minCardW: number, maxCardW: number) {
  const width = image.bitmap.width;
  const colWhiteCount = new Array(width).fill(0);

  // 1. Scan column-by-column for white pixel concentration
  for (let x = 0; x < width; x++) {
    let count = 0;
    for (let y = yStart; y < yEnd; y++) {
      const idx = (y * width + x) * 4;
      const r = image.bitmap.data[idx];
      const g = image.bitmap.data[idx + 1];
      const b = image.bitmap.data[idx + 2];
      
      // Card white criteria (handles neutral card face white/light grey perfectly)
      if (r > 190 && g > 190 && b > 190 && Math.abs(r - g) < 20 && Math.abs(g - b) < 20) {
        count++;
      }
    }
    colWhiteCount[x] = count;
  }

  const smoothed = smoothArray(colWhiteCount);
  const threshold = (yEnd - yStart) * 0.15; // At least 15% of band height has white

  // 2. Extract contiguous horizontal spans representing card bodies
  const ranges: { x1: number; x2: number }[] = [];
  let activeStart = -1;
  let gapCount = 0;

  for (let x = 0; x < width; x++) {
    if (smoothed[x] > threshold) {
      if (activeStart === -1) activeStart = x;
      gapCount = 0;
    } else {
      if (activeStart !== -1) {
        gapCount++;
        if (gapCount > Math.max(4, width * 0.01)) { // Gap of >1% screen width ends card
          ranges.push({ x1: activeStart, x2: x - gapCount });
          activeStart = -1;
        }
      }
    }
  }
  if (activeStart !== -1) {
    ranges.push({ x1: activeStart, x2: width - 1 });
  }

  const cards: { x: number; y: number; w: number; h: number }[] = [];
  
  // 3. For each valid span, locate the top and bottom borders cleanly
  for (const r of ranges) {
    const w = r.x2 - r.x1 + 1;
    if (w >= minCardW && w <= maxCardW) {
      
      const rowWhiteCount = new Array(yEnd - yStart).fill(0);
      for (let yOffset = 0; yOffset < (yEnd - yStart); yOffset++) {
        const y = yStart + yOffset;
        let count = 0;
        for (let x = r.x1; x <= r.x2; x++) {
          const idx = (y * width + x) * 4;
          const pr = image.bitmap.data[idx];
          const pg = image.bitmap.data[idx + 1];
          const pb = image.bitmap.data[idx + 2];
          if (pr > 195 && pg > 195 && pb > 195) {
            count++;
          }
        }
        rowWhiteCount[yOffset] = count;
      }

      let y1Offset = -1;
      let y2Offset = -1;
      const rowThreshold = w * 0.15;

      for (let i = 0; i < rowWhiteCount.length; i++) {
        if (rowWhiteCount[i] > rowThreshold) {
          if (y1Offset === -1) y1Offset = i;
          y2Offset = i;
        }
      }

      if (y1Offset !== -1 && y2Offset !== -1 && (y2Offset - y1Offset) > (w * 0.8)) {
        cards.push({
          x: r.x1,
          y: yStart + y1Offset,
          w: w,
          h: y2Offset - y1Offset + 1
        });
      }
    }
  }

  return cards;
}

// 4-Color Poker suit classifier based on prominent colored pixels in card
function detectSuit(image: any, card: { x: number; y: number; w: number; h: number }): string {
  const sx1 = Math.floor(card.x + card.w * 0.1);
  const sx2 = Math.min(image.bitmap.width - 1, Math.floor(card.x + card.w * 0.9));
  const sy1 = Math.floor(card.y + card.h * 0.3);
  const sy2 = Math.min(image.bitmap.height - 1, Math.floor(card.y + card.h * 0.95));

  let red = 0;
  let blue = 0;
  let green = 0;
  let black = 0;

  for (let y = sy1; y <= sy2; y++) {
    for (let x = sx1; x <= sx2; x++) {
      const idx = (y * image.bitmap.width + x) * 4;
      const r = image.bitmap.data[idx];
      const g = image.bitmap.data[idx + 1];
      const b = image.bitmap.data[idx + 2];

      if (r > 195 && g > 195 && b > 195) continue; // Skip white background

      // Determine colors
      if (r > 130 && r > g + 40 && r > b + 40) {
        red++;
      } else if (b > 130 && b > r + 30 && g > r + 20) {
        blue++;
      } else if (g > 110 && g > r + 25 && g > b + 15) {
        green++;
      } else if (r < 90 && g < 90 && b < 90) {
        black++;
      }
    }
  }

  const maxVal = Math.max(red, blue, green, black);
  if (maxVal < 10) return "s"; // Spades is default

  if (maxVal === red) return "h";
  if (maxVal === blue) return "d";
  if (maxVal === green) return "c";
  return "s";
}

// Tight-cropping of Rank Glyphs and scaling to binarized 16x16 grid
async function extractRankGlyph(image: any, card: { x: number; y: number; w: number; h: number }) {
  const rx1 = Math.floor(card.x + card.w * 0.03);
  const rx2 = Math.min(image.bitmap.width - 1, Math.floor(card.x + card.w * 0.48));
  const ry1 = Math.floor(card.y + card.h * 0.02);
  const ry2 = Math.min(image.bitmap.height - 1, Math.floor(card.y + card.h * 0.48));

  let minGlyphX = rx2;
  let maxGlyphX = rx1;
  let minGlyphY = ry2;
  let maxGlyphY = ry1;
  let foundDark = false;

  for (let y = ry1; y <= ry2; y++) {
    for (let x = rx1; x <= rx2; x++) {
      const idx = (y * image.bitmap.width + x) * 4;
      const r = image.bitmap.data[idx];
      const g = image.bitmap.data[idx + 1];
      const b = image.bitmap.data[idx + 2];

      if (r < 185 || g < 185 || b < 185) { // Dark or strongly colored pixels
        if (x < minGlyphX) minGlyphX = x;
        if (x > maxGlyphX) maxGlyphX = x;
        if (y < minGlyphY) minGlyphY = y;
        if (y > maxGlyphY) maxGlyphY = y;
        foundDark = true;
      }
    }
  }

  let cx = rx1;
  let cw = rx2 - rx1;
  let cy = ry1;
  let ch = ry2 - ry1;

  if (foundDark && (maxGlyphX - minGlyphX) > 2 && (maxGlyphY - minGlyphY) > 2) {
    cx = minGlyphX;
    cw = maxGlyphX - minGlyphX + 1;
    cy = minGlyphY;
    ch = maxGlyphY - minGlyphY + 1;
  }

  const croppedImg = image.clone().crop(cx, cy, cw, ch);
  croppedImg.resize(16, 16);

  let darkOnLight = "";
  let lightOnDark = "";

  for (let dy = 0; dy < 16; dy++) {
    for (let dx = 0; dx < 16; dx++) {
      const idx = (dy * 16 + dx) * 4;
      const r = croppedImg.bitmap.data[idx];
      const g = croppedImg.bitmap.data[idx + 1];
      const b = croppedImg.bitmap.data[idx + 2];

      if (r < 180 || g < 180 || b < 180) { // Dark (glyph pixel)
        darkOnLight += "1";
        lightOnDark += "0";
      } else {
        darkOnLight += "0";
        lightOnDark += "1";
      }
    }
  }

  const croppedBase64 = await croppedImg.getBase64Async(Jimp.MIME_JPEG);

  return {
    cropX: cx,
    cropY: cy,
    cropW: cw,
    cropH: ch,
    hashDarkOnLight: darkOnLight,
    hashLightOnDark: lightOnDark,
    croppedBase64
  };
}

export async function GET() {
  const config = await getCalibrationConfig();
  return NextResponse.json(config);
}

export async function POST(req: NextRequest) {
  try {
    const { imageBase64 } = await req.json();
    if (!imageBase64) {
      return NextResponse.json({ error: "Missing imageBase64 screenshot" }, { status: 400 });
    }

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    // 1. Read screenshot
    const image = await Jimp.read(buffer);
    const width = image.bitmap.width;
    const height = image.bitmap.height;

    // 2. Fetch calibration config mapping database from Firestore
    const config = await getCalibrationConfig();

    // 3. Define target search bands vertically (dynamic based on image resolution size)
    const yBoardStart = Math.floor(height * 0.33);
    const yBoardEnd = Math.floor(height * 0.58);
    const yHandStart = Math.floor(height * 0.68);
    const yHandEnd = Math.floor(height * 0.88);

    const minCardW = Math.floor(width * 0.04);
    const maxCardW = Math.floor(width * 0.16);

    // 4. Do segmentation horizontally/vertically inside defined bands
    const localBoardCards = detectCardsInBand(image, yBoardStart, yBoardEnd, minCardW, maxCardW);
    const localHandCards = detectCardsInBand(image, yHandStart, yHandEnd, minCardW, maxCardW);

    // Sort left to right horizontally (crucial for exact 1-to-1 matching)
    localBoardCards.sort((a, b) => a.x - b.x);
    localHandCards.sort((a, b) => a.x - b.x);

    // Update coordinates in calibration setup
    if (localBoardCards.length > 0) {
      const minX = Math.min(...localBoardCards.map(c => c.x));
      const maxX = Math.max(...localBoardCards.map(c => c.x + c.w));
      const minY = Math.min(...localBoardCards.map(c => c.y));
      const maxY = Math.max(...localBoardCards.map(c => c.y + c.h));
      config.boardRect = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    if (localHandCards.length > 0) {
      const minX = Math.min(...localHandCards.map(c => c.x));
      const maxX = Math.max(...localHandCards.map(c => c.x + c.w));
      const minY = Math.min(...localHandCards.map(c => c.y));
      const maxY = Math.max(...localHandCards.map(c => c.y + c.h));
      config.handRect = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }

    // Process all segmented cards to extract binarizations and local traits
    const processedBoard = [];
    const processedHand = [];

    for (const card of localBoardCards) {
      const glyphData = await extractRankGlyph(image, card);
      const suitColor = detectSuit(image, card);
      processedBoard.push({
        rect: card,
        suitColor,
        ...glyphData
      });
    }

    for (const card of localHandCards) {
      const glyphData = await extractRankGlyph(image, card);
      const suitColor = detectSuit(image, card);
      processedHand.push({
        rect: card,
        suitColor,
        ...glyphData
      });
    }

    // 5. Query Gemini Vision secretly in the background to provide absolute ground truth labels
    let geminiBoard: string[] = [];
    let geminiHand: string[] = [];
    let alignedSuccessfully = false;

    // Build perfect label detection prompt
    const geminiPrompt = `
      You are a specialized poker HUD optical recognition calibrator.
      Analyze the provided full vertical mobile portrait screenshot of CoinPoker.
      
      Look inside the vertical middle (board cards) and lower-middle (hero hand cards) of the screen.
      1. Under "board", count and list the visible board/community cards lying in the center side-by-side. List them horizontally from left to right. Max 5 cards. If preflop/empty, return [].
      2. Under "hand", list the hero's private cards lying in the lowest part above the nickname/timer center container. List them horizontally from left to right. There are always exactly 2 cards visible in the hand.
      
      Use standard rank+suit notations: Ranks: 2-9, T, J, Q, K, A. Suits: c (clubs), d (diamonds), h (hearts), s (spades).
      Examples: As (Ace of spades), Qh (Queen of hearts), Td (Ten of diamonds), 2c (Two of clubs), Kh (King of hearts).
      
      Output strictly the valid JSON object with "board" and "hand" fields. No code blocks or text:
      { "board": [...], "hand": [...] }
    `;

    try {
      const geminiRes = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          { text: geminiPrompt },
          { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
        ],
        config: {
          responseMimeType: "application/json"
        }
      });

      const responseText = geminiRes.text || "{}";
      const parsed = JSON.parse(responseText.trim());
      geminiBoard = parsed.board || [];
      geminiHand = parsed.hand || [];

      // 6. Perform automatic correlation and synchronization
      // Board alignment
      if (processedBoard.length === geminiBoard.length && geminiBoard.length > 0) {
        for (let i = 0; i < processedBoard.length; i++) {
          const cardStr = geminiBoard[i];
          const rankChar = cardStr.length === 3 ? "10" : cardStr[0].toUpperCase();
          // Map and record
          config.hashDict[processedBoard[i].hashDarkOnLight] = rankChar;
          config.hashDict[processedBoard[i].hashLightOnDark] = rankChar;
        }
        alignedSuccessfully = true;
      }

      // Hand alignment
      if (processedHand.length === geminiHand.length && geminiHand.length > 0) {
        for (let i = 0; i < processedHand.length; i++) {
          const cardStr = geminiHand[i];
          const rankChar = cardStr.length === 3 ? "10" : cardStr[0].toUpperCase();
          // Map and record
          config.hashDict[processedHand[i].hashDarkOnLight] = rankChar;
          config.hashDict[processedHand[i].hashLightOnDark] = rankChar;
        }
        alignedSuccessfully = true;
      }

      // Save updated configuration variables persistently
      if (alignedSuccessfully) {
        await saveCalibrationConfig(config);
      }

    } catch (gErr) {
      console.error("Gemini Alignment Service Error:", gErr);
    }

    // Return full debug reports to client APK or emulator script
    return NextResponse.json({
      success: true,
      dimensions: { width, height },
      boardRect: config.boardRect,
      handRect: config.handRect,
      detectedInScreenshot: {
        segmentedBoardCount: processedBoard.length,
        segmentedHandCount: processedHand.length,
        geminiBoardVerification: geminiBoard,
        geminiHandVerification: geminiHand,
        alignedSuccessfully
      },
      segmentedBoard: processedBoard.map(c => ({
        rect: c.rect,
        detectedColorSuit: c.suitColor,
        hashDarkOnLight: c.hashDarkOnLight,
        hashLightOnDark: c.hashLightOnDark
      })),
      segmentedHand: processedHand.map(c => ({
        rect: c.rect,
        detectedColorSuit: c.suitColor,
        hashDarkOnLight: c.hashDarkOnLight,
        hashLightOnDark: c.hashLightOnDark
      })),
      totalKnownHashes: Object.keys(config.hashDict).length
    });

  } catch (error: any) {
    console.error("Debugger API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
