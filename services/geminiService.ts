
import { GoogleGenAI, Type } from "@google/genai";
import { FilterSettings, DitherMode } from "../types";

export const analyzeImageStyle = async (base64Image: string): Promise<Partial<FilterSettings>> => {
  // Create a new GoogleGenAI instance right before making an API call to ensure it uses the most up-to-date API key.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: base64Image.split(',')[1],
            },
          },
          {
            text: `Analyze this image for its lighting, contrast, and detail density. 
            Suggest optimal parameters for a monochrome pixel dither effect (Yasuda Style).
            Return the values for pixelSize, contrast, brightness, threshold, and the dither mode.`,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        // Recommended way to configure a responseSchema for expected JSON output.
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            pixelSize: { type: Type.NUMBER, description: "Optimal pixel size (4-12)" },
            contrast: { type: Type.NUMBER, description: "Optimal contrast (0-100)" },
            brightness: { type: Type.NUMBER, description: "Optimal brightness (-50-50)" },
            threshold: { type: Type.NUMBER, description: "Optimal threshold (100-200)" },
            mode: { 
              type: Type.STRING, 
              enum: ["BAYER", "THRESHOLD", "HALFTONE", "STOCHASTIC"],
              description: "Optimal dither mode" 
            }
          },
          required: ["pixelSize", "contrast", "brightness", "threshold", "mode"]
        }
      }
    });

    // Accessing the .text property directly as it returns the string output.
    const result = JSON.parse(response.text || '{}');
    return result;
  } catch (error) {
    console.error("AI Analysis failed:", error);
    return {};
  }
};
