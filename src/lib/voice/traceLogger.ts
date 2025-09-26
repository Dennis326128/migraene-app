export interface TraceStep {
  id: string;
  step: 'STT' | 'PARSER' | 'DTO' | 'DB_INSERT' | 'WEATHER' | 'ERROR';
  timestamp: string;
  correlationId: string;
  data: any;
  status: 'started' | 'completed' | 'failed';
  error?: string;
  duration?: number;
}

export class VoiceTraceLogger {
  private traces: TraceStep[] = [];
  private correlationId: string;
  private startTime: number;

  constructor() {
    this.correlationId = `voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.startTime = Date.now();
    console.log(`🔍 [TRACE] Starting voice entry with correlation ID: ${this.correlationId}`);
  }

  addStep(step: TraceStep['step'], status: TraceStep['status'], data: any, error?: string): string {
    const stepId = `${step}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const trace: TraceStep = {
      id: stepId,
      step,
      timestamp: new Date().toISOString(),
      correlationId: this.correlationId,
      data,
      status,
      error,
      duration: status === 'completed' ? Date.now() - this.startTime : undefined
    };

    this.traces.push(trace);
    
    const emoji = status === 'completed' ? '✅' : status === 'failed' ? '❌' : '⏳';
    console.log(`🔍 [TRACE] ${emoji} ${step} (${status})`, { 
      correlationId: this.correlationId,
      stepId,
      data: JSON.stringify(data).substring(0, 200),
      error
    });

    return stepId;
  }

  getTraces(): TraceStep[] {
    return [...this.traces];
  }

  getCorrelationId(): string {
    return this.correlationId;
  }

  getSummary(): { 
    totalSteps: number; 
    completed: number; 
    failed: number; 
    totalDuration: number;
    lastError?: string;
  } {
    const completed = this.traces.filter(t => t.status === 'completed').length;
    const failed = this.traces.filter(t => t.status === 'failed').length;
    const failedTraces = this.traces.filter(t => t.status === 'failed');
    const lastError = failedTraces.length > 0 ? failedTraces[failedTraces.length - 1].error : undefined;
    
    return {
      totalSteps: this.traces.length,
      completed,
      failed,
      totalDuration: Date.now() - this.startTime,
      lastError
    };
  }
}

export function createTraceLogger(): VoiceTraceLogger {
  return new VoiceTraceLogger();
}