export interface GitHubRepo {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string; avatar_url: string };
  description: string | null;
  private: boolean;
  open_issues_count: number;
  html_url: string;
  stargazers_count: number;
  default_branch: string;
  permissions?: {
    admin: boolean;
    push: boolean;
    pull: boolean;
  };
}

export interface QuickdrawBadgeTemplate {
  id: string;
  title: string;
  body: string;
}

export interface CoAuthor {
  name: string;
  email: string;
}

export interface YOLOBadgeTemplate {
  id: string;
  title: string;
  branchName: string;
  filePath: string;
  fileContent: string;
  coAuthors: CoAuthor[];
}

export interface PRTemplate {
  id: string;
  title: string;
  body: string;
  branchName: string;
  filePath: string;
  fileContent: string;
}

export interface PairTemplate {
  id: string;
  title: string;
  body: string;
  branchName: string;
  files: { path: string; content: string }[];
  coAuthors: CoAuthor[];
}

export interface CreatedItem {
  id: string;
  title: string;
  type: 'quickdraw_badge' | 'yolo_badge' | 'prs' | 'pair';
  status: 'pending' | 'creating' | 'merging' | 'success' | 'merged' | 'error';
  substatus?: string;
  url?: string;
  error?: string;
  number?: number;
  merged?: boolean;
  branchName?: string;
}

export type TokenType = 'classic' | 'fine-grained' | 'unknown';

export interface TokenInfo {
  type: TokenType;
  scopes: string[];
  hasRepoScope: boolean;
}

export type AppMode = 'quickdraw_badge' | 'yolo_badge' | 'prs' | 'pair';
export type MergeMethod = 'merge' | 'squash' | 'rebase';
