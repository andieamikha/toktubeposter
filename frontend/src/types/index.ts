// ==================== ENUMS ====================
export enum UserRole {
  ADMIN = 'admin',
  OPERATOR = 'operator',
}

export enum NicheType {
  BISNIS = 'bisnis',
  KESEHATAN = 'kesehatan',
  FITNES = 'fitnes',
  EDUKASI = 'edukasi',
  HIBURAN = 'hiburan',
  TEKNOLOGI = 'teknologi',
  KULINER = 'kuliner',
  TRAVEL = 'travel',
  FASHION = 'fashion',
  KEUANGAN = 'keuangan',
}

export enum ContentStatus {
  DRAFT = 'draft',
  AI_GENERATED = 'ai_generated',
  READY = 'ready',
  USED = 'used',
}

export enum PostStatus {
  PENDING = 'pending',
  NOTIFIED = 'notified',
  DONE = 'done',
  LATE = 'late',
  MISSED = 'missed',
}

export enum UploadStatus {
  IDLE = 'idle',
  DOWNLOADING = 'downloading',
  UPLOADING = 'uploading',
  PROCESSING = 'processing',
  PUBLISHED = 'published',
  FAILED = 'failed',
}

export enum BatchStatus {
  PREVIEW = 'preview',
  PUBLISHED = 'published',
  CANCELLED = 'cancelled',
}

// ==================== ENTITIES ====================
export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  telegramChatId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TikTokAccount {
  id: string;
  username: string;
  displayName: string;
  niche: NicheType;
  defaultOperatorId: string | null;
  defaultOperator?: User;
  isActive: boolean;
  // TikTok OAuth
  tiktokOpenId: string | null;
  isOauthConnected: boolean;
  // Browser Login
  loginMethod: 'none' | 'credentials' | 'cookies';
  isBrowserLoggedIn: boolean;
  lastBrowserLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface YouTubeAccount {
  id: string;
  channelName: string;
  channelUrl: string | null;
  email: string | null;
  niche: NicheType;
  defaultOperatorId: string | null;
  defaultOperator?: User;
  isActive: boolean;
  loginMethod: 'none' | 'credentials' | 'cookies';
  isBrowserLoggedIn: boolean;
  lastBrowserLoginAt: string | null;
  // YouTube API OAuth
  isApiConnected: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AiOption {
  caption: string;
  hashtags: string[];
}

export interface Content {
  id: string;
  tiktokAccountId: string;
  tiktokAccount?: TikTokAccount;
  createdById: string;
  createdBy?: User;
  driveUrl: string | null;
  briefTopic: string;
  briefPoints: string[];
  targetAudience: string;
  tone: string;
  nicheTemplate: NicheType;
  aiOptions: AiOption[] | null;
  selectedOptionIndex: number | null;
  finalCaption: string | null;
  finalHashtags: string[] | null;
  status: ContentStatus;
  usedCount: number;
  // Upload queue fields
  uploadStatus: string;
  uploadPlatform: string | null;
  uploadMethod: string | null;
  uploadError: string | null;
  uploadAccountId: string | null;
  uploadPrivacy: string | null;
  uploadStartedAt: string | null;
  uploadCompletedAt: string | null;
  uploadResultUrl: string | null;
  uploadQueuedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledPost {
  id: string;
  contentId: string;
  content?: Content;
  tiktokAccountId: string;
  tiktokAccount?: TikTokAccount;
  assignedOperatorId: string;
  assignedOperator?: User;
  scheduledAt: string;
  status: PostStatus;
  tiktokUrl: string | null;
  postedAt: string | null;
  batchId: string | null;
  // Upload fields
  uploadStatus: UploadStatus | string;
  uploadError: string | null;
  tiktokPublishId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BulkBatch {
  id: string;
  createdById: string;
  createdBy?: User;
  targetDate: string;
  frequencyMinMinutes: number;
  frequencyMaxMinutes: number;
  totalScheduled: number;
  previewData: SchedulePreview[];
  status: BatchStatus;
  createdAt: string;
}

export interface SchedulePreview {
  contentId: string;
  tiktokAccountId: string;
  scheduledAt: string;
  assignedOperatorId: string;
  accountUsername?: string;
  operatorName?: string;
  contentTopic?: string;
}

export interface Notification {
  id: string;
  scheduledPostId: string;
  scheduledPost?: ScheduledPost;
  type: string;
  status: string;
  sentAt: string | null;
  errorMessage: string | null;
}

// ==================== API RESPONSES ====================
export interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: User;
}

export interface DashboardStats {
  date: string;
  overall: {
    total: number;
    done: number;
    pending: number;
    late: number;
    missed: number;
    completionRate: number;
  };
  byOperator: {
    operatorId: string;
    operatorName: string;
    total: number;
    done: number;
    completionRate: number;
  }[];
  byAccount: {
    accountId: string;
    accountUsername: string;
    total: number;
    done: number;
    completionRate: number;
  }[];
}

export interface BulkPreviewRequest {
  targetDate: string;
  frequencyMinMinutes: number;
  frequencyMaxMinutes: number;
}

export interface BulkPreviewResponse {
  batchId: string;
  previewData: SchedulePreview[];
  totalScheduled: number;
}
