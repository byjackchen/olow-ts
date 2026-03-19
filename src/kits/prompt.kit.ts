// LLM Prompt Templates

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

export function reactIntentPrompt(query: string, chatHistory?: string): string {
  return `Analyze the user's request and rewrite it as a clear, standalone question.

${chatHistory ? `Chat history:\n${chatHistory}\n\n` : ''}Current message: ${query}

Provide:
1. A rewritten standalone question
2. Key entities mentioned
3. Whether this needs external tool calls`;
}

export function reactPlanPrompt(
  query: string,
  availableTools: Array<{ name: string; description: string }>,
): string {
  const toolList = availableTools.map((t) => `- ${t.name}: ${t.description}`).join('\n');

  return `Given the user's question and available tools, plan which tools to call.

Question: ${query}

Available tools:
${toolList}

Respond in JSON:
{
  "tool_calls": [
    {"tool": "tool_name", "parameters": {...}}
  ],
  "reasoning": "brief explanation of why these tools"
}`;
}

export function reactResponsePrompt(
  query: string,
  toolResults: string,
  language?: string,
): string {
  const langInstruction = language === 'cn'
    ? 'Respond in Chinese (Simplified).'
    : 'Respond in the same language as the user.';

  return `Based on the tool results, provide a helpful response to the user's question.

User question: ${query}

Tool results:
${toolResults}

${langInstruction}
Be concise and helpful. If the information is insufficient, say so honestly.`;
}
