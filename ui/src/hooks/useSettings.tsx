'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/utils/api';

export interface Settings {
  HF_TOKEN: string;
  TRAINING_FOLDER: string;
  DATASETS_FOLDER: string;
  ANTHROPIC_API_KEY: string;
  CLAUDE_CHAT_MODEL: string;
  CLAUDE_CAPTION_MODEL: string;
  MDNS_ENABLED: string;
  RUNPOD_API_KEY: string;
}

export default function useSettings() {
  const [settings, setSettings] = useState<Settings>({
    HF_TOKEN: '',
    TRAINING_FOLDER: '',
    DATASETS_FOLDER: '',
    ANTHROPIC_API_KEY: '',
    CLAUDE_CHAT_MODEL: '',
    CLAUDE_CAPTION_MODEL: '',
    MDNS_ENABLED: 'true',
    RUNPOD_API_KEY: '',
  });
  const [isSettingsLoaded, setIsLoaded] = useState(false);
  useEffect(() => {
    apiClient
      .get('/api/settings')
      .then(res => res.data)
      .then(data => {
        setSettings({
          HF_TOKEN: data.HF_TOKEN || '',
          TRAINING_FOLDER: data.TRAINING_FOLDER || '',
          DATASETS_FOLDER: data.DATASETS_FOLDER || '',
          ANTHROPIC_API_KEY: data.ANTHROPIC_API_KEY || '',
          CLAUDE_CHAT_MODEL: data.CLAUDE_CHAT_MODEL || '',
          CLAUDE_CAPTION_MODEL: data.CLAUDE_CAPTION_MODEL || '',
          MDNS_ENABLED: data.MDNS_ENABLED ?? 'true',
          RUNPOD_API_KEY: data.RUNPOD_API_KEY || '',
        });
        setIsLoaded(true);
      })
      .catch(error => console.error('Error fetching settings:', error));
  }, []);

  return { settings, setSettings, isSettingsLoaded };
}
