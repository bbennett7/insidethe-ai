'use client';

import { usePathname } from 'next/navigation';
import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { useEffect } from 'react';

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
if (typeof window !== 'undefined' && key) {
  posthog.init(key, {
    api_host: 'https://us.i.posthog.com',
    // Disabled — we capture pageviews manually via PostHogPageView to handle
    // Next.js App Router client-side navigation correctly.
    capture_pageview: false,
    autocapture: false,
  });
}

function PostHogPageView() {
  const pathname = usePathname();
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger for pageview on route change
  useEffect(() => {
    posthog.capture('$pageview', { $current_url: window.location.href });
  }, [pathname]);
  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <PHProvider client={posthog}>
      <PostHogPageView />
      {children}
    </PHProvider>
  );
}
