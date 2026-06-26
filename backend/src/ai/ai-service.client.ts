/**
 * AI Service Client
 * 
 * NestJS service for calling the Python FastAPI AI service.
 * Handles:
 * - Chat/conversation processing
 * - Ticket classification & routing
 * - Call summarization
 * - Knowledge base search
 * - Agent handoff decisions
 */

import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface ChatRequest {
  message: string;
  sessionId?: string;
  context?: Record<string, unknown>;
}

interface ChatResponse {
  response: string;
  sessionId: string;
  agentType: string;
  toolCalls?: Array<{
    name: string;
    arguments: Record<string, unknown>;
    result: unknown;
  }>;
  metadata?: Record<string, unknown>;
}

interface SummarizeRequest {
  callSid: string;
  transcript: Array<{ role: string; content: string }>;
  metadata?: Record<string, unknown>;
}

interface SummarizeResponse {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  resolution: 'resolved' | 'escalated' | 'pending';
}

interface ClassifyRequest {
  text: string;
  context?: Record<string, unknown>;
}

interface ClassifyResponse {
  category: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  suggestedQueue: string;
  confidence: number;
}

interface KnowledgeSearchRequest {
  query: string;
  organizationId?: string;
  limit?: number;
}

interface KnowledgeSearchResponse {
  results: Array<{
    content: string;
    source: string;
    relevance: number;
  }>;
}

@Injectable()
export class AiServiceClient {
  private readonly logger = new Logger(AiServiceClient.name);
  private readonly baseUrl: string;
  private readonly timeout: number = 30000;

  constructor(private configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('AI_SERVICE_URL') || 'http://localhost:8081';
    this.logger.log(`AI Service URL: ${this.baseUrl}`);
  }

  /**
   * Process a chat message through the AI agent pipeline
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    return this.post<ChatResponse>('/api/chat', request);
  }

  /**
   * Start a new chat session with greeting
   */
  async startSession(ueCode?: string, phone?: string): Promise<ChatResponse> {
    return this.post<ChatResponse>('/api/chat/start', { ue_code: ueCode, phone });
  }

  /**
   * Set context for a session (after caller identification)
   */
  async setSessionContext(
    sessionId: string,
    context: {
      organizationId?: string;
      contactId?: string;
      ueCode?: string;
    },
  ): Promise<{ success: boolean }> {
    return this.post('/api/session/context', { session_id: sessionId, ...context });
  }

  /**
   * Get session information
   */
  async getSession(sessionId: string): Promise<{
    sessionId: string;
    history: Array<{ role: string; content: string }>;
    context: Record<string, unknown>;
  }> {
    return this.get(`/api/session/${sessionId}`);
  }

  /**
   * End a session
   */
  async endSession(sessionId: string): Promise<{ success: boolean }> {
    return this.delete(`/api/session/${sessionId}`);
  }

  /**
   * Summarize a call transcript
   */
  async summarizeCall(request: SummarizeRequest): Promise<SummarizeResponse> {
    return this.post<SummarizeResponse>('/api/summarize', request);
  }

  /**
   * Classify ticket/issue for routing
   */
  async classifyIssue(request: ClassifyRequest): Promise<ClassifyResponse> {
    return this.post<ClassifyResponse>('/api/classify', request);
  }

  /**
   * Search knowledge base
   */
  async searchKnowledge(request: KnowledgeSearchRequest): Promise<KnowledgeSearchResponse> {
    return this.post<KnowledgeSearchResponse>('/api/knowledge/search', request);
  }

  /**
   * Get available agents and their tools
   */
  async getAgents(): Promise<Array<{ name: string; description: string; tools: string[] }>> {
    return this.get('/api/agents');
  }

  /**
   * Health check for AI service
   */
  async healthCheck(): Promise<{ status: string; model: string }> {
    return this.get('/health');
  }

  // ============== Private HTTP helpers ==============

  private async get<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        throw new HttpException(
          `AI Service error: ${error}`,
          response.status,
        );
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof HttpException) throw error;
      
      this.logger.error(`AI Service GET ${path} failed: ${error.message}`);
      throw new HttpException(
        'AI Service unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        throw new HttpException(
          `AI Service error: ${error}`,
          response.status,
        );
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof HttpException) throw error;

      this.logger.error(`AI Service POST ${path} failed: ${error.message}`);
      throw new HttpException(
        'AI Service unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private async delete<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        throw new HttpException(
          `AI Service error: ${error}`,
          response.status,
        );
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof HttpException) throw error;

      this.logger.error(`AI Service DELETE ${path} failed: ${error.message}`);
      throw new HttpException(
        'AI Service unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
