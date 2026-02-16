import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as puppeteer from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs';
import { TiktokAccount } from '../tiktok-accounts/entities/tiktok-account.entity';

const TIKTOK_LOGIN_URL = 'https://www.tiktok.com/login/phone-or-email/email';
const TIKTOK_UPLOAD_URL = 'https://www.tiktok.com/tiktokstudio/upload';
const TIKTOK_UPLOAD_URL_FALLBACK = 'https://www.tiktok.com/creator#/upload?scene=creator_center';
const USER_DATA_DIR = path.join(process.cwd(), 'data', 'browser-profiles');
const SCREENSHOTS_DIR = path.join(process.cwd(), 'data', 'upload-screenshots');

@Injectable()
export class TiktokBrowserService {
  private readonly logger = new Logger(TiktokBrowserService.name);

  constructor(
    @InjectRepository(TiktokAccount)
    private accountsRepo: Repository<TiktokAccount>,
  ) {
    // Ensure directories exist
    if (!fs.existsSync(USER_DATA_DIR)) {
      fs.mkdirSync(USER_DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(SCREENSHOTS_DIR)) {
      fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    }
  }

  /**
   * Take a debug screenshot
   */
  private async takeScreenshot(page: puppeteer.Page, accountId: string, step: string): Promise<string> {
    const filename = `${accountId}_${step}_${Date.now()}.png`;
    const filepath = path.join(SCREENSHOTS_DIR, filename);
    try {
      await page.screenshot({ path: filepath, fullPage: true });
      this.logger.log(`Screenshot saved: ${filename}`);
    } catch (e: any) {
      this.logger.warn(`Failed to take screenshot: ${e.message}`);
    }
    return filepath;
  }

  /**
   * Get a profile directory per account (to persist sessions)
   */
  private getProfileDir(accountId: string): string {
    const dir = path.join(USER_DATA_DIR, accountId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  /**
   * Launch browser with optional account-specific profile
   */
  private async launchBrowser(accountId: string, headless = true): Promise<puppeteer.Browser> {
    const profileDir = this.getProfileDir(accountId);
    return puppeteer.launch({
      headless: headless ? true : false,
      userDataDir: profileDir,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1280,800',
      ],
      defaultViewport: { width: 1280, height: 800 },
    });
  }

  /**
   * Apply stealth techniques to a page
   */
  private async applyStealthToPage(page: puppeteer.Page): Promise<void> {
    // Override navigator.webdriver
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      // Override plugins length
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      // Override languages
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en', 'id'] });
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    );
  }

  /**
   * Login using username + password
   */
  async loginWithCredentials(accountId: string): Promise<{ success: boolean; message: string }> {
    const account = await this.accountsRepo.findOne({ where: { id: accountId } });
    if (!account) throw new BadRequestException('Akun tidak ditemukan.');
    if (!account.username || !account.tiktokPassword) {
      throw new BadRequestException('Username atau password TikTok belum diisi.');
    }

    let browser: puppeteer.Browser | null = null;
    try {
      browser = await this.launchBrowser(accountId, true);
      const page = await browser.newPage();
      await this.applyStealthToPage(page);

      this.logger.log(`[${account.username}] Navigating to TikTok login page...`);
      await page.goto(TIKTOK_LOGIN_URL, { waitUntil: 'networkidle2', timeout: 30000 });

      // Wait for login form
      await page.waitForSelector('input[name="username"], input[type="text"]', { timeout: 15000 });
      await this.randomDelay(500, 1000);

      // Type username
      const usernameInput = await page.$('input[name="username"]') || await page.$('input[type="text"]');
      if (usernameInput) {
        await usernameInput.click({ clickCount: 3 });
        await usernameInput.type(account.username, { delay: 50 + Math.random() * 80 });
      }

      await this.randomDelay(300, 700);

      // Type password
      const passwordInput = await page.$('input[type="password"]');
      if (passwordInput) {
        await passwordInput.click();
        await passwordInput.type(account.tiktokPassword, { delay: 50 + Math.random() * 80 });
      }

      await this.randomDelay(500, 1000);

      // Click login button
      const loginBtn = await page.$('button[type="submit"]');
      if (loginBtn) {
        await loginBtn.click();
      }

      // Wait for navigation or error
      try {
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
      } catch {
        // Navigation may not trigger, check URL instead
      }

      await this.randomDelay(2000, 3000);

      // Check if login was successful by checking URL or page content
      const currentUrl = page.url();
      const isLoggedIn = !currentUrl.includes('/login') && !currentUrl.includes('/signup');

      if (isLoggedIn) {
        // Save cookies
        const cookies = await page.cookies();
        await this.saveCookies(accountId, cookies as any);

        this.logger.log(`[${account.username}] Login successful!`);
        return { success: true, message: 'Login berhasil!' };
      }

      // Check for CAPTCHA or error messages
      const errorText = await page.evaluate(() => {
        const errEl = document.querySelector('[class*="error"], [class*="Error"], .tiktok-error');
        return errEl?.textContent || '';
      });

      if (errorText) {
        this.logger.warn(`[${account.username}] Login error: ${errorText}`);
        return { success: false, message: `Login gagal: ${errorText}` };
      }

      // Might be CAPTCHA
      return {
        success: false,
        message: 'Login memerlukan verifikasi CAPTCHA. Coba gunakan login cookies sebagai alternatif.',
      };
    } catch (error: any) {
      this.logger.error(`[${account.username}] Login failed: ${error.message}`);
      throw new BadRequestException(`Login gagal: ${error.message}`);
    } finally {
      if (browser) await browser.close();
    }
  }

  /**
   * Login using cookies (set cookies from user-provided JSON)
   */
  async loginWithCookies(accountId: string, cookiesJson: string): Promise<{ success: boolean; message: string }> {
    const account = await this.accountsRepo.findOne({ where: { id: accountId } });
    if (!account) throw new BadRequestException('Akun tidak ditemukan.');

    let cookies: any[];
    try {
      cookies = JSON.parse(cookiesJson);
      if (!Array.isArray(cookies)) {
        throw new Error('Format cookies harus berupa array JSON.');
      }
    } catch (e: any) {
      throw new BadRequestException(`Format cookies tidak valid: ${e.message}`);
    }

    let browser: puppeteer.Browser | null = null;
    try {
      browser = await this.launchBrowser(accountId, true);
      const page = await browser.newPage();
      await this.applyStealthToPage(page);

      // Convert EditThisCookie / browser-extension format to Puppeteer format
      const sameSiteMap: Record<string, 'Strict' | 'Lax' | 'None'> = {
        'strict': 'Strict',
        'lax': 'Lax',
        'none': 'None',
        'no_restriction': 'None',
        'unspecified': 'Lax',
      };

      const puppeteerCookies = cookies
        .filter((c: any) => c.name && c.value) // skip empty cookies
        .map((c: any) => {
          const cookie: any = {
            name: c.name,
            value: c.value,
            domain: c.domain || '.tiktok.com',
            path: c.path || '/',
            httpOnly: c.httpOnly ?? false,
            secure: c.secure ?? true,
          };
          // Map expirationDate (EditThisCookie) → expires (Puppeteer)
          if (c.expirationDate && !c.session) {
            cookie.expires = Math.floor(c.expirationDate);
          }
          // Map sameSite values
          const ss = String(c.sameSite || '').toLowerCase();
          cookie.sameSite = sameSiteMap[ss] || 'Lax';
          return cookie;
        });

      await page.setCookie(...puppeteerCookies);

      this.logger.log(`[${account.username}] Set ${puppeteerCookies.length} cookies, verifying login...`);

      // Navigate to TikTok to verify
      await page.goto('https://www.tiktok.com/', { waitUntil: 'networkidle2', timeout: 30000 });
      await this.randomDelay(2000, 4000);

      // Check login status
      const isLoggedIn = await this.checkLoginStatus(page);

      if (isLoggedIn) {
        // Save verified cookies
        const freshCookies = await page.cookies();
        await this.saveCookies(accountId, freshCookies as any);

        this.logger.log(`[${account.username}] Cookie login successful!`);
        return { success: true, message: 'Login dengan cookies berhasil!' };
      }

      return { success: false, message: 'Cookies tidak valid atau sudah kedaluwarsa.' };
    } catch (error: any) {
      this.logger.error(`[${account.username}] Cookie login failed: ${error.message}`);
      throw new BadRequestException(`Login cookies gagal: ${error.message}`);
    } finally {
      if (browser) await browser.close();
    }
  }

  /**
   * Check if the browser session is still logged in
   */
  async verifyLogin(accountId: string): Promise<{ loggedIn: boolean; username?: string }> {
    const account = await this.accountsRepo.findOne({ where: { id: accountId } });
    if (!account) throw new BadRequestException('Akun tidak ditemukan.');

    let browser: puppeteer.Browser | null = null;
    try {
      browser = await this.launchBrowser(accountId, true);
      const page = await browser.newPage();
      await this.applyStealthToPage(page);

      // Load saved cookies
      await this.loadCookies(accountId, page);

      await page.goto('https://www.tiktok.com/', { waitUntil: 'networkidle2', timeout: 30000 });
      await this.randomDelay(2000, 3000);

      const loggedIn = await this.checkLoginStatus(page);

      if (loggedIn) {
        await this.accountsRepo.update(accountId, {
          isBrowserLoggedIn: true,
          lastBrowserLoginAt: new Date(),
        });
      } else {
        await this.accountsRepo.update(accountId, { isBrowserLoggedIn: false });
      }

      return { loggedIn, username: account.username };
    } catch (error: any) {
      this.logger.error(`[${account.username}] Verify login failed: ${error.message}`);
      return { loggedIn: false };
    } finally {
      if (browser) await browser.close();
    }
  }

  /**
   * Upload video to TikTok via browser automation
   */
  async uploadVideo(
    accountId: string,
    videoFilePath: string,
    caption: string,
  ): Promise<{ success: boolean; message: string }> {
    const account = await this.accountsRepo.findOne({ where: { id: accountId } });
    if (!account) throw new BadRequestException('Akun tidak ditemukan.');

    if (!account.isBrowserLoggedIn && account.loginMethod === 'none') {
      throw new BadRequestException('Akun belum login ke TikTok. Silakan login terlebih dahulu.');
    }

    if (!fs.existsSync(videoFilePath)) {
      throw new BadRequestException('File video tidak ditemukan.');
    }

    let browser: puppeteer.Browser | null = null;
    try {
      browser = await this.launchBrowser(accountId, true);
      const page = await browser.newPage();
      await this.applyStealthToPage(page);

      // Load saved cookies
      await this.loadCookies(accountId, page);

      this.logger.log(`[${account.username}] Navigating to TikTok upload page...`);

      // Try TikTok Studio first, fallback to old creator URL
      let uploadUrl = TIKTOK_UPLOAD_URL;
      await page.goto(uploadUrl, { waitUntil: 'networkidle2', timeout: 40000 });
      await this.randomDelay(3000, 5000);

      let currentUrl = page.url();
      this.logger.log(`[${account.username}] Current URL after navigation: ${currentUrl}`);

      // Check if redirected to login
      if (currentUrl.includes('/login')) {
        await this.takeScreenshot(page, accountId, 'redirected_to_login');
        throw new BadRequestException('Sesi login sudah kedaluwarsa. Silakan login ulang.');
      }

      // If TikTok Studio didn't load an upload interface, try fallback
      let fileInput = await page.$('input[type="file"]');
      if (!fileInput) {
        this.logger.log(`[${account.username}] No file input on TikTok Studio, trying fallback URL...`);
        await page.goto(TIKTOK_UPLOAD_URL_FALLBACK, { waitUntil: 'networkidle2', timeout: 40000 });
        await this.randomDelay(3000, 5000);
        currentUrl = page.url();
        this.logger.log(`[${account.username}] Fallback URL: ${currentUrl}`);
      }

      await this.takeScreenshot(page, accountId, '01_upload_page');

      // === STEP 1: Upload video file ===
      this.logger.log(`[${account.username}] Looking for file input...`);

      // Find the file input element across main page and iframes
      fileInput = await page.$('input[type="file"][accept*="video"]')
        || await page.$('input[type="file"]');

      if (!fileInput) {
        // Try iframes
        const frames = page.frames();
        let foundInput = false;
        for (const frame of frames) {
          const input = await frame.$('input[type="file"]');
          if (input) {
            this.logger.log(`[${account.username}] Found file input in iframe`);
            await input.uploadFile(videoFilePath);
            foundInput = true;
            break;
          }
        }
        if (!foundInput) {
          await this.takeScreenshot(page, accountId, '01_no_file_input');
          throw new BadRequestException(
            'Tidak dapat menemukan input file upload di halaman TikTok. Pastikan akun sudah login dengan benar.',
          );
        }
      } else {
        this.logger.log(`[${account.username}] Found file input on main page`);
        await fileInput.uploadFile(videoFilePath);
      }

      this.logger.log(`[${account.username}] Video file selected, waiting for processing...`);
      await this.randomDelay(8000, 15000);
      await this.takeScreenshot(page, accountId, '02_after_file_select');

      // === STEP 2: Fill caption ===
      this.logger.log(`[${account.username}] Filling caption...`);

      // Wait for the caption editor to appear
      const captionSelector = [
        '[contenteditable="true"]',
        'div[data-text="true"]',
        '.DraftEditor-root',
        '.public-DraftEditor-content',
        '[class*="caption"] [contenteditable]',
        '[class*="editor"] [contenteditable]',
        '[data-e2e="caption-editor"]',
        '.notranslate[contenteditable]',
      ].join(', ');

      try {
        await page.waitForSelector(captionSelector, { timeout: 30000 });
      } catch {
        this.logger.warn(`[${account.username}] Caption editor not found, trying generic...`);
      }

      // Try multiple approaches to fill caption
      const captionFilled = await this.fillCaption(page, caption);
      if (!captionFilled) {
        this.logger.warn(`[${account.username}] Could not fill caption automatically.`);
      } else {
        this.logger.log(`[${account.username}] Caption filled successfully.`);
      }

      await this.randomDelay(2000, 4000);
      await this.takeScreenshot(page, accountId, '03_after_caption');

      // === STEP 3: Wait for video to finish processing ===
      this.logger.log(`[${account.username}] Waiting for video processing...`);
      await this.waitForVideoProcessing(page, account.username);
      await this.takeScreenshot(page, accountId, '04_after_processing');

      // === STEP 4: Click Post/Upload button ===
      this.logger.log(`[${account.username}] Looking for Post button...`);

      const posted = await this.clickPostButton(page);

      if (!posted) {
        await this.takeScreenshot(page, accountId, '05_no_post_button');
        throw new BadRequestException(
          'Tidak dapat menemukan tombol Post. Video mungkin masih diproses oleh TikTok. Cek screenshot di folder data/upload-screenshots.',
        );
      }

      this.logger.log(`[${account.username}] Post button clicked, waiting for completion...`);
      await this.takeScreenshot(page, accountId, '05_post_clicked');

      // Wait for upload to complete
      await this.waitForUploadComplete(page, account.username, accountId);

      await this.takeScreenshot(page, accountId, '06_final');

      // Update cookies after successful upload
      const freshCookies = await page.cookies();
      await this.saveCookies(accountId, freshCookies as any);

      this.logger.log(`[${account.username}] Video uploaded successfully!`);
      return { success: true, message: 'Video berhasil diupload ke TikTok!' };

    } catch (error: any) {
      this.logger.error(`[${account.username}] Upload failed: ${error.message}`);
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(`Upload gagal: ${error.message}`);
    } finally {
      if (browser) await browser.close();
    }
  }

  // ─── Helper Methods ─────────────────────────────────────────

  /**
   * Fill caption using multiple strategies
   */
  private async fillCaption(page: puppeteer.Page, caption: string): Promise<boolean> {
    const strategies = [
      // Strategy 1: contenteditable div
      async () => {
        const editor = await page.$('[contenteditable="true"]');
        if (editor) {
          await editor.click();
          await this.randomDelay(200, 400);
          // Clear existing content
          await page.keyboard.down('Control');
          await page.keyboard.press('KeyA');
          await page.keyboard.up('Control');
          await page.keyboard.press('Backspace');
          await this.randomDelay(200, 400);
          // Type caption character by character for natural behavior
          for (const char of caption) {
            await page.keyboard.type(char, { delay: 10 + Math.random() * 30 });
          }
          return true;
        }
        return false;
      },
      // Strategy 2: DraftJS editor
      async () => {
        const draftEditor = await page.$('.DraftEditor-root, .public-DraftEditor-content');
        if (draftEditor) {
          await draftEditor.click();
          await this.randomDelay(200, 400);
          await page.keyboard.down('Control');
          await page.keyboard.press('KeyA');
          await page.keyboard.up('Control');
          await page.keyboard.press('Backspace');
          for (const char of caption) {
            await page.keyboard.type(char, { delay: 10 + Math.random() * 30 });
          }
          return true;
        }
        return false;
      },
      // Strategy 3: Try all frames
      async () => {
        for (const frame of page.frames()) {
          const editor = await frame.$('[contenteditable="true"]');
          if (editor) {
            await editor.click();
            await page.keyboard.down('Control');
            await page.keyboard.press('KeyA');
            await page.keyboard.up('Control');
            await page.keyboard.press('Backspace');
            for (const char of caption) {
              await page.keyboard.type(char, { delay: 10 + Math.random() * 30 });
            }
            return true;
          }
        }
        return false;
      },
    ];

    for (const strategy of strategies) {
      try {
        const result = await strategy();
        if (result) return true;
      } catch {
        continue;
      }
    }
    return false;
  }

  /**
   * Wait for video processing to complete (progress bar)
   */
  private async waitForVideoProcessing(page: puppeteer.Page, username: string): Promise<void> {
    const maxWait = 90000; // 90 seconds
    const interval = 3000;
    let elapsed = 0;

    while (elapsed < maxWait) {
      // Check for processing indicators
      const status = await page.evaluate(() => {
        const body = document.body.innerText.toLowerCase();
        // Check if processing is done
        if (body.includes('uploaded') || body.includes('100%')) return 'done';
        // Check if still processing  
        if (body.includes('uploading') || body.includes('processing') || body.includes('mengunggah')) return 'processing';
        // Check for progress bar
        const progressBar = document.querySelector('[class*="progress"], [role="progressbar"]');
        if (progressBar) return 'processing';
        return 'unknown';
      });

      if (status === 'done') {
        this.logger.log(`[${username}] Video processing done after ${elapsed / 1000}s`);
        return;
      }

      if (status === 'processing') {
        this.logger.log(`[${username}] Video still processing... (${elapsed / 1000}s)`);
      }

      await this.randomDelay(interval, interval + 1000);
      elapsed += interval;
    }

    // After waiting, proceed anyway — the Post button check will determine if ready
    this.logger.warn(`[${username}] Video processing wait timed out after ${maxWait / 1000}s, proceeding...`);
  }

  /**
   * Click the Post/Upload button using multiple strategies
   */
  private async clickPostButton(page: puppeteer.Page): Promise<boolean> {
    // Strategy 1: Try CSS selectors
    const buttonSelectors = [
      '[class*="post-button"]',
      '[class*="submit"]',
      '[class*="btn-post"]',
      '[data-e2e="post-button"]',
      'button[class*="PostButton"]',
    ];

    for (const selector of buttonSelectors) {
      try {
        const btn = await page.$(selector);
        if (btn) {
          const isDisabled = await page.evaluate(el => (el as HTMLButtonElement).disabled, btn);
          if (!isDisabled) {
            this.logger.log(`Found Post button via selector: ${selector}`);
            await btn.click();
            return true;
          }
        }
      } catch {
        continue;
      }
    }

    // Strategy 2: Find by text content using evaluate
    try {
      const clicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        // Try exact match first
        for (const text of ['post', 'posting', 'upload', 'unggah', 'publish']) {
          const btn = buttons.find(b => {
            const t = b.textContent?.trim().toLowerCase() || '';
            return t === text && !b.disabled;
          });
          if (btn) {
            btn.click();
            return true;
          }
        }
        // Try contains match
        for (const text of ['post', 'upload', 'publish']) {
          const btn = buttons.find(b => {
            const t = b.textContent?.trim().toLowerCase() || '';
            return t.includes(text) && !b.disabled && t.length < 30;
          });
          if (btn) {
            btn.click();
            return true;
          }
        }
        return false;
      });
      if (clicked) return true;
    } catch {
      // Continue to next strategy
    }

    // Strategy 3: Check iframes
    for (const frame of page.frames()) {
      try {
        const clicked = await frame.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const postButton = buttons.find(
            (btn) => {
              const text = btn.textContent?.toLowerCase().trim() || '';
              return (text === 'post' || text === 'posting' || text === 'upload')
                && !btn.disabled;
            },
          );
          if (postButton) {
            postButton.click();
            return true;
          }
          return false;
        });
        if (clicked) return true;
      } catch {
        continue;
      }
    }

    return false;
  }

  /**
   * Wait for TikTok to finish processing and posting
   */
  private async waitForUploadComplete(page: puppeteer.Page, username: string, accountId?: string): Promise<void> {
    const maxWaitMs = 120000; // 2 minutes
    const checkInterval = 3000;
    let elapsed = 0;
    let lastStatus = '';
    const initialUrl = page.url();

    while (elapsed < maxWaitMs) {
      await this.randomDelay(checkInterval, checkInterval + 1000);
      elapsed += checkInterval;

      // Check page status using multiple strategies
      const result = await page.evaluate((initUrl) => {
        const text = document.body.innerText.toLowerCase();
        const url = window.location.href;
        const textSnippet = text.substring(0, 300).replace(/\s+/g, ' ');

        // === Strategy 1: URL changed away from upload page ===
        if (url !== initUrl) {
          // Navigated to content/manage/posts page = success
          if (url.includes('/content') || url.includes('/manage')
            || url.includes('/post') || url.includes('/creator')) {
            return { status: 'redirected', url, textSnippet };
          }
          // Any URL change away from upload is likely success
          if (!url.includes('/upload')) {
            return { status: 'redirected', url, textSnippet };
          }
        }

        // === Strategy 2: Success text indicators ===
        const successTexts = [
          'your video has been uploaded',
          'your video is being uploaded',
          'your video is being processed',
          'video has been published',
          'successfully',
          'manage your posts',
          'berhasil',
          'your post is on its way',
          'post uploaded',
          'video posted',
          'leaving this page won',
          'uploaded successfully',
          'video is live',
          'your video will be',
          'scheduled',
        ];
        for (const t of successTexts) {
          if (text.includes(t)) return { status: 'success', match: t, textSnippet };
        }

        // === Strategy 3: Success modal/dialog detection ===
        const successModal = document.querySelector(
          '[class*="success"], [class*="Success"], [class*="complete"], [class*="Complete"], ' +
          '[class*="posted"], [class*="Posted"], [class*="done-modal"], [class*="upload-complete"]'
        );
        if (successModal) {
          return { status: 'success', match: 'success-modal-element', textSnippet };
        }

        // Check for "Manage posts" or "View post" link/button (appears after success)
        const manageLink = document.querySelector(
          'a[href*="/content"], a[href*="/manage"], a[href*="/post"], ' +
          'button[class*="manage"], [data-e2e*="manage"]'
        );
        if (manageLink) {
          const linkText = (manageLink as HTMLElement).textContent?.toLowerCase() || '';
          if (linkText.includes('manage') || linkText.includes('view') || linkText.includes('post')) {
            return { status: 'success', match: `manage-link: ${linkText}`, textSnippet };
          }
        }

        // === Strategy 4: Check if upload form disappeared (no more file input / caption editor) ===
        const uploadForm = document.querySelector(
          'input[type="file"], [contenteditable="true"], .DraftEditor-root'
        );
        const hasUploadForm = !!uploadForm;
        // If we're still on upload URL but the form disappeared, might be showing result
        if (url.includes('/upload') && !hasUploadForm) {
          // Could be a success overlay or the page transitioned
          return { status: 'form-gone', textSnippet };
        }

        // === Strategy 5: Error indicators ===
        const errorTexts = [
          'failed to upload', 'upload failed', 'couldn\'t upload',
          'gagal upload', 'error', 'try again', 'too many requests',
        ];
        for (const t of errorTexts) {
          if (text.includes(t) && !text.includes('no error')) {
            return { status: 'error', match: t, textSnippet };
          }
        }

        // === Strategy 6: Still processing ===
        const processingTexts = ['uploading', 'processing', 'mengunggah', 'posting'];
        for (const t of processingTexts) {
          if (text.includes(t)) return { status: 'processing', match: t, textSnippet };
        }

        return { status: 'waiting', textSnippet };
      }, initialUrl);

      if (result.status !== lastStatus) {
        this.logger.log(`[${username}] Upload status: ${result.status} (${elapsed / 1000}s) ${result.url ? `url=${result.url}` : ''} ${(result as any).match ? `match=${(result as any).match}` : ''}`);
        lastStatus = result.status;
      }

      // Log page content snippet for debugging (first time and every 30s)
      if (elapsed <= checkInterval || elapsed % 30000 < checkInterval + 2000) {
        this.logger.debug(`[${username}] Page text: ${result.textSnippet}`);
      }

      if (result.status === 'success' || result.status === 'redirected') {
        this.logger.log(`[${username}] Upload confirmed: ${result.status} after ${elapsed / 1000}s`);
        return;
      }

      // form-gone after 10s likely means success (page transitioned away from upload form)
      if (result.status === 'form-gone' && elapsed > 10000) {
        this.logger.log(`[${username}] Upload form disappeared — assuming success after ${elapsed / 1000}s`);
        return;
      }

      if (result.status === 'error') {
        if (accountId) await this.takeScreenshot(page, accountId, '06_upload_error');
        throw new Error('TikTok menampilkan error saat upload. Cek screenshot di folder data/upload-screenshots.');
      }

      this.logger.log(`[${username}] Waiting for upload... (${elapsed / 1000}s)`);
    }

    // TIMEOUT — take screenshot for debugging, but treat as likely success
    // (TikTok often doesn't show clear success indicators; if Post button was clicked and no error shown, it's likely fine)
    if (accountId) await this.takeScreenshot(page, accountId, '06_upload_timeout');
    this.logger.warn(
      `[${username}] Upload wait timed out after ${maxWaitMs / 1000}s. ` +
      `No error detected — treating as likely success. Check TikTok Studio manually to confirm.`,
    );
  }

  /**
   * Check if page shows logged-in state
   */
  private async checkLoginStatus(page: puppeteer.Page): Promise<boolean> {
    try {
      // Strategy 1: Check cookies set on the page for session tokens
      const pageCookies = await page.cookies('https://www.tiktok.com');
      const hasSession = pageCookies.some(
        c => (c.name === 'sessionid' || c.name === 'sid_tt' || c.name === 'sid_guard') && c.value && c.value.length > 5
      );
      if (!hasSession) {
        this.logger.log('No session cookies found — not logged in');
        return false;
      }

      // Strategy 2: Check page DOM for logged-in indicators
      const isLoggedIn = await page.evaluate(() => {
        // Logged-in: avatar or profile icon exists
        const avatar = document.querySelector(
          '[data-e2e="profile-icon"], [class*="avatar"], img[class*="Avatar"], ' +
          '[class*="DivAvatarContainer"], [data-e2e="nav-profile"]'
        );
        if (avatar) return 'avatar';

        // Logged-in: upload/create button exists (only shown when logged in)
        const uploadBtn = document.querySelector(
          '[data-e2e="upload-icon"], [class*="upload"], a[href*="/creator"]'
        );
        if (uploadBtn) return 'upload-btn';

        // Not logged in: login button visible
        const loginBtn = Array.from(document.querySelectorAll('button, a')).find(
          b => {
            const t = b.textContent?.toLowerCase().trim() || '';
            return t === 'log in' || t === 'masuk' || t === 'login';
          }
        );
        if (loginBtn) return false;

        // If no login button and has session cookies, assume logged in
        return 'no-login-btn';
      });

      this.logger.log(`Login check result: session=${hasSession}, dom=${isLoggedIn}`);
      return hasSession && isLoggedIn !== false;
    } catch (err: any) {
      this.logger.warn(`checkLoginStatus error: ${err.message}`);
      // If we have session cookies but DOM check failed, still consider logged in
      try {
        const fallbackCookies = await page.cookies('https://www.tiktok.com');
        return fallbackCookies.some(c => c.name === 'sessionid' && c.value.length > 5);
      } catch {
        return false;
      }
    }
  }

  /**
   * Save cookies to database
   */
  private async saveCookies(accountId: string, cookies: puppeteer.Protocol.Network.Cookie[]): Promise<void> {
    const cookiesJson = JSON.stringify(cookies);
    await this.accountsRepo.update(accountId, {
      tiktokCookies: cookiesJson,
      isBrowserLoggedIn: true,
      lastBrowserLoginAt: new Date(),
    });
  }

  /**
   * Load cookies from database and set on page
   */
  private async loadCookies(accountId: string, page: puppeteer.Page): Promise<void> {
    const account = await this.accountsRepo.findOne({
      where: { id: accountId },
      select: ['id', 'tiktokCookies'],
    });

    if (account?.tiktokCookies) {
      try {
        const cookies = JSON.parse(account.tiktokCookies);
        if (Array.isArray(cookies) && cookies.length > 0) {
          await page.setCookie(...cookies);
          this.logger.log(`Loaded ${cookies.length} cookies for account ${accountId}`);
        }
      } catch (e) {
        this.logger.warn(`Failed to parse saved cookies for ${accountId}`);
      }
    }
  }

  /**
   * Save login credentials
   */
  async saveCredentials(
    accountId: string,
    method: 'credentials' | 'cookies',
    data: { password?: string; cookies?: string },
  ): Promise<void> {
    const updateData: Partial<TiktokAccount> = {
      loginMethod: method,
    };

    if (method === 'credentials' && data.password) {
      updateData.tiktokPassword = data.password;
    }

    if (method === 'cookies' && data.cookies) {
      updateData.tiktokCookies = data.cookies;
    }

    await this.accountsRepo.update(accountId, updateData);
  }

  /**
   * Clear login data
   */
  async clearLogin(accountId: string): Promise<void> {
    await this.accountsRepo.update(accountId, {
      loginMethod: 'none',
      tiktokPassword: null,
      tiktokCookies: null,
      isBrowserLoggedIn: false,
      lastBrowserLoginAt: null,
    });

    // Remove browser profile
    const profileDir = this.getProfileDir(accountId);
    try {
      if (fs.existsSync(profileDir)) {
        fs.rmSync(profileDir, { recursive: true, force: true });
      }
    } catch (e) {
      this.logger.warn(`Failed to remove browser profile for ${accountId}`);
    }
  }

  /**
   * Random delay to mimic human behavior
   */
  private async randomDelay(minMs: number, maxMs: number): Promise<void> {
    const delay = minMs + Math.random() * (maxMs - minMs);
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
}
