// Read-only shape of historical GitHub analysis archives.
export interface GitHubAnalysisFields {
  summary: string;
  features: string[];
  useCases: string[];
  techStack: string[];
  tags: string[];
}

export interface GitHubAnalysis extends GitHubAnalysisFields {
  model: string;
  provider: string;
  generatedAt: number;
}
