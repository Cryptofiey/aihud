"use client";

import React, { useState, useRef, useEffect } from "react";
import { doc, setDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { 
  Cpu, 
  Upload, 
  Sliders, 
  RefreshCw, 
  CheckCircle2, 
  Trash2
} from "lucide-react";

type Rect = { x: number; y: number; w: number; h: number };

export default function CalibratorPage() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [naturalWidth, setNaturalWidth] = useState<number>(1080);
  const [naturalHeight, setNaturalHeight] = useState<number>(2400);
  const [containerWidth, setContainerWidth] = useState<number>(1);
  const [containerHeight, setContainerHeight] = useState<number>(1);

  const [boardRect, setBoardRect] = useState<Rect>({ x: 100, y: 900, w: 880, h: 250 });
  const [handRect, setHandRect] = useState<Rect>({ x: 350, y: 1500, w: 380, h: 250 });
  const [hashDict, setHashDict] = useState<Record<string, string>>({});

  const [isProcessing, setIsProcessing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [ocrResults, setOcrResults] = useState<any | null>(null);

  // Mutable refs to prevent stale closure delays in event listeners
  const boardRectRef = useRef(boardRect);
  const handRectRef = useRef(handRect);
  const hashDictRef = useRef(hashDict);
  const hasLoadedFromFirestore = useRef(false);

  useEffect(() => {
    boardRectRef.current = boardRect;
  }, [boardRect]);

  useEffect(() => {
    handRectRef.current = handRect;
  }, [handRect]);

  useEffect(() => {
    hashDictRef.current = hashDict;
  }, [hashDict]);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Scale of actual image pixels to displayed CSS container pixels
  const scale = naturalWidth / (containerWidth || 1);

  // Load master calibration details from Firestore
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "compiled_configuration", "calibration"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.boardRect) {
          setBoardRect(data.boardRect);
          boardRectRef.current = data.boardRect;
        }
        if (data.handRect) {
          setHandRect(data.handRect);
          handRectRef.current = data.handRect;
        }
        if (data.hashDict) {
          setHashDict(data.hashDict);
          hashDictRef.current = data.hashDict;
        }
        hasLoadedFromFirestore.current = true;
      }
    });
    return () => unsub();
  }, []);

  // Update container size on window resize or image reload
  const updateContainerDimensions = () => {
    if (imageRef.current) {
      setContainerWidth(imageRef.current.clientWidth);
      setContainerHeight(imageRef.current.clientHeight);
    }
  };

  useEffect(() => {
    window.addEventListener("resize", updateContainerDimensions);
    return () => window.removeEventListener("resize", updateContainerDimensions);
  }, []);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    setNaturalWidth(nw);
    setNaturalHeight(nh);

    setContainerWidth(img.clientWidth);
    setContainerHeight(img.clientHeight);

    // ONLY initialize default coordinates if they have NOT been loaded from Firestore yet
    if (!hasLoadedFromFirestore.current) {
      const defaultBoard = {
        x: Math.floor(nw * 0.05),
        y: Math.floor(nh * 0.35),
        w: Math.floor(nw * 0.9),
        h: Math.floor(nh * 0.16)
      };
      const defaultHand = {
        x: Math.floor(nw * 0.25),
        y: Math.floor(nh * 0.70),
        w: Math.floor(nw * 0.5),
        h: Math.floor(nh * 0.16)
      };
      setBoardRect(defaultBoard);
      boardRectRef.current = defaultBoard;
      setHandRect(defaultHand);
      handRectRef.current = defaultHand;
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setImageSrc(url);
    }
  };

  const saveCoordinatesToFirestore = async (latestBoard: Rect, latestHand: Rect) => {
    try {
      await setDoc(doc(db, "compiled_configuration", "calibration"), {
        boardRect: latestBoard,
        handRect: latestHand,
        hashDict
      }, { merge: true });
    } catch (e) {
      console.error("Automatic Firestore Sync Error:", e);
    }
  };

  // Run the OCR and layout synchronization API on the server
  const handleProcessScreenshot = async () => {
    if (!imageSrc) return;
    setIsProcessing(true);
    setOcrResults(null);

    try {
      const resBlob = await fetch(imageSrc);
      const blob = await resBlob.blob();
      const reader = new FileReader();
      
      const base64Str = await new Promise<string>((resolve) => {
        reader.onloadend = () => {
          resolve(reader.result as string);
        };
        reader.readAsDataURL(blob);
      });

      // Update Firestore with precise bounds so the server scans correctly
      await setDoc(doc(db, "compiled_configuration", "calibration"), {
        boardRect,
        handRect,
        hashDict
      }, { merge: true });

      // Trigger backend server-side segmentation & alignment
      const response = await fetch("/api/debug-scanner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64Str })
      });
      const data = await response.json();
      setOcrResults(data);

      if (data.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error("Failed to run OCR calibration pipeline:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Drag and resize handler utilizing high-performance, lag-free synchronous pointer tracking
  const startDragOrResize = (
    e: React.PointerEvent<HTMLDivElement>,
    boxType: "board" | "hand",
    action: "move" | "resize",
    handle: "TL" | "TR" | "BL" | "BR" | null = null
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const imgEl = imageRef.current;
    if (!imgEl) return;

    // Retrieve active exact screen-to-matrix scale factor at point of click
    const activeScale = imgEl.naturalWidth / imgEl.clientWidth;
    const startX = e.clientX;
    const startY = e.clientY;
    const startRect = boxType === "board" ? { ...boardRectRef.current } : { ...handRectRef.current };

    const handlePointerMove = (moveEvt: PointerEvent) => {
      moveEvt.preventDefault();
      
      const deltaX = (moveEvt.clientX - startX) * activeScale;
      const deltaY = (moveEvt.clientY - startY) * activeScale;

      let updated = { ...startRect };

      if (action === "move") {
        updated.x = Math.max(0, Math.min(imgEl.naturalWidth - updated.w, Math.floor(startRect.x + deltaX)));
        updated.y = Math.max(0, Math.min(imgEl.naturalHeight - updated.h, Math.floor(startRect.y + deltaY)));
      } else if (action === "resize" && handle) {
        const minDim = 30;

        if (handle === "TL") {
          const newX = Math.max(0, Math.min(startRect.x + startRect.w - minDim, startRect.x + deltaX));
          const newW = startRect.w - (newX - startRect.x);
          const newY = Math.max(0, Math.min(startRect.y + startRect.h - minDim, startRect.y + deltaY));
          const newH = startRect.h - (newY - startRect.y);
          updated = { x: Math.floor(newX), y: Math.floor(newY), w: Math.floor(newW), h: Math.floor(newH) };
        } else if (handle === "TR") {
          const newW = Math.max(minDim, Math.min(imgEl.naturalWidth - startRect.x, startRect.w + deltaX));
          const newY = Math.max(0, Math.min(startRect.y + startRect.h - minDim, startRect.y + deltaY));
          const newH = startRect.h - (newY - startRect.y);
          updated = { x: startRect.x, y: Math.floor(newY), w: Math.floor(newW), h: Math.floor(newH) };
        } else if (handle === "BL") {
          const newX = Math.max(0, Math.min(startRect.x + startRect.w - minDim, startRect.x + deltaX));
          const newW = startRect.w - (newX - startRect.x);
          const newH = Math.max(minDim, Math.min(imgEl.naturalHeight - startRect.y, startRect.h + deltaY));
          updated = { x: Math.floor(newX), y: startRect.y, w: Math.floor(newW), h: Math.floor(newH) };
        } else if (handle === "BR") {
          const newW = Math.max(minDim, Math.min(imgEl.naturalWidth - startRect.x, startRect.w + deltaX));
          const newH = Math.max(minDim, Math.min(imgEl.naturalHeight - startRect.y, startRect.h + deltaY));
          updated = { x: startRect.x, y: startRect.y, w: Math.floor(newW), h: Math.floor(newH) };
        }
      }

      if (boxType === "board") {
        setBoardRect(updated);
        boardRectRef.current = updated;
      } else {
        setHandRect(updated);
        handRectRef.current = updated;
      }
    };

    const handlePointerUp = async (upEvt: PointerEvent) => {
      upEvt.preventDefault();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);

      // Instantly sync absolute coordinates to central database
      try {
        await setDoc(doc(db, "compiled_configuration", "calibration"), {
          boardRect: boardRectRef.current,
          handRect: handRectRef.current,
          hashDict: hashDictRef.current
        }, { merge: true });
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      } catch (err) {
        console.error("Firestore automatic position save error:", err);
      }
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
  };

  const handleAddKeyedTemplate = async (hash: string, rank: string) => {
    const updated = { ...hashDict, [hash]: rank.toUpperCase() };
    setHashDict(updated);
    try {
      await setDoc(doc(db, "compiled_configuration", "calibration"), {
        hashDict: updated
      }, { merge: true });
    } catch (e) {
      console.error("Failed to write manual rank signature:", e);
    }
  };

  const handleDeleteTemplate = async (hash: string) => {
    const updated = { ...hashDict };
    delete updated[hash];
    setHashDict(updated);
    try {
      await setDoc(doc(db, "compiled_configuration", "calibration"), {
        hashDict: updated
      }, { merge: true });
    } catch (e) {
      console.error("Failed to delete signature:", e);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b13] text-[#e2e8f0] font-sans antialiased flex flex-col">
      
      {/* Top utility bar */}
      <nav id="navbar" className="bg-[#0b101c] border-b border-[#1f293d]/60 px-6 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-50 shadow-md">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-purple-500 to-indigo-500 p-2 rounded-xl text-white shadow-md">
            <Cpu className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-white flex items-center gap-2">
              CoinPoker Calibrator HUD <span className="text-[9px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded font-mono font-bold tracking-wider uppercase">NATIVE PIPELINE</span>
            </h1>
            <p className="text-xs text-gray-500 font-mono tracking-wide">Interactive coordinate & vector alignment tracker</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 bg-[#131a29] border border-[#24334a] hover:border-[#38bdf8] px-4 py-2 rounded-xl text-xs text-[#9ca3af] hover:text-white transition-all cursor-pointer font-medium shadow-inner">
            <Upload className="w-4 h-4 text-[#38bdf8]" />
            <span>Upload Table Screenshot</span>
            <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
          </label>
          <button 
            onClick={handleProcessScreenshot}
            disabled={isProcessing || !imageSrc}
            className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-gray-500 text-white font-medium text-xs rounded-xl shadow-md cursor-pointer disabled:cursor-not-allowed transition-all"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Segmentation...</span>
              </>
            ) : (
              <>
                <Sliders className="w-4 h-4" />
                <span>Process OCR</span>
              </>
            )}
          </button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto p-4 md:p-6 grid grid-cols-1 xl:grid-cols-12 gap-6 w-full flex-1">
        
        {/* Left column (8/12 width): Workspace, image and scaling handles */}
        <div className="xl:col-span-8 flex flex-col gap-4">
          
          {/* Coordinates monitoring dashboard */}
          <div className="bg-[#0b101c] border border-[#1f293d]/50 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500 font-mono">SCREENSHOT RES:</span>
              <span className="font-mono text-cyan-400 font-bold">{imageSrc ? `${naturalWidth}x${naturalHeight}px` : "N/A"}</span>
              <span className="text-[#1f293d] mx-2">|</span>
              <span className="text-fuchsia-500 font-mono font-bold">● VIOLET (BOARD):</span>
              <span className="font-mono text-fuchsia-400 font-bold">[{boardRect.x}, {boardRect.y}, {boardRect.w}, {boardRect.h}]</span>
              <span className="text-[#1f293d] mx-2">|</span>
              <span className="text-red-500 font-mono font-bold">● RED (HAND):</span>
              <span className="font-mono text-red-400 font-bold">[{handRect.x}, {handRect.y}, {handRect.w}, {handRect.h}]</span>
            </div>
            
            {saveSuccess && (
              <div className="flex items-center gap-1 text-xs text-emerald-400 font-semibold bg-emerald-500/5 px-2.5 py-1 rounded border border-emerald-500/10">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Calibration synced!</span>
              </div>
            )}
          </div>

          {/* Interactive sandbox canvas */}
          <div 
            ref={containerRef}
            className="bg-[#0b101c] border border-[#1f293d]/80 rounded-2xl overflow-hidden relative min-h-[550px] flex items-center justify-center shadow-2xl"
          >
            {imageSrc ? (
              <div className="relative select-none max-w-full">
                {/* Full-table Screenshot underlay */}
                <img 
                  ref={imageRef}
                  src={imageSrc} 
                  alt="Poker Mobile Screen" 
                  onLoad={handleImageLoad}
                  className="max-h-[75vh] w-auto h-auto select-none pointer-events-none"
                />

                {/* VIOLET/FUCHSIA BOX FOR THE BOARD (Общие карты) */}
                <div 
                  className="absolute border-[3px] border-[#bd01ff] bg-[#bd01ff]/10 cursor-move shadow-md flex items-center justify-center"
                  style={{
                    left: `${boardRect.x / scale}px`,
                    top: `${boardRect.y / scale}px`,
                    width: `${boardRect.w / scale}px`,
                    height: `${boardRect.h / scale}px`
                  }}
                  onPointerDown={(e) => startDragOrResize(e, "board", "move")}
                >
                  <span className="absolute -top-[1.6rem] left-0 bg-[#bd01ff] text-white text-[10px] font-mono font-bold px-2 py-0.5 rounded shadow-md tracking-wider">
                    BOARD BOX (VIOLET)
                  </span>

                  {/* Handles */}
                  <div 
                    className="absolute w-3 h-3 bg-white border border-[#bd01ff] -top-1.5 -left-1.5 cursor-nwse-resize rounded-full" 
                    onPointerDown={(e) => startDragOrResize(e, "board", "resize", "TL")}
                  />
                  <div 
                    className="absolute w-3 h-3 bg-white border border-[#bd01ff] -top-1.5 -right-1.5 cursor-nesw-resize rounded-full" 
                    onPointerDown={(e) => startDragOrResize(e, "board", "resize", "TR")}
                  />
                  <div 
                    className="absolute w-3 h-3 bg-white border border-[#bd01ff] -bottom-1.5 -left-1.5 cursor-nesw-resize rounded-full" 
                    onPointerDown={(e) => startDragOrResize(e, "board", "resize", "BL")}
                  />
                  <div 
                    className="absolute w-3 h-3 bg-white border border-[#bd01ff] -bottom-1.5 -right-1.5 cursor-nwse-resize rounded-full" 
                    onPointerDown={(e) => startDragOrResize(e, "board", "resize", "BR")}
                  />
                </div>

                {/* RED BOX FOR THE HAND (Рука) */}
                <div 
                  className="absolute border-[3px] border-red-500 bg-red-500/10 cursor-move shadow-md flex items-center justify-center"
                  style={{
                    left: `${handRect.x / scale}px`,
                    top: `${handRect.y / scale}px`,
                    width: `${handRect.w / scale}px`,
                    height: `${handRect.h / scale}px`
                  }}
                  onPointerDown={(e) => startDragOrResize(e, "hand", "move")}
                >
                  <span className="absolute -top-[1.6rem] left-0 bg-red-500 text-white text-[10px] font-mono font-bold px-2 py-0.5 rounded shadow-md tracking-wider">
                    HAND BOX (RED)
                  </span>

                  {/* Handles */}
                  <div 
                    className="absolute w-3 h-3 bg-white border border-red-500 -top-1.5 -left-1.5 cursor-nwse-resize rounded-full" 
                    onPointerDown={(e) => startDragOrResize(e, "hand", "resize", "TL")}
                  />
                  <div 
                    className="absolute w-3 h-3 bg-white border border-red-500 -top-1.5 -right-1.5 cursor-nesw-resize rounded-full" 
                    onPointerDown={(e) => startDragOrResize(e, "hand", "resize", "TR")}
                  />
                  <div 
                    className="absolute w-3 h-3 bg-white border border-red-500 -bottom-1.5 -left-1.5 cursor-nesw-resize rounded-full" 
                    onPointerDown={(e) => startDragOrResize(e, "hand", "resize", "BL")}
                  />
                  <div 
                    className="absolute w-3 h-3 bg-white border border-red-500 -bottom-1.5 -right-1.5 cursor-nwse-resize rounded-full" 
                    onPointerDown={(e) => startDragOrResize(e, "hand", "resize", "BR")}
                  />
                </div>

                {/* Render Segmented Markers from Server Response to verify placement */}
                {ocrResults?.success && (
                  <>
                    {ocrResults.segmentedBoard?.map((c: any, index: number) => (
                      <div 
                        key={`b-seg-${index}`}
                        className="absolute border border-yellow-400 bg-yellow-400/20 text-yellow-300 pointer-events-none select-none rounded flex flex-col items-center justify-between"
                        style={{
                          left: `${c.rect.x / scale}px`,
                          top: `${c.rect.y / scale}px`,
                          width: `${c.rect.w / scale}px`,
                          height: `${c.rect.h / scale}px`
                        }}
                      >
                        <span className="bg-yellow-400 text-black font-black font-mono text-[9px] px-1 py-0.5 rounded-b -mt-0.5">
                          {hashDict[c.hashDarkOnLight] || hashDict[c.hashLightOnDark] || "?"}
                          <span className="text-gray-800 lowercase font-medium ml-0.5">{c.detectedColorSuit}</span>
                        </span>
                      </div>
                    ))}

                    {ocrResults.segmentedHand?.map((c: any, index: number) => (
                      <div 
                        key={`h-seg-${index}`}
                        className="absolute border border-yellow-400 bg-yellow-400/20 text-yellow-300 pointer-events-none select-none rounded flex flex-col items-center justify-between"
                        style={{
                          left: `${c.rect.x / scale}px`,
                          top: `${c.rect.y / scale}px`,
                          width: `${c.rect.w / scale}px`,
                          height: `${c.rect.h / scale}px`
                        }}
                      >
                        <span className="bg-yellow-400 text-black font-black font-mono text-[9px] px-1 py-0.5 rounded-b -mt-0.5">
                          {hashDict[c.hashDarkOnLight] || hashDict[c.hashLightOnDark] || "?"}
                          <span className="text-gray-800 lowercase font-medium ml-0.5">{c.detectedColorSuit}</span>
                        </span>
                      </div>
                    ))}
                  </>
                )}

              </div>
            ) : (
              <div className="flex flex-col items-center text-center p-8 text-[#4b5563]">
                <div className="w-16 h-16 rounded-2xl bg-indigo-500/5 flex items-center justify-center border border-indigo-500/10 mb-4">
                  <Upload className="w-8 h-8 text-indigo-400/60" />
                </div>
                <h3 className="text-[#f3f4f6] font-medium leading-relaxed mb-1">No screenshot loaded</h3>
                <p className="text-xs text-gray-500 max-w-sm">
                  Upload an emulator or hand screenshot to position your red/violet calibration frames.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right column (4/12 width): Template matrix, alignment output, and export assets */}
        <div className="xl:col-span-4 flex flex-col gap-6">

          {ocrResults?.success && (
            <div id="diagnostics-log" className="bg-[#0b101c] border border-[#1f293d]/80 rounded-2xl p-5 shadow-lg space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-semibold text-amber-400 uppercase tracking-wider">OCR Pipeline Report</span>
                <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-mono uppercase font-bold">READY</span>
              </div>

              <div className="space-y-4">
                {/* Board */}
                <div>
                  <h4 className="text-xs text-gray-400 font-medium mb-1.5">Segmented community cards (Board):</h4>
                  {ocrResults.segmentedBoard?.length === 0 ? (
                    <p className="text-xs text-gray-500 italic">No cards located in local Board frame.</p>
                  ) : (
                    <div className="grid grid-cols-5 gap-2">
                      {ocrResults.segmentedBoard.map((c: any, index: number) => {
                        const rank = hashDict[c.hashDarkOnLight] || hashDict[c.hashLightOnDark];
                        return (
                          <div key={index} className="bg-[#131d30] border border-[#1f293d] rounded-xl p-2 text-center flex flex-col items-center gap-1 shadow-sm">
                            <span className="text-sm font-mono font-extrabold text-white leading-none">
                              {rank || "?"}
                            </span>
                            <span className="text-[10px] font-bold uppercase font-sans text-gray-400 leading-none">
                              {c.detectedColorSuit}
                            </span>
                            {!rank && (
                              <input 
                                type="text"
                                maxLength={2}
                                placeholder="Edit"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && e.currentTarget.value) {
                                    handleAddKeyedTemplate(c.hashDarkOnLight, e.currentTarget.value);
                                  }
                                }}
                                className="w-10 bg-[#070b13] border border-[#24334a] focus:border-indigo-500 text-white rounded text-center text-[10px] py-1 px-0.5 font-bold outline-none mt-1"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Hand */}
                <div>
                  <h4 className="text-xs text-gray-400 font-medium mb-1.5">Segmented private cards (Hand):</h4>
                  {ocrResults.segmentedHand?.length === 0 ? (
                    <p className="text-xs text-gray-500 italic">No cards located in local Hand frame.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {ocrResults.segmentedHand.map((c: any, index: number) => {
                        const rank = hashDict[c.hashDarkOnLight] || hashDict[c.hashLightOnDark];
                        return (
                          <div key={index} className="bg-[#131d30] border border-[#1f293d] rounded-xl p-2.5 flex items-center justify-between gap-1 shadow-sm">
                            <div className="flex flex-col">
                              <span className="text-sm font-mono font-extrabold text-white">
                                {rank || "?"} <span className="text-xs text-indigo-400">{c.detectedColorSuit.toUpperCase()}</span>
                              </span>
                            </div>
                            {!rank && (
                              <div className="flex items-center gap-1">
                                <input 
                                  type="text"
                                  maxLength={2}
                                  placeholder="Map"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && e.currentTarget.value) {
                                      handleAddKeyedTemplate(c.hashDarkOnLight, e.currentTarget.value);
                                    }
                                  }}
                                  className="w-12 bg-[#070b13] border border-[#24334a] focus:border-indigo-500 text-white rounded text-center text-xs py-1 px-1 font-bold outline-none"
                                />
                                <span className="text-[9px] text-[#4b5563]">↵</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Matrix entries dictionary */}
          <div className="bg-[#0b101c] border border-[#1f293d]/80 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-indigo-400 uppercase tracking-wider">Calibration Matrix Dictionary</span>
              <span className="text-[10px] text-gray-500 bg-[#131d30] border border-[#1f293d] px-2.5 py-0.5 rounded-full font-mono">
                {Object.keys(hashDict).length} VALS
              </span>
            </div>

            <div className="max-h-[250px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {Object.keys(hashDict).length === 0 ? (
                <div className="text-center py-6 text-xs text-gray-500 italic">
                  Calibration templates array is empty. Sync with a screenshot to populated hashes automatically.
                </div>
              ) : (
                Object.entries(hashDict).map(([hash, rank], i) => (
                  <div key={i} className="flex items-center justify-between gap-3 bg-[#131d30]/50 border border-[#1f293d] rounded-xl px-3 py-2 text-xs">
                    <div className="flex items-center gap-3 font-mono">
                      <span className="text-indigo-400 font-black bg-indigo-500/10 px-2 py-0.5 rounded text-sm min-w-[24px] text-center">
                        {rank}
                      </span>
                      <span className="text-[10px] text-gray-500 select-all font-mono truncate max-w-[155px]">
                        {hash}
                      </span>
                    </div>
                    <button 
                      onClick={() => handleDeleteTemplate(hash)}
                      className="text-rose-500 hover:text-rose-400 cursor-pointer p-1.5 hover:bg-rose-500/5 rounded transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Asset Export */}
          <div id="export-asset" className="bg-[#0b101c] border border-[#1f293d]/80 rounded-2xl p-5 shadow-lg space-y-3 flex-1 flex flex-col min-h-[300px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-cyan-400 uppercase tracking-wider">Calibrated APK coordinates (JSON)</span>
            </div>

            <textarea 
              readOnly
              className="flex-1 w-full bg-[#070b13] border border-[#1f293d] rounded-xl p-4 font-mono text-[11px] text-emerald-400 focus:outline-none resize-none overflow-y-auto leading-relaxed select-all shadow-inner"
              value={JSON.stringify({
                boardRect,
                handRect,
                knownVectorsCount: Object.keys(hashDict).length,
                hashDict
              }, null, 2)}
            />
          </div>

        </div>

      </div>
    </div>
  );
}
