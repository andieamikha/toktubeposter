import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs';
import { YoutubeAccount } from '../youtube-accounts/entities/youtube-account.entity';

// Lazy-load puppeteer to avoid crash if Chromium not downloaded
let puppeteer: any = null;
async function getPuppeteer() {
  if (!puppeteer) {
    try {
      puppeteer = await import('puppeteer');
    } catch (e: any) {
      throw new BadRequestException(
        'Puppeteer/Chromium tidak tersedia. Install dengan: cd backend && npm install puppeteer'
      );
    }
  }
  return puppeteer;
}

const YOUTUBE_LOGIN_URL = 'https://accounts.google.com/signin';
const YOUTUBE_UPLOAD_URL = 'https://studio.youtube.com';
const USER_DATA_DIR = path.join(process.cwd(), 'data', 'browser-profiles-youtube');
const SCREENSHOTS_DIR = path.join(process.cwd(), 'data', 'upload-screenshots-youtube');

@Injectable()
export class YoutubeBrowserService {
  private readonly logger = new Logger(YoutubeBrowserService.name);

  constructor(
    @InjectRepository(YoutubeAccount)
    private accountsRepo: Repository<YoutubeAccount>,
  ) {
    if (!fs.existsSync(USER_DATA_DIR)) {
      fs.mkdirSync(USER_DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(SCREENSHOTS_DIR)) {
      fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    }
  }

  private async takeScreenshot(page: any, accountId: string, step: string): Promise<string> {
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

  private getProfileDir(accountId: string): string {
    const dir = path.join(USER_DATA_DIR, accountId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  private async launchBrowser(accountId: string, headless = true): Promise<any> {
    const profileDir = this.getProfileDir(accountId);
    const pup = await getPuppeteer(); return pup.launch({
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

  private async applyStealthToPage(page: any): Promise<void> {
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en', 'id'] });
    });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    );
  }

  private randomDelay(min: number, max: number): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Save login credentials or cookies
   */
  async saveCredentials(
    accountId: string,
    method: 'credentials' | 'cookies',
    data: { email?: string; password?: string; cookies?: string },
  ): Promise<void> {
    const account = await this.accountsRepo.findOne({ where: { id: accountId } });
    if (!account) throw new BadRequestException('Akun YouTube tidak ditemukan.');

    account.loginMethod = method;
    if (method === 'credentials') {
      if (data.email) account.email = data.email;
      account.youtubePassword = data.password || null;
    } else if (method === 'cookies') {
      account.youtubeCookies = data.cookies || null;
    }
    await this.accountsRepo.save(account);
  }

  /**
   * Login using email + password (Google Account)
   */
  async loginWithCredentials(accountId: string): Promise<{ success: boolean; message: string }> {
    const account = await this.accountsRepo.findOne({ where: { id: accountId } });
    if (!account) throw new BadRequestException('Akun YouTube tidak ditemukan.');
    if (!account.email || !account.youtubePassword) {
      throw new BadRequestException('Email atau password YouTube belum diisi.');
    }

    let browser: any | null = null;
    try {
      browser = await this.launchBrowser(accountId, true);
      const page = await browser.newPage();
      await this.applyStealthToPage(page);

      this.logger.log(`[${account.channelName}] Navigating to Google login...`);
      await page.goto(YOUTUBE_LOGIN_URL, { waitUntil: 'networkidle2', timeout: 30000 });
      await this.takeScreenshot(page, accountId, 'login-page');

      // Enter email
      await page.waitForSelector('input[type="email"]', { timeout: 15000 });
      await this.randomDelay(500, 1000);
      await page.type('input[type="email"]', account.email, { delay: 50 });
      await this.randomDelay(300, 600);

      // Click Next
      const nextButtons = await page.$$('#identifierNext, button[type="button"]');
      if (nextButtons.length > 0) {
        await nextButtons[0].click();
      }
      await this.randomDelay(2000, 3000);
      await this.takeScreenshot(page, accountId, 'after-email');

      // Enter password
      await page.waitForSelector('input[type="password"]', { visible: true, timeout: 15000 });
      await this.randomDelay(500, 1000);
      await page.type('input[type="password"]', account.youtubePassword, { delay: 50 });
      await this.randomDelay(300, 600);

      // Click Next
      const passNextButtons = await page.$$('#passwordNext, button[type="button"]');
      if (passNextButtons.length > 0) {
        await passNextButtons[0].click();
      }
      await this.randomDelay(3000, 5000);
      await this.takeScreenshot(page, accountId, 'after-password');

      // Check if login was successful by navigating to YouTube
      await page.goto('https://studio.youtube.com', { waitUntil: 'networkidle2', timeout: 30000 });
      await this.takeScreenshot(page, accountId, 'studio-check');

      const currentUrl = page.url();
      const isLoggedIn = currentUrl.includes('studio.youtube.com') && !currentUrl.includes('accounts.google.com');

      if (isLoggedIn) {
        account.isBrowserLoggedIn = true;
        account.lastBrowserLoginAt = new Date();
        await this.accountsRepo.save(account);
        return { success: true, message: `Login berhasil untuk channel ${account.channelName}!` };
      } else {
        return {
          success: false,
          message: 'Login gagal. Mungkin ada 2FA atau CAPTCHA. Coba gunakan metode Cookies.',
        };
      }
    } catch (error: any) {
      this.logger.error(`[${account.channelName}] Login failed: ${error.message}`);
      return { success: false, message: `Login gagal: ${error.message}` };
    } finally {
      if (browser) await browser.close();
    }
  }

  /**
   * Login using cookies
   */
  async loginWithCookies(accountId: string, cookiesStr: string): Promise<{ success: boolean; message: string }> {
    const account = await this.accountsRepo.findOne({ where: { id: accountId } });
    if (!account) throw new BadRequestException('Akun YouTube tidak ditemukan.');

    let cookies: any[];
    try {
      cookies = JSON.parse(cookiesStr);
      if (!Array.isArray(cookies)) throw new Error('Bukan array');
    } catch {
      throw new BadRequestException('Format cookies tidak valid. Harus berupa JSON array.');
    }

    let browser: any | null = null;
    try {
      browser = await this.launchBrowser(accountId, true);
      const page = await browser.newPage();
      await this.applyStealthToPage(page);

      // Set cookies
      const puppeteerCookies = cookies
        .filter((c: any) => c.name && c.value)
        .map((c: any) => ({
          name: c.name,
          value: c.value,
          domain: c.domain || '.youtube.com',
          path: c.path || '/',
          httpOnly: c.httpOnly ?? false,
          secure: c.secure ?? true,
          sameSite: (c.sameSite === 'None' || c.sameSite === 'Lax' || c.sameSite === 'Strict')
            ? c.sameSite : undefined,
        }));

      await page.setCookie(...puppeteerCookies);

      // Also set Google cookies on google.com domain
      const googleCookies = cookies
        .filter((c: any) => c.name && c.value && (c.domain?.includes('google') || c.domain?.includes('youtube')))
        .map((c: any) => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path || '/',
          httpOnly: c.httpOnly ?? false,
          secure: c.secure ?? true,
          sameSite: (c.sameSite === 'None' || c.sameSite === 'Lax' || c.sameSite === 'Strict')
            ? c.sameSite : undefined,
        }));

      if (googleCookies.length > 0) {
        await page.setCookie(...googleCookies);
      }

      // Save cookies
      account.loginMethod = 'cookies';
      account.youtubeCookies = cookiesStr;
      await this.accountsRepo.save(account);

      // Verify by going to YouTube Studio
      await page.goto('https://studio.youtube.com', { waitUntil: 'networkidle2', timeout: 30000 });
      await this.takeScreenshot(page, accountId, 'cookies-verify');

      const currentUrl = page.url();
      const isLoggedIn = currentUrl.includes('studio.youtube.com') && !currentUrl.includes('accounts.google.com');

      if (isLoggedIn) {
        account.isBrowserLoggedIn = true;
        account.lastBrowserLoginAt = new Date();
        await this.accountsRepo.save(account);
        return { success: true, message: `Cookies valid! Login berhasil untuk ${account.channelName}.` };
      } else {
        return { success: false, message: 'Cookies tidak valid atau sudah kadaluarsa.' };
      }
    } catch (error: any) {
      this.logger.error(`[${account.channelName}] Cookie login failed: ${error.message}`);
      return { success: false, message: `Login cookies gagal: ${error.message}` };
    } finally {
      if (browser) await browser.close();
    }
  }

  /**
   * Verify login status
   */
  async verifyLogin(accountId: string): Promise<{ loggedIn: boolean; message: string }> {
    const account = await this.accountsRepo.findOne({ where: { id: accountId } });
    if (!account) throw new BadRequestException('Akun YouTube tidak ditemukan.');

    let browser: any | null = null;
    try {
      browser = await this.launchBrowser(accountId, true);
      const page = await browser.newPage();
      await this.applyStealthToPage(page);

      await page.goto('https://studio.youtube.com', { waitUntil: 'networkidle2', timeout: 30000 });
      const currentUrl = page.url();
      const isLoggedIn = currentUrl.includes('studio.youtube.com') && !currentUrl.includes('accounts.google.com');

      account.isBrowserLoggedIn = isLoggedIn;
      await this.accountsRepo.save(account);

      return {
        loggedIn: isLoggedIn,
        message: isLoggedIn ? 'Session aktif.' : 'Session expired, login ulang diperlukan.',
      };
    } catch (error: any) {
      return { loggedIn: false, message: `Gagal verifikasi: ${error.message}` };
    } finally {
      if (browser) await browser.close();
    }
  }

  /**
   * Clear login
   */
  async clearLogin(accountId: string): Promise<void> {
    const account = await this.accountsRepo.findOne({ where: { id: accountId } });
    if (!account) throw new BadRequestException('Akun YouTube tidak ditemukan.');

    account.loginMethod = 'none';
    account.youtubePassword = null;
    account.youtubeCookies = null;
    account.isBrowserLoggedIn = false;
    account.lastBrowserLoginAt = null;
    await this.accountsRepo.save(account);

    // Clean profile directory
    const profileDir = this.getProfileDir(accountId);
    if (fs.existsSync(profileDir)) {
      fs.rmSync(profileDir, { recursive: true, force: true });
    }
  }

  /**
   * Upload video to YouTube via browser (YouTube Studio)
   */
  async uploadVideo(
    accountId: string,
    videoPath: string,
    title: string,
    description: string,
  ): Promise<{ success: boolean; message: string }> {
    const account = await this.accountsRepo.findOne({ where: { id: accountId } });
    if (!account) throw new BadRequestException('Akun YouTube tidak ditemukan.');
    if (!account.isBrowserLoggedIn && account.loginMethod === 'none') {
      throw new BadRequestException(`Akun ${account.channelName} belum login browser.`);
    }

    let browser: any | null = null;
    try {
      browser = await this.launchBrowser(accountId, true);
      const page = await browser.newPage();
      await this.applyStealthToPage(page);

      // Navigate to YouTube Studio
      this.logger.log(`[${account.channelName}] Opening YouTube Studio...`);
      await page.goto(YOUTUBE_UPLOAD_URL, { waitUntil: 'networkidle2', timeout: 30000 });
      await this.takeScreenshot(page, accountId, 'studio-home');

      // Check if logged in
      const currentUrl = page.url();
      if (currentUrl.includes('accounts.google.com')) {
        // Try to re-apply cookies
        if (account.youtubeCookies) {
          const cookies = JSON.parse(account.youtubeCookies);
          const puppeteerCookies = cookies
            .filter((c: any) => c.name && c.value)
            .map((c: any) => ({
              name: c.name,
              value: c.value,
              domain: c.domain || '.youtube.com',
              path: c.path || '/',
              httpOnly: c.httpOnly ?? false,
              secure: c.secure ?? true,
            }));
          await page.setCookie(...puppeteerCookies);
          await page.goto(YOUTUBE_UPLOAD_URL, { waitUntil: 'networkidle2', timeout: 30000 });
        }
        
        if (page.url().includes('accounts.google.com')) {
          throw new Error('Session expired. Login ulang diperlukan.');
        }
      }

      await this.randomDelay(2000, 3000);

      // Click upload button (Create > Upload video)
      this.logger.log(`[${account.channelName}] Looking for upload button...`);
      await this.takeScreenshot(page, accountId, 'before-upload-click');

      // Strategy 1: Try direct upload URL first (most reliable)
      this.logger.log(`[${account.channelName}] Navigating to upload page...`);
      await page.goto('https://studio.youtube.com/channel/upload?d=ud', { waitUntil: 'networkidle2', timeout: 30000 });
      await this.randomDelay(2000, 4000);

      // Check if we got the upload interface
      let hasUploadInterface = await page.evaluate(() => {
        return !!document.querySelector('input[type="file"]')
          || document.body.innerText.toLowerCase().includes('select files')
          || document.body.innerText.toLowerCase().includes('drag and drop')
          || document.body.innerText.toLowerCase().includes('upload video');
      });

      if (!hasUploadInterface) {
        // Strategy 2: Try clicking the create/upload button from Studio dashboard
        this.logger.log(`[${account.channelName}] Direct URL didn't work, trying button click...`);
        await page.goto(YOUTUBE_UPLOAD_URL, { waitUntil: 'networkidle2', timeout: 30000 });
        await this.randomDelay(2000, 3000);

        const uploadButtonSelectors = [
          '#upload-icon',
          'ytcp-button#create-icon',
          '#upload-button',
          'button[aria-label="Upload videos"]',
          'button[aria-label="Upload video"]',
          '#create-icon button',
          '#create-icon',
        ];

        let clicked = false;
        for (const selector of uploadButtonSelectors) {
          try {
            const btn = await page.$(selector);
            if (btn) {
              await btn.click();
              clicked = true;
              this.logger.log(`[${account.channelName}] Clicked upload button: ${selector}`);
              break;
            }
          } catch { /* try next */ }
        }

        if (!clicked) {
          // Try text-based button search
          const clickedByText = await page.evaluate(() => {
            const items = Array.from(document.querySelectorAll('tp-yt-paper-item, ytd-menu-service-item-renderer, ytcp-text-menu-item'));
            for (const item of items) {
              const text = (item as HTMLElement).textContent?.toLowerCase() || '';
              if (text.includes('upload video') || text.includes('upload')) {
                (item as HTMLElement).click();
                return true;
              }
            }
            return false;
          });
          if (clickedByText) {
            this.logger.log(`[${account.channelName}] Clicked upload via text match`);
          }
        }
        
        await this.randomDelay(2000, 3000);
      }

      await this.takeScreenshot(page, accountId, 'upload-dialog');

      // Upload file - wait for file input to appear (it loads dynamically after dialog opens)
      this.logger.log(`[${account.channelName}] Waiting for file input to appear...`);
      
      let fileInput: any | null = null;
      
      // Wait up to 15 seconds for the file input to appear
      for (let attempt = 0; attempt < 15; attempt++) {
        // Try various selectors
        fileInput = await page.$('input[type="file"]') as any;
        if (fileInput) break;

        // Also check inside shadow DOMs and iframes
        const foundViaEval = await page.evaluate(() => {
          const inputs = document.querySelectorAll('input[type="file"]');
          return inputs.length;
        });
        if (foundViaEval > 0) {
          fileInput = await page.$('input[type="file"]') as any;
          if (fileInput) break;
        }

        // Try waitForSelector with short timeout
        try {
          fileInput = await page.waitForSelector('input[type="file"]', { timeout: 1000 }) as any;
          if (fileInput) break;
        } catch { /* retry */ }

        await this.randomDelay(800, 1200);
      }

      if (!fileInput) {
        // Last resort: navigate directly to the upload page
        this.logger.warn(`[${account.channelName}] File input not found via button, trying direct upload URL...`);
        await page.goto('https://studio.youtube.com/channel/upload?d=ud', { waitUntil: 'networkidle2', timeout: 30000 });
        await this.randomDelay(3000, 5000);
        await this.takeScreenshot(page, accountId, 'direct-upload-page');

        try {
          fileInput = await page.waitForSelector('input[type="file"]', { timeout: 10000 }) as any;
        } catch {
          // One more try with broader selector
          fileInput = await page.$('input[accept*="video"]') as any
            || await page.$('input[accept*="mp4"]') as any;
        }
      }

      if (!fileInput) {
        await this.takeScreenshot(page, accountId, 'no-file-input');
        throw new Error('Tidak bisa menemukan file input setelah menunggu. Cek screenshot di folder upload-screenshots-youtube.');
      }

      this.logger.log(`[${account.channelName}] Selecting video file: ${videoPath}`);
      await fileInput.uploadFile(videoPath);

      this.logger.log(`[${account.channelName}] File selected, waiting for upload dialog...`);
      await this.randomDelay(5000, 8000);
      await this.takeScreenshot(page, accountId, 'after-file-select');

      // Fill in title — YouTube Studio auto-fills filename as title, we must REPLACE it
      this.logger.log(`[${account.channelName}] Setting title: "${title.substring(0, 60)}..."`);
      
      // Wait for the title textbox to appear and have content (filename auto-populated)
      await page.waitForSelector('#textbox', { timeout: 15000 }).catch(() => {});
      await this.randomDelay(2000, 3000);

      // Strategy: Use Ctrl+A to select ALL text in the title field, then type new title
      const titleSet = await page.evaluate((newTitle: string) => {
        // YouTube Studio has multiple #textbox elements — first one is title, second is description
        const textboxes = document.querySelectorAll('#textbox');
        if (textboxes.length === 0) return false;
        
        const titleBox = textboxes[0] as HTMLElement;
        // Focus and clear
        titleBox.focus();
        titleBox.click();
        
        // Select all text in the contenteditable div
        const range = document.createRange();
        range.selectNodeContents(titleBox);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        
        return true;
      }, title.substring(0, 100));

      if (titleSet) {
        // Now type over the selected text
        await this.randomDelay(300, 500);
        await page.keyboard.press('Backspace'); // Delete selected text
        await this.randomDelay(200, 400);
        await page.keyboard.type(title.substring(0, 100), { delay: 30 });
        this.logger.log(`[${account.channelName}] Title set via selectAll+type`);
      } else {
        // Fallback: try individual selectors
        const titleSelectors = [
          '#title-textarea #textbox',
          'ytcp-social-suggestions-textbox #textbox',
          '#textbox',
        ];
        for (const selector of titleSelectors) {
          try {
            const titleField = await page.$(selector);
            if (titleField) {
              await titleField.click();
              await this.randomDelay(200, 300);
              // Ctrl+A to select all, then type
              await page.keyboard.down('Control');
              await page.keyboard.press('a');
              await page.keyboard.up('Control');
              await this.randomDelay(100, 200);
              await page.keyboard.type(title.substring(0, 100), { delay: 30 });
              this.logger.log(`[${account.channelName}] Title set via Ctrl+A: ${selector}`);
              break;
            }
          } catch { /* try next */ }
        }
      }

      await this.randomDelay(500, 1000);

      // Fill in description
      this.logger.log(`[${account.channelName}] Setting description...`);
      const descSelectors = [
        '#textbox[aria-label="Tell viewers about your video (type @ to mention a channel)"]',
        '#description-textarea #textbox',
        'ytcp-social-suggestions-textbox:nth-of-type(2) #textbox',
      ];

      for (const selector of descSelectors) {
        try {
          const descField = await page.$(selector);
          if (descField) {
            await descField.click();
            await this.randomDelay(200, 400);
            await page.keyboard.type(description.substring(0, 5000), { delay: 10 });
            this.logger.log(`[${account.channelName}] Description set via: ${selector}`);
            break;
          }
        } catch { /* try next */ }
      }

      await this.randomDelay(1000, 2000);
      await this.takeScreenshot(page, accountId, 'details-filled');

      // === NAVIGATE TO VISIBILITY STEP (step-badge-3) ===
      // YouTube Studio upload has 4 steps: Detail(0) > Elemen video(1) > Pemeriksaan(2) > Visibilitas(3)
      // Button text: "Berikutnya" (Indonesian for "Next")
      this.logger.log(`[${account.channelName}] Navigating upload steps...`);
      
      // First, select "Not made for kids" to ensure Next button is enabled
      await page.evaluate(() => {
        const radios = document.querySelectorAll('tp-yt-paper-radio-button');
        for (const r of Array.from(radios)) {
          if (r.getAttribute('name') === 'VIDEO_MADE_FOR_KIDS_NOT_MFK') {
            (r as HTMLElement).click();
            break;
          }
        }
      });
      await this.randomDelay(1000, 1500);

      // Helper: check which step is currently active
      const getActiveStep = async (): Promise<number> => {
        return page.evaluate(() => {
          for (let i = 0; i < 4; i++) {
            const badge = document.querySelector(`#step-badge-${i}`);
            if (badge) {
              // Check both attribute and className
              const hasActive = badge.hasAttribute('active') 
                || badge.getAttribute('aria-selected') === 'true'
                || badge.className?.includes('active')
                || badge.className?.includes('selected');
              if (hasActive) return i;
            }
          }
          // Fallback: check step header text
          const headerEl = document.querySelector('.step-header h2, [id*="step"] h2, h2');
          const headerText = headerEl?.textContent?.trim()?.toLowerCase() || '';
          if (headerText.includes('detail')) return 0;
          if (headerText.includes('elemen video') || headerText.includes('video elements')) return 1;
          if (headerText.includes('pemeriksaan') || headerText.includes('checks')) return 2;
          if (headerText.includes('visibilitas') || headerText.includes('visibility')) return 3;
          return -1;
        });
      };

      // Helper: click Next/Berikutnya button
      const clickNextButton = async (): Promise<boolean> => {
        try {
          // Method 1: Click #next-button directly
          const nextBtn = await page.$('#next-button');
          if (nextBtn) {
            await nextBtn.evaluate(el => el.scrollIntoView({ block: 'center' }));
            await this.randomDelay(300, 500);
            await nextBtn.click();
            return true;
          }
        } catch { /* continue */ }
        
        try {
          // Method 2: Find button by text "Berikutnya"
          return await page.evaluate(() => {
            const buttons = document.querySelectorAll('ytcp-button, button');
            for (const btn of Array.from(buttons)) {
              const text = (btn as HTMLElement).innerText?.trim();
              if (text === 'Berikutnya' || text === 'Next') {
                (btn as HTMLElement).click();
                return true;
              }
            }
            return false;
          });
        } catch { return false; }
      };

      // Navigate step by step, verifying each transition
      let currentStep = await getActiveStep();
      this.logger.log(`[${account.channelName}] Currently on step ${currentStep}`);

      // We need to reach step 3 (Visibilitas)
      const maxAttempts = 6;
      for (let attempt = 0; attempt < maxAttempts && currentStep < 3; attempt++) {
        const clicked = await clickNextButton();
        this.logger.log(`[${account.channelName}] Click Berikutnya attempt ${attempt + 1}: ${clicked ? 'clicked' : 'not found'}`);
        
        // Wait for step transition (longer wait for reliability)
        await this.randomDelay(2500, 3500);
        
        const newStep = await getActiveStep();
        this.logger.log(`[${account.channelName}] After click: step ${currentStep} -> ${newStep}`);
        
        if (newStep > currentStep) {
          currentStep = newStep;
        } else if (newStep === currentStep) {
          // Step didn't advance - try clicking step badge directly
          const targetStep = currentStep + 1;
          this.logger.log(`[${account.channelName}] Step didn't advance, trying step-badge-${targetStep}`);
          try {
            const badge = await page.$(`#step-badge-${targetStep}`);
            if (badge) {
              await badge.click();
              await this.randomDelay(2000, 3000);
              currentStep = await getActiveStep();
              this.logger.log(`[${account.channelName}] After badge click: step ${currentStep}`);
            }
          } catch { /* continue */ }
        }
      }

      // Final check: if still not on step 3, try direct badge click
      if (currentStep !== 3) {
        this.logger.log(`[${account.channelName}] Still on step ${currentStep}, direct click step-badge-3`);
        try {
          const badge3 = await page.$('#step-badge-3');
          if (badge3) {
            await badge3.click();
            await this.randomDelay(3000, 4000);
            currentStep = await getActiveStep();
          }
        } catch { /* continue */ }
      }

      this.logger.log(`[${account.channelName}] Final step: ${currentStep} (target: 3)`);
      await this.takeScreenshot(page, accountId, 'visibility-step');

      // === Wait for visibility radios to appear ===
      this.logger.log(`[${account.channelName}] Waiting for visibility options to load...`);
      
      // Wait up to 10 seconds for visibility radio buttons to appear
      let visRadiosFound = false;
      for (let wait = 0; wait < 10; wait++) {
        const count = await page.evaluate(() => {
          const radios = document.querySelectorAll('tp-yt-paper-radio-button');
          let visCount = 0;
          for (const r of Array.from(radios)) {
            const name = r.getAttribute('name') || '';
            if (['PUBLIC', 'PRIVATE', 'UNLISTED'].includes(name)) {
              visCount++;
            }
            // Also check by text
            const text = (r as HTMLElement).innerText?.toLowerCase() || '';
            if (text.includes('publik') || text.includes('pribadi') || text.includes('tidak publik')) {
              visCount++;
            }
          }
          return visCount;
        });
        
        if (count > 0) {
          visRadiosFound = true;
          this.logger.log(`[${account.channelName}] Visibility radios found: ${count}`);
          break;
        }
        
        await this.randomDelay(1000, 1000);
      }
      
      if (!visRadiosFound) {
        this.logger.log(`[${account.channelName}] Visibility radios NOT found! Dumping debug...`);
      }

      // === Select "Public" visibility ===
      this.logger.log(`[${account.channelName}] Setting visibility to Public...`);
      await this.randomDelay(2000, 3000);

      // Dump complete page analysis to file for debugging
      const htmlDump = await page.evaluate(() => {
        const info: string[] = [];
        const bodyText = document.body.innerText || '';
        
        // Dump first 3000 chars of all visible text
        info.push('=== VISIBLE PAGE TEXT (first 3000 chars) ===');
        info.push(bodyText.substring(0, 3000).replace(/\n{3,}/g, '\n\n'));
        
        info.push('\n=== ALL ELEMENTS WITH RELEVANT ATTRIBUTES ===');
        // Find all radio/select/visibility related elements including those in shadow DOM
        const relevantTags: string[] = [];
        
        function walkAll(root: Element | ShadowRoot | Document, prefix: string = '') {
          const els = root instanceof Document ? root.querySelectorAll('*') : root.querySelectorAll('*');
          for (const el of Array.from(els)) {
            const tag = el.tagName?.toLowerCase() || '';
            const id = el.id || '';
            const name = el.getAttribute('name') || '';
            const role = el.getAttribute('role') || '';
            
            if (tag.includes('radio') || tag.includes('select') || tag.includes('visibility') || tag.includes('privacy')
                || role === 'radio' || role === 'radiogroup' || role === 'listbox'
                || id.includes('privacy') || id.includes('visibility') || id.includes('public')
                || name === 'PUBLIC' || name === 'PRIVATE' || name === 'UNLISTED') {
              relevantTags.push(`${prefix}${tag}#${id} name="${name}" role="${role}" checked=${el.getAttribute('aria-checked')} text="${(el as HTMLElement).innerText?.substring(0, 60).replace(/\n/g, ' ')}"`);
            }
            
            // Recurse into shadow roots
            if ((el as any).shadowRoot) {
              walkAll((el as any).shadowRoot, prefix + '  SHADOW>');
            }
          }
        }
        walkAll(document);
        info.push(`Found ${relevantTags.length} relevant elements:`);
        info.push(relevantTags.join('\n'));
        
        // Find step badges and their state
        info.push('\n=== STEP BADGES ===');
        for (let i = 0; i < 5; i++) {
          const badge = document.querySelector(`#step-badge-${i}`);
          if (badge) {
            info.push(`step-badge-${i}: class="${badge.className?.toString().substring(0, 80)}" active=${badge.hasAttribute('active')} text="${(badge as HTMLElement).innerText?.substring(0, 30)}"`);
          }
        }
        
        return info.join('\n');
      });
      
      // Save debug to file
      const fs = require('fs');
      const debugPath = require('path').join(process.cwd(), 'data', 'upload-screenshots-youtube', `visibility-debug-${Date.now()}.txt`);
      fs.writeFileSync(debugPath, htmlDump);
      this.logger.log(`[${account.channelName}] Visibility debug saved to: ${debugPath}`);

      let visibilitySet = false;

      // Strategy 1: Find tp-yt-paper-radio-button with name="PUBLIC"
      visibilitySet = await page.evaluate(() => {
        const radios = document.querySelectorAll('tp-yt-paper-radio-button');
        for (const r of Array.from(radios)) {
          const name = (r.getAttribute('name') || '').toUpperCase();
          if (name === 'PUBLIC') {
            (r as HTMLElement).click();
            return true;
          }
        }
        return false;
      });
      if (visibilitySet) this.logger.log(`[${account.channelName}] Clicked PUBLIC radio by name`);

      // Strategy 2: Find radio by text containing "Publik" or "Public"
      if (!visibilitySet) {
        visibilitySet = await page.evaluate(() => {
          const radios = document.querySelectorAll('tp-yt-paper-radio-button');
          for (const r of Array.from(radios)) {
            const text = (r as HTMLElement).innerText?.toLowerCase() || '';
            if (text.includes('publi') && !text.includes('publikasikan') && !text.includes('anak') && !text.includes('batasi')) {
              (r as HTMLElement).click();
              return true;
            }
          }
          return false;
        });
        if (visibilitySet) this.logger.log(`[${account.channelName}] Clicked Public radio by text`);
      }

      // Strategy 3: Walk entire DOM for text "Publik"/"Public" and click
      if (!visibilitySet) {
        visibilitySet = await page.evaluate(() => {
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let node: Node | null;
          while ((node = walker.nextNode())) {
            const text = node.textContent?.trim() || '';
            if (text === 'Public' || text === 'Publik') {
              let el = node.parentElement;
              for (let i = 0; i < 6 && el; i++) {
                const tag = el.tagName?.toLowerCase() || '';
                if (tag.includes('radio') || el.getAttribute('role') === 'radio') {
                  el.click();
                  return true;
                }
                el = el.parentElement;
              }
              node.parentElement?.click();
              return true;
            }
          }
          return false;
        });
        if (visibilitySet) this.logger.log(`[${account.channelName}] Clicked Publik text node`);
      }

      // Strategy 4: Puppeteer pierce selector for radio buttons (pierces shadow DOM)
      if (!visibilitySet) {
        try {
          const pierceRadios = await page.$$('pierce/tp-yt-paper-radio-button');
          this.logger.log(`[${account.channelName}] Pierce found ${pierceRadios.length} radios`);
          for (const btn of pierceRadios) {
            const info = await btn.evaluate(e => ({
              name: e.getAttribute('name') || '',
              text: (e as HTMLElement).innerText?.substring(0, 50) || ''
            }));
            this.logger.log(`[${account.channelName}] Pierce radio: name="${info.name}" text="${info.text}"`);
            if (info.name === 'PUBLIC' || (info.text.toLowerCase().includes('publi') && !info.text.toLowerCase().includes('anak') && !info.text.toLowerCase().includes('batasi'))) {
              await btn.click();
              visibilitySet = true;
              this.logger.log(`[${account.channelName}] Clicked via pierce`);
              break;
            }
          }
        } catch (e) {
          this.logger.log(`[${account.channelName}] Pierce error: ${(e as Error).message}`);
        }
      }

      // Strategy 5: aria selector
      if (!visibilitySet) {
        try {
          for (const label of ['Public', 'Publik']) {
            const ariaRadios = await page.$$(`aria/${label}[role="radio"]`);
            if (ariaRadios.length > 0) {
              await ariaRadios[0].click();
              visibilitySet = true;
              this.logger.log(`[${account.channelName}] Clicked via aria/${label}`);
              break;
            }
          }
        } catch (e) {
          this.logger.log(`[${account.channelName}] Aria error: ${(e as Error).message}`);
        }
      }

      // Strategy 6: XPath for any clickable element with Public/Publik text
      if (!visibilitySet) {
        try {
          visibilitySet = await page.evaluate(() => {
            const xpath = document.evaluate(
              "//*[contains(text(), 'Publik') or contains(text(), 'Public')]",
              document.body, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null
            );
            for (let i = 0; i < xpath.snapshotLength; i++) {
              const node = xpath.snapshotItem(i) as HTMLElement;
              if (node && node.textContent) {
                const text = node.textContent.trim().toLowerCase();
                if ((text === 'publik' || text === 'public') && text.length < 20) {
                  const rect = node.getBoundingClientRect();
                  if (rect.width > 0 && rect.height > 0) {
                    node.click();
                    node.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
                    return true;
                  }
                }
              }
            }
            return false;
          });
          if (visibilitySet) this.logger.log(`[${account.channelName}] Clicked via XPath`);
        } catch { /* continue */ }
      }

      if (!visibilitySet) {
        this.logger.log(`[${account.channelName}] WARNING: Could not set visibility to Public! Video will be saved as Draft.`);
      }

      await this.randomDelay(2000, 3000);
      await this.takeScreenshot(page, accountId, 'after-visibility');

      // Wait for video to finish processing / upload before publishing
      this.logger.log(`[${account.channelName}] Waiting for video processing...`);
      const processingResult = await this.waitForVideoProcessing(page, accountId);
      
      // If there was an error (like daily limit), stop and return error
      if (!processingResult.ready && processingResult.error) {
        await this.takeScreenshot(page, accountId, 'upload-error');
        return {
          success: false,
          message: processingResult.error,
        };
      }

      // Click Publish / Publikasikan button
      this.logger.log(`[${account.channelName}] Looking for Publish button...`);
      
      let published = false;
      
      // Try clicking #done-button if it's enabled
      if (processingResult.ready) {
        try {
          const publishBtn = await page.$('#done-button');
          if (publishBtn) {
            await publishBtn.click();
            published = true;
            this.logger.log(`[${account.channelName}] Clicked Publish (#done-button)`);
          }
        } catch { /* continue */ }
      }

      // Fallback: text-based search for enabled Publikasikan/Publish button
      if (!published) {
        this.logger.log(`[${account.channelName}] Trying text-based Publish button search...`);
        published = await page.evaluate(() => {
          const allBtns = Array.from(document.querySelectorAll('button, ytcp-button, #done-button'));
          const publishTexts = ['publikasikan', 'publish'];
          for (const btn of allBtns) {
            const text = (btn as HTMLElement).textContent?.trim().toLowerCase() || '';
            const disabled = (btn as HTMLElement).hasAttribute('disabled') || (btn as HTMLElement).getAttribute('aria-disabled') === 'true';
            if (!disabled) {
              for (const pt of publishTexts) {
                if (text.includes(pt) && text.length < 50) {
                  (btn as HTMLElement).click();
                  return true;
                }
              }
            }
          }
          return false;
        });
        if (published) {
          this.logger.log(`[${account.channelName}] Clicked Publish via text match`);
        }
      }

      await this.randomDelay(3000, 5000);
      await this.takeScreenshot(page, accountId, 'after-publish');

      // Wait briefly and check if a confirmation dialog appeared ("Video telah dipublikasikan")
      if (published) {
        await this.randomDelay(3000, 5000);
        const confirmResult = await page.evaluate(() => {
          const body = document.body.innerText.toLowerCase();
          if (body.includes('video telah dipublikasikan') || body.includes('video published') 
              || body.includes('dipublikasikan') || body.includes('has been published')) {
            // Try to close the dialog
            const closeBtn = document.querySelector('ytcp-button#close-button, #close-button') as HTMLElement;
            if (closeBtn) closeBtn.click();
            return 'PUBLISHED';
          }
          if (body.includes('batas upload harian') || body.includes('daily upload limit')) {
            return 'DAILY_LIMIT';
          }
          return 'UNKNOWN';
        });
        
        this.logger.log(`[${account.channelName}] Post-publish check: ${confirmResult}`);
        await this.takeScreenshot(page, accountId, 'post-publish-check');
        
        if (confirmResult === 'DAILY_LIMIT') {
          return {
            success: false,
            message: 'Batas upload harian YouTube telah tercapai. Verifikasi nomor telepon channel YouTube atau tunggu 24 jam.',
          };
        }
        
        return {
          success: true,
          message: `Video berhasil dipublikasikan ke YouTube channel ${account.channelName}!`,
        };
      } else {
        return {
          success: false,
          message: 'Tombol Publikasikan masih disabled. Video mungkin masih diproses atau ada error di YouTube Studio.',
        };
      }
    } catch (error: any) {
      this.logger.error(`[${account.channelName}] Upload failed: ${error.message}`);
      return { success: false, message: `Upload gagal: ${error.message}` };
    } finally {
      if (browser) await browser.close();
    }
  }

  /**
   * Wait for YouTube video processing (upload progress)
   */
  private async waitForVideoProcessing(page: any, accountId: string): Promise<{ ready: boolean; error?: string }> {
    const maxWait = 10 * 60 * 1000; // 10 minutes max
    const startTime = Date.now();
    let lastProgress = '';

    while (Date.now() - startTime < maxWait) {
      try {
        const status = await page.evaluate(() => {
          const doneBtn = document.querySelector('#done-button') as HTMLElement;
          const isEnabled = doneBtn && !doneBtn.hasAttribute('disabled') && doneBtn.getAttribute('aria-disabled') !== 'true';
          
          const body = document.body.innerText.toLowerCase();
          
          // Detect error messages
          let errorMsg = '';
          if (body.includes('batas upload harian') || body.includes('daily upload limit')) {
            errorMsg = 'DAILY_LIMIT';
          } else if (body.includes('terjadi error') || body.includes('an error occurred')) {
            errorMsg = 'UPLOAD_ERROR';
          } else if (body.includes('tidak dapat diupload') || body.includes('cannot be uploaded')) {
            errorMsg = 'CANNOT_UPLOAD';
          }
          
          // Detect progress
          let progressText = '';
          if (body.includes('upload selesai') || body.includes('upload complete')) progressText = 'UPLOAD_COMPLETE';
          else if (body.includes('sedang mengupload') || body.includes('mengunggah') || body.includes('uploading')) progressText = 'UPLOADING';
          else if (body.includes('sedang diproses') || body.includes('memproses') || body.includes('processing')) progressText = 'PROCESSING';
          else if (body.includes('pemeriksaan selesai') || body.includes('checks complete')) progressText = 'CHECKS_DONE';
          
          // Try to find upload percentage
          const percentMatch = body.match(/(\d+)\s*%\s*(sedang|upload|mengupload|diunggah)/i);
          if (percentMatch) progressText = `UPLOADING_${percentMatch[1]}%`;
          
          return {
            doneButtonEnabled: isEnabled,
            doneButtonText: doneBtn?.innerText?.trim() || '',
            progressText,
            errorMsg
          };
        });

        // Check for blocking errors first
        if (status.errorMsg === 'DAILY_LIMIT') {
          this.logger.error(`[${accountId}] YouTube daily upload limit reached! Channel needs phone verification or wait 24 hours.`);
          return { ready: false, error: 'Batas upload harian YouTube telah tercapai. Verifikasi nomor telepon channel YouTube atau tunggu 24 jam.' };
        }
        if (status.errorMsg) {
          this.logger.error(`[${accountId}] YouTube error detected: ${status.errorMsg}`);
          return { ready: false, error: `YouTube error: ${status.errorMsg}` };
        }

        // The most reliable check: is the Publish button enabled?
        if (status.doneButtonEnabled) {
          this.logger.log(`[${accountId}] Done button is ENABLED: "${status.doneButtonText}" - ready to publish`);
          return { ready: true };
        }

        const progressInfo = `btn="${status.doneButtonText}" enabled=${status.doneButtonEnabled} progress=${status.progressText}`;
        if (progressInfo !== lastProgress) {
          this.logger.log(`[${accountId}] Upload status: ${progressInfo}`);
          lastProgress = progressInfo;
        }
      } catch { /* ignore */ }

      await this.randomDelay(3000, 5000);
    }
    
    this.logger.warn(`[${accountId}] Timed out waiting for video processing after ${maxWait / 60000} minutes`);
    return { ready: false, error: 'Timeout menunggu video selesai diproses YouTube (10 menit). Coba lagi nanti.' };
  }
}
