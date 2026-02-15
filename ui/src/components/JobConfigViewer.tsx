'use client';
import { useEffect, useState } from 'react';
import YAML from 'yaml';
import Editor from '@monaco-editor/react';
import { useTheme } from 'next-themes';

import { Job } from '@/server/prismaTypes';
import { UnifiedJob } from '@/types';

interface Props {
  job: Job | UnifiedJob;
  hostId?: string | null;
}

const yamlConfig: YAML.DocumentOptions &
  YAML.SchemaOptions &
  YAML.ParseOptions &
  YAML.CreateNodeOptions &
  YAML.ToStringOptions = {
  indent: 2,
  lineWidth: 999999999999,
  defaultStringType: 'QUOTE_DOUBLE',
  defaultKeyType: 'PLAIN',
  directives: true,
};

export default function JobConfigViewer({ job }: Props) {
  const { resolvedTheme } = useTheme();
  const [editorValue, setEditorValue] = useState<string>('');
  useEffect(() => {
    if (job?.job_config) {
      try {
        const yamlContent = YAML.stringify(JSON.parse(job.job_config), yamlConfig);
        setEditorValue(yamlContent);
      } catch {
        setEditorValue(`# Error: This job has a malformed configuration.\n# Raw value: ${job.job_config}`);
      }
    }
  }, [job]);
  return (
    <>
      <Editor
        height="100%"
        width="100%"
        defaultLanguage="yaml"
        value={editorValue}
        theme={resolvedTheme === 'dark' ? 'vs-dark' : 'vs'}
        options={{
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          readOnly: true,
        }}
      />
    </>
  );
}
