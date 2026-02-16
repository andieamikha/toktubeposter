// Status for scheduled posts
export enum PostStatus {
  SCHEDULED = 'scheduled',
  DUE = 'due',
  OVERDUE = 'overdue',
  MISSED = 'missed',
  DONE = 'done',
  CANCELED = 'canceled',
}

// Status for content
export enum ContentStatus {
  DRAFT = 'draft',
  AI_GENERATED = 'ai_generated',
  READY = 'ready',
  USED = 'used',
}

// User roles
export enum UserRole {
  ADMIN = 'admin',
  OPERATOR = 'operator',
}

// Niche types
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

// Batch status
export enum BatchStatus {
  PREVIEW = 'preview',
  PUBLISHED = 'published',
  CANCELED = 'canceled',
}

// Notification types
export enum NotificationType {
  REMINDER_30M = 'reminder_30m',
  REMINDER_5M = 'reminder_5m',
  OVERDUE = 'overdue',
}

// Notification status
export enum NotificationStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
}

// TikTok URL validation regex
export const TIKTOK_URL_REGEX = /^https:\/\/www\.tiktok\.com\/.+/;

// Posting window (WIB = UTC+7)
export const POSTING_WINDOW = {
  START_HOUR_WIB: 8,
  END_HOUR_WIB: 22,
  START_HOUR_UTC: 1,
  END_HOUR_UTC: 15,
};

// Status timing
export const STATUS_TIMING = {
  GRACE_MINUTES: 30,
  MISSED_MINUTES: 120,
};

// Upload status for direct TikTok upload
export enum UploadStatus {
  IDLE = 'idle',
  DOWNLOADING = 'downloading',
  UPLOADING = 'uploading',
  PROCESSING = 'processing',
  PUBLISHED = 'published',
  FAILED = 'failed',
}

// Privacy levels for TikTok Content Posting API
export enum TikTokPrivacyLevel {
  PUBLIC = 'PUBLIC_TO_EVERYONE',
  FRIENDS = 'MUTUAL_FOLLOW_FRIENDS',
  FOLLOWERS = 'FOLLOWER_OF_CREATOR',
  SELF_ONLY = 'SELF_ONLY',
}

// Min gap between posts (hours)
export const MIN_POST_GAP_HOURS = 2;
