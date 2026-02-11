/**
 * Caption prompts for diffusion model training datasets.
 *
 * Training captions must be PLAIN TEXT — no markdown, no headers, no bullet
 * points, no numbered lists. The toolkit's clean_caption() function converts
 * newlines and periods to commas, strips quotes, lowercases everything, and
 * deduplicates phrases. Output should already be close to that format.
 */
export const captionPrompts: Record<string, string> = {
  descriptive: [
    'Write a concise caption for this image for training a diffusion model.',
    'Output ONLY the caption as a single block of plain text — no markdown, no headers, no bullet points, no labels.',
    'Use short comma-separated descriptive phrases. Approximately 20-40 words.',
    'Describe: subject, key features, clothing, setting, lighting. Omit generic details and obvious background elements.',
    'Be specific and factual. Do not editorialize.',
    'Example: a young woman with long pink hair, rectangular glasses, dark purple hoodie, seated in a salon chair, neutral expression, indoor lighting, medium shot',
  ].join(' '),

  booru: [
    'Generate danbooru-style tags for this image, separated by commas.',
    'Output ONLY the comma-separated tags — no explanations, no categories, no labels, no markdown.',
    'Limit to 15-25 tags. Prioritize distinctive tags over generic ones.',
    'Include: subject count (1girl, 1boy), hair, eyes, expression, clothing, pose, background, style.',
    'Use standard booru conventions: lowercase, underscores for multi-word tags.',
    'Example: 1girl, pink_hair, long_hair, glasses, purple_hoodie, sitting, indoors, looking_at_viewer',
  ].join(' '),

  natural: [
    'Write a single natural language sentence describing this image, suitable for FLUX diffusion model training.',
    'Output ONLY the caption — no markdown, no formatting, no labels.',
    'Under 30 words. Be specific about the subject, action, and key visual details.',
    'Example: A woman with long pink hair and black glasses sits in a salon chair wearing a purple hoodie.',
  ].join(' '),

  trigger: [
    'Write a training caption for this image that starts with the trigger word [trigger].',
    'Output ONLY the caption as plain text — no markdown, no labels.',
    'After the trigger word, describe only what varies in this specific image: pose, clothing, setting, expression.',
    'Do NOT describe the subject identity (that is what the trigger word represents).',
    '10-20 words after the trigger word. Use comma-separated phrases.',
    'Example: [trigger], sitting in a chair, purple hoodie, indoor lighting, neutral expression',
  ].join(' '),
};
