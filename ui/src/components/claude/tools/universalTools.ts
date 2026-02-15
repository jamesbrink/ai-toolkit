export const universalTools = [
  {
    name: 'prompt_user',
    description:
      'Present clickable options to the user for quick responses. Use this instead of asking the user to type a confirmation or choice. The user clicks a button and the conversation continues with their selection.',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The question or prompt to display above the options' },
        options: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: 'Button text shown to user' },
              value: { type: 'string', description: 'Value sent back when this option is selected' },
              variant: {
                type: 'string',
                enum: ['primary', 'danger', 'secondary'],
                description:
                  'Button style: primary (default blue), danger (red for destructive), secondary (gray outline)',
              },
            },
            required: ['label', 'value'],
          },
          description: 'Array of options to present as buttons (2-4 recommended)',
        },
      },
      required: ['message', 'options'],
    },
  },
];
