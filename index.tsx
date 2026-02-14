
import { GoogleGenAI } from "@google/genai";
import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { motion, AnimatePresence } from "framer-motion";

// --- Types & Globals ---
declare global {
  interface AIStudio {
    openSelectKey: () => Promise<void>;
    hasSelectedApiKey: () => Promise<boolean>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}

// --- DOM References ---
const getEl = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const dropZone = getEl<HTMLDivElement>("drop-zone");
const fileInput = getEl<HTMLInputElement>("file-input");
const refPreview = getEl<HTMLImageElement>("reference-preview");
const uploadPrompt = getEl<HTMLDivElement>("upload-prompt");
const promptEl = getEl<HTMLTextAreaElement>("prompt-input");
const optimizeButton = getEl<HTMLButtonElement>("optimize-button");
const generateButton = getEl<HTMLButtonElement>("generate-button");
const outputImage = getEl<HTMLImageElement>("output-image");
const placeholderText = getEl<HTMLDivElement>("placeholder-text");
const loadingSpinner = getEl<HTMLDivElement>("loading-spinner");
const statusEl = getEl<HTMLDivElement>("status");
const suggestionList = getEl<HTMLDivElement>("suggestion-list");
const aiSuggestionsPanel = getEl<HTMLDivElement>("ai-suggestions");

// --- State ---
let base64Image: string | null = null;
let mimeType: string | null = null;

// --- Banner Component ---
const Banner = () => {
  const [isVisible, setIsVisible] = useState(true);
  const [tipIndex, setTipIndex] = useState(0);
  const tips = [
    "Tip: Be specific about textures and lighting",
    "Tip: AI understands character poses from your upload",
    "Tip: Use 'Refine Vision' for professional prompts",
    "Tip: Transparent backgrounds are preserved",
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % tips.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 glass border-t border-white/5 p-4 z-50 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">System Ready</span>
      </div>
      <div className="flex-1 text-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={tipIndex}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="text-[10px] font-bold uppercase tracking-widest text-blue-400"
          >
            {tips[tipIndex]}
          </motion.p>
        </AnimatePresence>
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={async () => window.aistudio?.openSelectKey?.()}
          className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 transition-colors"
        >
          API Key
        </button>
        <button onClick={() => setIsVisible(false)} className="text-slate-500 hover:text-white">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </div>
  );
};

// --- Initialization ---
const root = createRoot(document.getElementById("banner-root")!);
root.render(<Banner />);

// --- Event Handlers ---
dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("active");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("active"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("active");
  const file = e.dataTransfer?.files[0];
  if (file) handleFile(file);
});
fileInput.addEventListener("change", (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) handleFile(file);
});

optimizeButton.addEventListener("click", () => {
  const val = promptEl.value.trim();
  if (!val) {
    showStatus("Describe your vision first!");
    return;
  }
  refineVision(val);
});

generateButton.addEventListener("click", () => {
  if (!base64Image) {
    showStatus("Upload an image first.");
    return;
  }
  const val = promptEl.value.trim();
  if (!val) {
    showStatus("Enter a prompt.");
    return;
  }
  executeShift(val);
});

// --- Logic ---
function showStatus(msg: string, isError = false) {
  statusEl.innerText = msg;
  statusEl.className = `text-center text-[10px] font-bold tracking-widest uppercase py-2 ${
    isError ? "text-red-500" : "text-slate-500"
  }`;
}

async function handleFile(file: File) {
  if (!file.type.startsWith("image/")) {
    showStatus("Invalid file type.", true);
    return;
  }
  const reader = new FileReader();
  reader.onload = async (e) => {
    const dataUrl = e.target?.result as string;
    refPreview.src = dataUrl;
    refPreview.classList.remove("hidden");
    uploadPrompt.classList.add("hidden");
    const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      mimeType = matches[1];
      base64Image = matches[2];
      await analyzeAndSuggest();
    }
  };
  reader.readAsDataURL(file);
}

/**
 * Proactively helps the user by suggesting 3 transformations for the uploaded image.
 */
async function analyzeAndSuggest() {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey || !base64Image) return;

  aiSuggestionsPanel.classList.add("hidden");
  suggestionList.innerHTML = "";

  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { inlineData: { data: base64Image, mimeType: mimeType! } },
          { text: "Suggest 3 short, creative transformations for this person. Focus on expressions, styles, or new items. Return ONLY a comma-separated list of 3 phrases." },
        ],
      },
    });

    const suggestions = response.text.split(",").map((s) => s.trim());
    suggestions.forEach((s) => {
      const btn = document.createElement("button");
      btn.className = "suggestion-chip text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border border-slate-800 bg-slate-900/40 text-slate-400 hover:text-white transition-all";
      btn.textContent = s;
      btn.onclick = () => {
        promptEl.value = s;
        refineVision(s);
      };
      suggestionList.appendChild(btn);
    });
    aiSuggestionsPanel.classList.remove("hidden");
  } catch (e) {
    console.error("Suggestion error", e);
  }
}

async function refineVision(input: string) {
  import.meta.env.VITE_GEMINI_API_KEY
  if (!apiKey) {
    showStatus("API Key missing", true);
    return;
  }

  showStatus("Refining vision...");
  optimizeButton.disabled = true;
  promptEl.classList.add("optimizing");

  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Transform this casual request into a high-fidelity image-to-image prompt. Focus on facial expressions, anatomical precision, and keeping the background transparent. Request: "${input}"`,
    });
    promptEl.value = response.text.trim();
    showStatus("Vision refined.");
  } catch (e) {
    showStatus("Refinement failed.", true);
  } finally {
    optimizeButton.disabled = false;
    promptEl.classList.remove("optimizing");
  }
}

async function executeShift(prompt: string) {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    showStatus("API Key missing", true);
    return;
  }

  setUIState("loading");
  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: {
        parts: [
          { inlineData: { data: base64Image!, mimeType: mimeType! } },
          {
            text: `IMAGE-TO-IMAGE TASK:
            1. PERSISTENCE: Keep the same character, clothing, hair color, and exact lotus pose.
            2. ALPHA: Maintain absolute transparency in the background (RGBA).
            3. CHANGE: Apply the following specific modification accurately: ${prompt}`,
          },
        ],
      },
    });

    const candidate = response.candidates?.[0];
    const imagePart = candidate?.content?.parts.find((p) => p.inlineData);

    if (imagePart?.inlineData) {
      outputImage.src = `data:image/png;base64,${imagePart.inlineData.data}`;
      setUIState("success");
    } else {
      throw new Error("No image data returned.");
    }
  } catch (err: any) {
    console.error(err);
    showStatus(err.message || "Synthesis failed.", true);
    setUIState("error");
    if (err.message?.includes("entity was not found")) {
      window.aistudio?.openSelectKey?.();
    }
  }
}

function setUIState(state: "idle" | "loading" | "success" | "error") {
  generateButton.disabled = state === "loading";
  optimizeButton.disabled = state === "loading";
  
  if (state === "loading") {
    loadingSpinner.classList.remove("hidden");
    outputImage.classList.add("hidden");
    placeholderText.classList.add("hidden");
    showStatus("Synthesizing shift...");
  } else if (state === "success") {
    loadingSpinner.classList.add("hidden");
    outputImage.classList.remove("hidden");
    showStatus("Shift complete.");
  } else {
    loadingSpinner.classList.add("hidden");
    if (state === "idle") {
      outputImage.classList.add("hidden");
      placeholderText.classList.remove("hidden");
    }
  }
}
