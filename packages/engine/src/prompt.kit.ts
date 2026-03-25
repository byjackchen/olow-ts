// LLM Prompt Templates — engine-level utilities

export function triagePrompt(query: string, chatHistory?: string): string {
  return `You are an intelligent IT support assistant. Analyze the following user query and determine the user's intent.

${chatHistory ? `Recent chat history:\n${chatHistory}\n\n` : ''}User query: ${query}

Classify the intent and provide a brief analysis in JSON format:
{
  "intent": "one of: faq, ticket_status, hardware_inquiry, general_question, greeting, unclear",
  "confidence": 0.0-1.0,
  "keywords": ["relevant", "keywords"],
  "needs_tools": true/false
}`;
}
