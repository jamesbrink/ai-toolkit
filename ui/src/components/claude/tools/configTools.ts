export const configTools = [
  {
    name: 'update_job_config',
    description:
      'Propose changes to the current training job configuration. Each change specifies a config path, new value, and reason. The user can accept or reject each change individually.',
    input_schema: {
      type: 'object' as const,
      properties: {
        changes: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              path: {
                type: 'string' as const,
                description:
                  'Dot-notation path in the job config, e.g. "config.process[0].train.lr" or "config.process[0].model.quantize"',
              },
              value: {
                description: 'The new value to set at this path',
              },
              reason: {
                type: 'string' as const,
                description: 'Brief explanation of why this change is recommended',
              },
            },
            required: ['path', 'value', 'reason'],
          },
          description: 'List of config changes to propose',
        },
      },
      required: ['changes'],
    },
  },
  {
    name: 'explain_config_option',
    description:
      'Explain what a specific configuration option does, its valid values, and how it affects training. Use this when the user asks about a config parameter.',
    input_schema: {
      type: 'object' as const,
      properties: {
        option_path: {
          type: 'string' as const,
          description: 'The config path to explain, e.g. "train.lr" or "model.quantize"',
        },
        explanation: {
          type: 'string' as const,
          description: 'Detailed explanation of the option',
        },
      },
      required: ['option_path', 'explanation'],
    },
  },
];

export { datasetTools } from './datasetTools';
