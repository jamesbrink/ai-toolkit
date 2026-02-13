'use client';

import { useEffect, useState } from 'react';
import { Settings } from './useSettings';
import { remoteApi } from '@/utils/remoteApi';

const defaultSettings: Settings = {
  HF_TOKEN: '',
  TRAINING_FOLDER: '',
  DATASETS_FOLDER: '',
  ANTHROPIC_API_KEY: '',
  CLAUDE_CODE_OAUTH_TOKEN: '',
  CLAUDE_CHAT_MODEL: '',
  CLAUDE_CAPTION_MODEL: '',
  MDNS_ENABLED: 'true',
  RUNPOD_API_KEY: '',
  RUNPOD_SSH_PUBLIC_KEY: '',
  RUNPOD_DEFAULT_PASSWORD: '',
};

export default function useRemoteSettings(hostId: string | null) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [isSettingsLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!hostId) {
      setSettings(defaultSettings);
      setIsLoaded(false);
      return;
    }

    setIsLoaded(false);
    remoteApi
      .get(hostId, 'settings')
      .then(res => res.data)
      .then(data => {
        setSettings({
          HF_TOKEN: data.HF_TOKEN || '',
          TRAINING_FOLDER: data.TRAINING_FOLDER || '',
          DATASETS_FOLDER: data.DATASETS_FOLDER || '',
          ANTHROPIC_API_KEY: data.ANTHROPIC_API_KEY || '',
          CLAUDE_CODE_OAUTH_TOKEN: data.CLAUDE_CODE_OAUTH_TOKEN || '',
          CLAUDE_CHAT_MODEL: data.CLAUDE_CHAT_MODEL || '',
          CLAUDE_CAPTION_MODEL: data.CLAUDE_CAPTION_MODEL || '',
          MDNS_ENABLED: data.MDNS_ENABLED ?? 'true',
          RUNPOD_API_KEY: data.RUNPOD_API_KEY || '',
          RUNPOD_SSH_PUBLIC_KEY: data.RUNPOD_SSH_PUBLIC_KEY || '',
          RUNPOD_DEFAULT_PASSWORD: data.RUNPOD_DEFAULT_PASSWORD || '',
        });
        setIsLoaded(true);
      })
      .catch(error => console.error('Error fetching remote settings:', error));
  }, [hostId]);

  return { settings, isSettingsLoaded };
}
