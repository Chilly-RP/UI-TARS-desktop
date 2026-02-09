/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Get a local date string in YYYY-MM-DD format from a timestamp.
 * Uses local timezone instead of UTC to avoid date misclassification
 * (e.g., UTC+8 users having 00:00-07:59 records attributed to the previous day).
 */
export function getLocalDateString(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
