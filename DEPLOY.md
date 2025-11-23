# Cloudflare Pages Deployment Guide

This project is configured for deployment to Cloudflare Pages. Follow the instructions below to deploy.

## Prerequisites

1. **Cloudflare Account**: Sign up at [cloudflare.com](https://www.cloudflare.com/)
2. **Wrangler CLI** (optional, for CLI deployment): Already included in `devDependencies`
3. **Node.js**: Version 20 or higher (specified in `wrangler.toml`)

## Deployment Methods

### Method 1: Git Integration (Recommended)

This is the easiest and most automated method. Cloudflare Pages will automatically build and deploy on every push to your repository.

#### Steps:

1. **Push your code to a Git repository** (GitHub, GitLab, or Bitbucket)

2. **Connect to Cloudflare Pages**:
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
   - Navigate to **Pages** → **Create a project**
   - Click **Connect to Git**
   - Select your repository

3. **Configure Build Settings** (CRITICAL - Set these in the dashboard):
   - **Framework preset**: None (or Vite if available)
   - **Build command**: `npm ci && npm run build` (or just `npm run build`)
   - **Build output directory**: `dist`
   - **Root directory**: `/` (leave as default)
   - **Node version**: `20` (or leave default)
   - **Deploy command**: `npm run pages:deploy` (no-op command - Cloudflare Pages handles deployment automatically)
   
   **IMPORTANT**: 
   - Build settings must be configured in the Cloudflare Pages dashboard
   - The `wrangler.toml` file does NOT support `[build]` sections for Pages projects
   - The deploy command is a no-op because Cloudflare Pages automatically deploys after the build completes
   - If the deploy command field cannot be empty, use: `npm run pages:deploy`

4. **Deploy**:
   - Click **Save and Deploy**
   - Cloudflare will build and deploy your site
   - You'll get a URL like: `https://your-project.pages.dev`

5. **Custom Domain** (Optional):
   - Go to your project settings
   - Click **Custom domains**
   - Add your domain and follow DNS setup instructions

### Method 2: Wrangler CLI (Direct Deployment)

Use this method if you want to deploy directly from your local machine without Git integration.

#### Steps:

1. **Install Wrangler** (if not already installed):
   ```bash
   npm install -g wrangler
   ```

2. **Login to Cloudflare**:
   ```bash
   npx wrangler login
   ```
   This will open a browser window for authentication.

3. **Build and Deploy**:
   ```bash
   npm run deploy
   ```
   
   Or manually:
   ```bash
   npm run build
   npx wrangler pages deploy dist
   ```

4. **Deploy to Preview** (optional):
   ```bash
   npm run deploy:preview
   ```

### Method 3: Cloudflare Dashboard (Manual Upload)

1. **Build locally**:
   ```bash
   npm run build
   ```

2. **Upload to Cloudflare**:
   - Go to Cloudflare Dashboard → Pages
   - Create a new project
   - Select **Upload assets**
   - Upload the `dist` folder contents
   - Deploy

## Build Configuration

The project uses the following build settings (configure these in the Cloudflare Pages dashboard):

- **Build Command**: `npm ci && npm run build`
- **Output Directory**: `dist`
- **Node Version**: 20 (or latest)
- **Framework**: Vite (or None)

**Important**: For Cloudflare Pages, build settings are configured in the dashboard when connecting your Git repository. The `wrangler.toml` file is minimal and only contains project metadata - it does NOT support `[build]` sections for Pages projects.

## Project Structure for Cloudflare Pages

```
simulation/
├── dist/                    # Build output (generated)
├── public/
│   └── _redirects           # SPA routing rules
├── vite.config.js           # Vite build configuration
├── wrangler.toml            # Cloudflare Pages configuration
└── package.json             # Dependencies and scripts
```

## Important Files

- **`_redirects`**: Cloudflare Pages routing rules that handle:
  - Static page redirects (`/about` → `/about.html`, `/blog` → `/blog.html`)
  - Asset serving for JS/CSS files
  - SPA routing (all other routes serve `index.html`)
- **`wrangler.toml`**: Cloudflare Pages build configuration
- **`vite.config.js`**: Vite build settings optimized for Cloudflare Pages

## Troubleshooting

### Deploy Command Errors

If you see errors like "error occurred while running deploy command" or Wrangler authentication issues:

1. **Check Dashboard Settings**: Go to your Pages project → Settings → Builds & deployments
2. **Set Deploy Command**: Use `npm run pages:deploy` (this is a no-op command that does nothing)
3. **Build Command**: `npm ci && npm run build` (or `npm run build`)
4. **Save Changes**: Make sure to save the settings

**Why**: With Git integration, Cloudflare Pages automatically deploys the build output. The deploy command field may be required by the UI, but we use a no-op command since Cloudflare handles deployment automatically after the build.

### Build Fails

1. **Check Node version**: Ensure Node.js 20+ is available
2. **Check dependencies**: Run `npm ci` to ensure clean install
3. **Check build logs**: Review Cloudflare Pages build logs for errors

### Assets Not Loading

1. **Check base path**: Ensure `vite.config.js` has `base: '/'`
2. **Check asset paths**: All paths should be relative (starting with `./` or `/`)

### Service Worker Errors

The service worker registration is optional and fails gracefully. If you see errors in console, they can be safely ignored unless you've added a service worker file.

## Environment Variables

If you need environment variables:

1. **Via Dashboard**: Go to your project → Settings → Environment variables
2. **Via Wrangler**: Add to `wrangler.toml` under `[build.environment_variables]`

## Continuous Deployment

With Git integration, every push to your main branch will trigger a new deployment. You can also set up:
- **Preview deployments**: Automatic previews for pull requests
- **Branch deployments**: Deploy specific branches
- **Custom build commands**: Override defaults per branch

## Performance

Cloudflare Pages automatically provides:
- Global CDN distribution
- Automatic HTTPS
- DDoS protection
- Fast edge caching

## Support

For issues with:
- **Cloudflare Pages**: Check [Cloudflare Pages docs](https://developers.cloudflare.com/pages/)
- **Wrangler CLI**: Check [Wrangler docs](https://developers.cloudflare.com/workers/wrangler/)
- **Project-specific**: Check the main `README.md`

