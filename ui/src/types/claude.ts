export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

export interface ToolUseProposal {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ConfigChange {
  path: string;
  value: unknown;
  reason: string;
}

export interface AnalysisSummary {
  totalImages: number;
  duplicateGroupCount: number;
  blurryCount: number;
  darkCount: number;
  brightCount: number;
  tooSmallCount: number;
}

export interface ChatContext {
  page: string;
  jobConfig?: unknown;
  jobData?: unknown;
  logTail?: string;
  lossData?: unknown;
  deviceType?: string;
  datasetName?: string;
  imageList?: string[];
  analysisAvailable?: boolean;
  analysisSummary?: AnalysisSummary;
}

export interface ChatSession {
  id: string;
  messages: ChatMessage[];
  context?: ChatContext;
  createdAt: number;
}

export interface StreamEvent {
  type:
    | 'content_block_delta'
    | 'content_block_start'
    | 'content_block_stop'
    | 'message_stop'
    | 'error'
    | 'tool_progress'
    | 'tool_completed';
  delta?: { type: string; text?: string };
  content_block?: ContentBlock;
  index?: number;
  error?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}
