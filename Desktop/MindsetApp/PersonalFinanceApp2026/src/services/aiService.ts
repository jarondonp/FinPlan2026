// GoogleGenerativeAI import removed as we are using direct REST fetch for simpler integration
// import { GoogleGenerativeAI } from "@google/genai";

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
    },

    async extractTransactionsFromImage(base64Image: string): Promise<string[][]> {
        if (!API_KEY) {
            console.warn("Gemini API Key missing");
            return [];
        }

        const prompt = `
            You are a data extraction engine. Analyze this image of a bank statement or transaction list.
            Extract the transaction rows into a 2D JSON array (matrix).
            
            Columns to extract (in this order):
            1. Date (YYYY-MM-DD format PREFERRED. If year is missing in text e.g. "Dec 27", assume current year 2025. Return full YYYY-MM-DD).
            2. Description (Transaction details).
            3. Amount (Numeric string. Use negative sign '-' for expenses/debits, positive for deposits/credits).

            Rules:
            - Ignore headers, balances, or unrelated text.
            - If an expense is shown in parentheses (50.00) or separate debit column, make it negative -50.00.
            - Return ONLY the JSON matrix: [["2025-12-01", "Netflix", "-15.00"], ["2025-12-02", "Salary", "2000.00"]]
        `;

        try {
            // Remove header if present (e.g., "data:image/jpeg;base64,")
            const cleanBase64 = base64Image.split(',')[1] || base64Image;

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: prompt },
                            { inline_data: { mime_type: "image/jpeg", data: cleanBase64 } }
                        ]
                    }],
                    generationConfig: { responseMimeType: "application/json" }
                })
            });

            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!text) {
                console.error("Gemini Response Error", data);
                throw new Error("No response from AI Image Analysis");
            }

            const matrix = JSON.parse(text);
            if (!Array.isArray(matrix)) throw new Error("AI returned invalid format");

            return matrix;

        } catch (error) {
            console.error("Image Extraction Error:", error);
            throw error;
        }
    }
};
