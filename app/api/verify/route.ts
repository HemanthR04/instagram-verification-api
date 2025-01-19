/* eslint-disable @typescript-eslint/no-unused-vars */
// app/api/verify/route.ts
import { chromium } from 'playwright-core';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

// Rate limiting setup
const RATE_LIMIT_DURATION = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS = 100;
const requestCounts = new Map<string, { count: number; timestamp: number }>();

export async function POST(request: Request) {
  try {
    // Rate limiting
    const headersList = await headers();
    const clientIp = headersList.get('x-forwarded-for') || 'unknown';
    const now = Date.now();
    const clientRequests = requestCounts.get(clientIp);

    if (clientRequests) {
      if (now - clientRequests.timestamp < RATE_LIMIT_DURATION) {
        if (clientRequests.count >= MAX_REQUESTS) {
          return NextResponse.json(
            { error: 'Too many requests' },
            { status: 429 }
          );
        }
        clientRequests.count++;
      } else {
        clientRequests.count = 1;
        clientRequests.timestamp = now;
      }
    } else {
      requestCounts.set(clientIp, { count: 1, timestamp: now });
    }

    // Parse request body
    const body = await request.json();
    const { username, code } = body;

    if (!username || !code) {
      return NextResponse.json(
        { error: 'Missing username or code' },
        { status: 400 }
      );
    }

    // Launch browser
    const browser = await chromium.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    try {
      // Visit Instagram profile
      await page.goto(`https://www.instagram.com/${username}/`);
      
      // Wait for bio section to load
      await page.waitForSelector('header', { timeout: 5000 });
      
      // Get bio text
      const bioContent = await page.$eval('header', (el) => el.textContent);
      
      // Check if verification code exists in bio
      const verified = bioContent?.includes(code);
      
      await browser.close();
      
      return NextResponse.json({ verified });
    } catch (error) {
      await browser.close();
      return NextResponse.json({ verified: false });
    }
  } catch (error) {
    console.error('Verification error:', error);
    return NextResponse.json(
      { error: 'Failed to verify Instagram profile' },
      { status: 500 }
    );
  }
}

// Optionally, handle other HTTP methods
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}