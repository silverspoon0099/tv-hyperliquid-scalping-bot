interface Metrics {
  webhooksReceived: number;
  webhooksProcessed: number;
  webhookErrors: number;
  positionsOpened: number;
  positionsClosed: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
  startTime: number;
}

class MetricsCollector {
  private metrics: Metrics = {
    webhooksReceived: 0,
    webhooksProcessed: 0,
    webhookErrors: 0,
    positionsOpened: 0,
    positionsClosed: 0,
    totalLatencyMs: 0,
    avgLatencyMs: 0,
    startTime: Date.now(),
  };

  recordWebhookReceived(): void {
    this.metrics.webhooksReceived++;
  }

  recordWebhookProcessed(latencyMs: number): void {
    this.metrics.webhooksProcessed++;
    this.metrics.totalLatencyMs += latencyMs;
    this.metrics.avgLatencyMs = Math.round(
      this.metrics.totalLatencyMs / this.metrics.webhooksProcessed
    );
  }

  recordWebhookError(): void {
    this.metrics.webhookErrors++;
  }

  recordPositionOpened(): void {
    this.metrics.positionsOpened++;
  }

  recordPositionClosed(): void {
    this.metrics.positionsClosed++;
  }

  getMetrics(): Metrics {
    return { ...this.metrics };
  }

  reset(): void {
    this.metrics = {
      webhooksReceived: 0,
      webhooksProcessed: 0,
      webhookErrors: 0,
      positionsOpened: 0,
      positionsClosed: 0,
      totalLatencyMs: 0,
      avgLatencyMs: 0,
      startTime: Date.now(),
    };
  }
}

export const metricsCollector = new MetricsCollector();
