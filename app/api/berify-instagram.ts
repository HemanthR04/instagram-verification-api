/* eslint-disable @typescript-eslint/no-unused-vars */
// pages/api/verify-instagram.ts
import { chromium } from 'playwright-core';
import chromiumDriver from '@playwright/test';
import { NextApiRequest, NextApiResponse } from 'next';

// Rate limiting setup
const RATE_LIMIT_DURATION = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS = 100;
const requestCounts = new Map<string, { count: number; timestamp: number }>();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Basic rate limiting
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const now = Date.now();
  const clientRequests = requestCounts.get(String(clientIp));

  if (clientRequests) {
    if (now - clientRequests.timestamp < RATE_LIMIT_DURATION) {
      if (clientRequests.count >= MAX_REQUESTS) {
        return res.status(429).json({ error: 'Too many requests' });
      }
      clientRequests.count++;
    } else {
      clientRequests.count = 1;
      clientRequests.timestamp = now;
    }
  } else {
    requestCounts.set(String(clientIp), { count: 1, timestamp: now });
  }

  const { username, code } = req.body;

  if (!username || !code) {
    return res.status(400).json({ error: 'Missing username or code' });
  }

  try {
    // Launch browser
    const browser = await chromium.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Visit Instagram profile
    await page.goto(`https://www.instagram.com/${username}/`);
    
    try {
      // Wait for bio section to load
      await page.waitForSelector('header', { timeout: 5000 });
      
      // Get bio text
      const bioContent = await page.$eval('header', (el) => el.textContent);
      
      // Check if verification code exists in bio
      const verified = bioContent?.includes(code);
      
      await browser.close();
      
      return res.status(200).json({ verified });
    } catch (error) {
      await browser.close();
      return res.status(200).json({ verified: false });
    }
  } catch (error) {
    console.error('Verification error:', error);
    return res.status(500).json({ error: 'Failed to verify Instagram profile' });
  }
}