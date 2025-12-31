import { GoogleGenerativeAI } from "@google/genai";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

export const aiService = {
    async categorizeTransactions(
        transactions: { id: string; description: string }[],
        categories: string[]
    ): Promise<{ id: string; category: string }[]> {

        if (!API_KEY) {
            console.warn("Gemini API Key missing");
            return [];
        }

        // Batch processing to save tokens/requests
        // We'll process in chunks of 50 if needed, but for now simple implementation
        const prompt = `
      You are a financial assistant. Categorize these transactions into one of the following categories: ${categories.join(", ")}.
      Return ONLY a JSON array of objects with "id" and "category".
      If unsure, use "Uncategorized".
      
      Transactions:
      ${JSON.stringify(transactions)}
    `;

        try {
            // Using the new SDK via REST fallback or standard fetch if SDK has issues, 
            // but let's try a direct fetch to the API to avoid complex SDK setup if not fully compatible with browser immediately
            // Actually installed @google/genai, so let's use it.

            // Note: The @google/genai package might be Node-only or require specific setup.
            // For simplicity and browser compatibility without complex build polyfills, 
            // I'll use a direct fetch to the Gemini 1.5 Flash endpoint.

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { responseMimeType: "application/json" }
                })
            });

            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) throw new Error("No response from AI");

            return JSON.parse(text);

        } catch (error) {
            console.error("AI Categorization Error:", error);
            return [];
        }
    }
};
