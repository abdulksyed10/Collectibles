import React from 'react';
import { Analytics } from '@vercel/analytics/react';
import { safeAnalyticsEvent } from '../lib/analytics';
export function AppAnalytics() { return process.env.EXPO_PUBLIC_ENABLE_WEB_ANALYTICS==='true' ? <Analytics beforeSend={event=>safeAnalyticsEvent(event)} /> : null; }
