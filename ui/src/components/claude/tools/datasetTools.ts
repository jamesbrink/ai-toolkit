export const datasetTools = [
  {
    name: 'delete_dataset_images',
    description:
      'Propose deletion of dataset images. Shows the user a confirmation UI with thumbnails where they can accept or reject each deletion individually.',
    input_schema: {
      type: 'object' as const,
      properties: {
        image_paths: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: 'Array of absolute paths to images to propose for deletion',
        },
        reason: {
          type: 'string' as const,
          description: 'Brief explanation of why these images should be deleted',
        },
      },
      required: ['image_paths', 'reason'],
    },
  },
];
