# CofoundEngine — AI Co-founder OS

<div align="center">
  <img width="120" height="120" alt="CofoundEngine Logo" src="public/logo.png" />
  <p><strong>Your AI Co-founder, working while you sleep.</strong></p>
</div>

---

## 🎨 How to Add Your Own Logo

You can add your logo to this project in 3 simple ways:

### Method 1: Using the Interactive In-App Logo Customizer (Recommended)
1. Launch the app (`npm run dev`).
2. Click the **"Add Logo"** or **"Customize Logo"** button in the header or sidebar (or press `⌘K` / `Ctrl+K` and search *"Customize Brand Logo"*).
3. Upload any logo file (`.png`, `.svg`, `.jpeg`, `.webp`) directly from your computer or paste an image URL.
4. Customize your brand name, tagline, glow color, and container shape!
5. Your custom logo is automatically saved to local storage and rendered everywhere across the application.

### Method 2: Replacing the Static Logo File
Place your logo image file in the project directory as:
- `public/logo.png` (or `src/assets/logo.png`)

### Method 3: Modifying Code Props directly
You can specify custom logo properties directly in `src/components/BrandLogo.tsx` or where `BrandLogo` is used:

```tsx
<BrandLogo
  logoUrl="/your-logo.png"
  brandName="MyStartup"
  brandHighlight="AI"
  subtitle="Empowering your workspace"
  size="md"
  showText={true}
/>
```

---

## 🚀 Running Locally

**Prerequisites:** Node.js (v18+)

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set your API key:**
   Add `GEMINI_API_KEY` in `.env.local` or `.env`.

3. **Start the development server:**
   ```bash
   npm run dev
   ```
