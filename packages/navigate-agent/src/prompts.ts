export function navigatePrompt(userPreferences: string[]): string {
  const prefList = userPreferences.length > 0
    ? `\nUser preferences: ${userPreferences.join(', ')}`
    : '';

  return `Based on the conversation context, suggest relevant next actions for the user.${prefList}

Provide 2-4 short, actionable suggestions.`;
}
