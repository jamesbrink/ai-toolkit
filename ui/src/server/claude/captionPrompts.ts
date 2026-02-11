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
    'Write a detailed caption for this image for training a diffusion model.',
    'Output ONLY the caption as a single block of plain text — no markdown, no headers, no bullet points, no labels.',
    'Use many short comma-separated descriptive phrases.',
    'Describe: subject (gender, age, features), pose and action, facial expression, clothing and accessories,',
    'hair style and color, background and setting, lighting conditions, camera angle, composition, color palette, and art style or medium.',
    'Be specific and factual. Do not editorialize or interpret mood beyond what is visible.',
    'Example format: a young woman with long pink hair, wearing a dark purple hoodie and black t-shirt, seated in a salon chair, neutral expression, rectangular black glasses, indoor lighting, animal print curtain in background, medium shot, casual candid photo',
  ].join(' '),

  booru: [
    'Generate danbooru-style tags for this image, separated by commas.',
    'Output ONLY the comma-separated tags — no explanations, no categories, no labels, no markdown.',
    'Include tags for: subject count (1girl, 1boy, etc), hair (color, style, length), eyes (color),',
    'expression, clothing items, accessories, pose, action, background, setting, lighting, camera angle, and image style.',
    'Use standard booru tag conventions: lowercase, underscores for multi-word tags.',
    'Example format: 1girl, pink_hair, long_hair, glasses, rectangular_glasses, hoodie, purple_hoodie, black_shirt, sitting, chair, indoors, salon, animal_print, curtain, looking_at_viewer, neutral_expression',
  ].join(' '),

  natural: [
    'Write a concise natural language caption for this image in 1-2 sentences, suitable for FLUX diffusion model training.',
    'Output ONLY the caption text — no markdown, no formatting, no labels.',
    'Be specific about the subject, action, setting, and key visual details.',
    'Example format: A woman with long pink hair and black glasses sits in a salon chair wearing a purple hoodie, with an animal print curtain visible behind her.',
  ].join(' '),
};
