'use client';

import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { ChatMessage, ChatContext as ChatCtx, ContentBlock, StreamEvent } from '@/types/claude';
import { streamClaude } from '@/utils/claudeStream';
import { apiClient } from '@/utils/api';

type ToolHandler = (toolName: string, input: Record<string, unknown>) => void;

interface ClaudeChatState {
  isOpen: boolean;
  isConfigured: boolean;
  isStreaming: boolean;
  activeToolName: string | null;
  messages: ChatMessage[];
  togglePanel: () => void;
  openPanel: () => void;
  closePanel: () => void;
  sendMessage: (text: string) => void;
  sendToolResult: (toolUseId: string, content: string) => void;
  setContext: (ctx: ChatCtx) => void;
  registerToolHandler: (handler: ToolHandler) => void;
  clearMessages: () => void;
  stopStreaming: () => void;
  tools: unknown[];
  setTools: (tools: unknown[]) => void;
}

const ClaudeChatContext = createContext<ClaudeChatState | null>(null);

const STORAGE_KEY = 'claude_chat_messages';

function loadMessages(): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveMessages(messages: ChatMessage[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {
    // storage full, ignore
  }
}

// Tools listed here are informational-only: they render UI but require no user
// action. The provider auto-sends a tool_result so the conversation continues
// without deadlocking. To extend, add the tool name to this set.
const AUTO_RESPOND_TOOLS = new Set(['explain_config_option']);

export function ClaudeChatProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tools, setTools] = useState<unknown[]>([]);
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const [pendingAutoRespond, setPendingAutoRespond] = useState<ContentBlock[] | null>(null);
  const contextRef = useRef<ChatCtx | undefined>(undefined);
  const toolHandlerRef = useRef<ToolHandler | null>(null);
  const messagesInitialized = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load messages from localStorage on mount
  useEffect(() => {
    if (!messagesInitialized.current) {
      setMessages(loadMessages());
      messagesInitialized.current = true;
    }
  }, []);

  // Persist messages to localStorage
  useEffect(() => {
    if (messagesInitialized.current) {
      saveMessages(messages);
    }
  }, [messages]);

  // Check if Claude is configured on mount
  useEffect(() => {
    apiClient
      .get('/api/claude/status')
      .then(res => {
        setIsConfigured(res.data.configured);
      })
      .catch(() => {
        setIsConfigured(false);
      });
  }, []);

  const togglePanel = useCallback(() => setIsOpen(prev => !prev), []);
  const openPanel = useCallback(() => setIsOpen(true), []);
  const closePanel = useCallback(() => setIsOpen(false), []);

  const setContext = useCallback((ctx: ChatCtx) => {
    contextRef.current = ctx;
  }, []);

  const registerToolHandler = useCallback((handler: ToolHandler) => {
    toolHandlerRef.current = handler;
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    saveMessages([]);
  }, []);

  const processStream = useCallback(
    (apiMessages: ChatMessage[], currentMessages: ChatMessage[]) => {
      setIsStreaming(true);
      setActiveToolName(null);
      let assistantText = '';
      const contentBlocks: ContentBlock[] = [];
      let currentBlockIndex = -1;

      const controller = new AbortController();
      abortControllerRef.current = controller;

      streamClaude(
        apiMessages,
        contextRef.current,
        tools.length > 0 ? tools : undefined,
        (event: StreamEvent) => {
          if (event.type === 'tool_progress' && event.tool_name) {
            setActiveToolName(event.tool_name);
            return;
          }

          if (event.type === 'tool_completed' && event.tool_name) {
            window.dispatchEvent(
              new CustomEvent('claude-tool-completed', {
                detail: { toolName: event.tool_name, toolInput: event.tool_input },
              }),
            );
            return;
          }

          // Clear tool progress when we start getting content
          if (event.type === 'content_block_start') {
            setActiveToolName(null);
          }

          if (event.type === 'content_block_start' && event.content_block) {
            currentBlockIndex = event.index ?? contentBlocks.length;
            contentBlocks[currentBlockIndex] = event.content_block;

            if (event.content_block.type === 'tool_use' && event.content_block.name && event.content_block.id) {
              // tool_use block started — we'll accumulate input via deltas
            }
          }

          if (event.type === 'content_block_delta' && event.delta) {
            if (event.delta.type === 'text_delta' && event.delta.text) {
              assistantText += event.delta.text;
              setMessages([...currentMessages, { role: 'assistant', content: assistantText }]);
            }
            if (event.delta.type === 'input_json_delta' && event.delta.text) {
              // Accumulate JSON for tool input
              const block = contentBlocks[event.index ?? currentBlockIndex];
              if (block && block.type === 'tool_use') {
                block.input = block.input || {};
                // We'll reconstruct after block stop by parsing accumulated JSON
                if (!block.content) block.content = '';
                block.content += event.delta.text;
              }
            }
          }

          if (event.type === 'content_block_stop') {
            const block = contentBlocks[event.index ?? currentBlockIndex];
            if (block && block.type === 'tool_use' && block.content) {
              try {
                block.input = JSON.parse(block.content);
              } catch {
                // partial JSON
              }
              delete block.content;
            }
          }

          if (event.type === 'message_stop') {
            // Check if there are tool_use blocks
            const toolBlocks = contentBlocks.filter(b => b.type === 'tool_use');
            if (toolBlocks.length > 0) {
              // Build final message with content blocks
              const finalBlocks: ContentBlock[] = [];
              if (assistantText) {
                finalBlocks.push({ type: 'text', text: assistantText });
              }
              finalBlocks.push(...toolBlocks);

              const finalMessages: ChatMessage[] = [...currentMessages, { role: 'assistant', content: finalBlocks }];
              setMessages(finalMessages);

              // Notify tool handler (extension point for page-specific tool handling,
              // e.g. ConfigProposal on /jobs/new applies config changes via custom events)
              for (const block of toolBlocks) {
                if (toolHandlerRef.current && block.name && block.input) {
                  toolHandlerRef.current(block.name, block.input);
                }
              }

              // Queue auto-response for informational tools that need no user action
              const autoBlocks = toolBlocks.filter(b => b.name && AUTO_RESPOND_TOOLS.has(b.name));
              if (autoBlocks.length > 0) {
                setPendingAutoRespond(autoBlocks);
              }
            } else {
              setMessages([...currentMessages, { role: 'assistant', content: assistantText }]);
            }
          }

          if (event.type === 'error') {
            setMessages([...currentMessages, { role: 'assistant', content: `Error: ${event.error}` }]);
          }
        },
        () => {
          setIsStreaming(false);
          setActiveToolName(null);
        },
        (error: string) => {
          setMessages([...currentMessages, { role: 'assistant', content: `Error: ${error}` }]);
          setIsStreaming(false);
          setActiveToolName(null);
        },
        controller.signal,
      );
    },
    [tools],
  );

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsStreaming(false);
    setActiveToolName(null);
  }, []);

  // Auto-respond to informational tools after streaming completes
  useEffect(() => {
    if (pendingAutoRespond && !isStreaming) {
      const blocks = pendingAutoRespond;
      setPendingAutoRespond(null);
      const toolResults: ContentBlock[] = blocks.map(b => ({
        type: 'tool_result' as const,
        tool_use_id: b.id!,
        content: 'Explanation displayed to user.',
      }));
      const toolResultMessage: ChatMessage = { role: 'user', content: toolResults };
      const updated = [...messages, toolResultMessage];
      setMessages(updated);
      processStream(
        updated.map(m => ({ role: m.role, content: m.content })),
        updated,
      );
    }
  }, [pendingAutoRespond, isStreaming, messages, processStream]);

  const sendMessage = useCallback(
    (text: string) => {
      if (isStreaming) return;

      const userMessage: ChatMessage = { role: 'user', content: text };
      const updated = [...messages, userMessage];
      setMessages(updated);

      // Build API messages (flatten content blocks to strings for simple messages)
      const apiMessages = updated.map(m => ({
        role: m.role,
        content: m.content,
      }));

      processStream(apiMessages, updated);
    },
    [messages, isStreaming, processStream],
  );

  const sendToolResult = useCallback(
    (toolUseId: string, content: string) => {
      if (isStreaming) return;

      const toolResultMessage: ChatMessage = {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: toolUseId, content }],
      };
      const updated = [...messages, toolResultMessage];
      setMessages(updated);

      const apiMessages = updated.map(m => ({
        role: m.role,
        content: m.content,
      }));

      processStream(apiMessages, updated);
    },
    [messages, isStreaming, processStream],
  );

  return (
    <ClaudeChatContext.Provider
      value={{
        isOpen,
        isConfigured,
        isStreaming,
        activeToolName,
        messages,
        togglePanel,
        openPanel,
        closePanel,
        sendMessage,
        sendToolResult,
        setContext,
        registerToolHandler,
        clearMessages,
        stopStreaming,
        tools,
        setTools,
      }}
    >
      {children}
    </ClaudeChatContext.Provider>
  );
}

export function useClaudeChat() {
  const ctx = useContext(ClaudeChatContext);
  if (!ctx) {
    throw new Error('useClaudeChat must be used within ClaudeChatProvider');
  }
  return ctx;
}
