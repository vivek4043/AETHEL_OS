import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn("GEMINI_API_KEY is not defined. AI features will not work until a key is provided in the Secrets panel.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || "" });

export async function summarizeSecurityLogs(logs: string[]) {
  if (!apiKey) return { threats: [], summary: "API Key missing. Please set GEMINI_API_KEY in the Secrets panel." };

  const prompt = `Analyze these system logs and identify security threats. Explain them in plain English.
  Return the analysis as a JSON object with:
  - threats: array of { severity: 'High'|'Medium'|'Low', type: string, description: string, recommendation: string }
  - summary: a short 2-sentence summary.

  Logs:
  ${logs.join("\n")}
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            threats: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  severity: { type: Type.STRING },
                  type: Type.STRING,
                  description: { type: Type.STRING },
                  recommendation: { type: Type.STRING }
                }
              }
            },
            summary: { type: Type.STRING }
          }
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("AI security analysis failed:", error);
    return { threats: [], summary: "AI analysis currently unavailable (Check console for details)." };
  }
}

export async function generateMarketingIdeas(context: any) {
  if (!apiKey) return ["AI Key missing. Please set GEMINI_API_KEY."];

  const prompt = `Based on these trending keywords: ${context.trendingKeywords.join(", ")} and feedback: ${context.mockFeedback.join(", ")}, generate 5 creative content ideas for a SaaS platform.
  Return as a JSON array of strings.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });
    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Marketing ideas generation failed:", error);
    return ["AI-generated ideas coming soon (Check console for errors)..."];
  }
}

export async function generateSalesFollowUp(leadName: string, status: string) {
  if (!apiKey) return "API Key missing. Please set GEMINI_API_KEY in the Secrets panel.";

  const prompt = `Write a short, professional follow-up email for a sales lead named ${leadName} who is currently at stage: ${status}.
  The tone should be helpful and not pushy.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Sales follow-up generation failed:", error);
    return "Error generating follow-up message. Check console for details.";
  }
}

export async function getCEOSummary(data: any) {
  if (!apiKey) return { summary: "API Key missing.", priorities: ["Set GEMINI_API_KEY in Secrets"] };

  const prompt = `You are a CEO Agent. Summarize the current state of the business based on this data:
  System Health: ${data.overview.systemHealth}
  Active Users: ${data.overview.activeUsers}
  Revenue Growth: ${data.overview.revenueGrowth}
  Security Threat Level: ${data.overview.threatLevel}
  
  Provide a concise executive summary and top 3 priorities for today.
  Return as JSON: { summary: string, priorities: string[] }`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            priorities: { type: Type.ARRAY, items: { type: Type.STRING } }
          }
        }
      }
    });
    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("CEO summary failed:", error);
    return { summary: "System running normally (AI disabled).", priorities: ["Check security logs", "Monitor engagement"] };
  }
}
