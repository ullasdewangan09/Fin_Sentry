# FinSentry Frontend - Financial Risk Detection UI

Modern, responsive web interface for the INNOVAT3 financial risk detection platform. Built with React, TypeScript, and Vite for optimal performance.

## 🚀 Quick Start

### Prerequisites

- **Node.js** 16+ ([Install with nvm](https://github.com/nvm-sh/nvm))
- **npm** 7+ or **yarn** 1.22+
- Backend server running on `http://localhost:8000`

### Installation & Setup

```bash
# Clone repository (if not already done)
git clone https://github.com/yourusername/INNOVAT3.git
cd INNOVAT3/frontend/fintwin-command-main

# Install dependencies
npm install

# Configure backend URL (optional, defaults to http://localhost:8000)
echo "VITE_API_BASE_URL=http://localhost:8000" > .env.local

# Start development server
npm run dev
```

The application will be available at **`http://localhost:5173`**

## 📋 Configuration

### Environment Variables

Create `.env.local` file to override defaults:

```env
# Backend API endpoint (default: http://localhost:8000)
VITE_API_BASE_URL=http://localhost:8000

# Optional: API timeout in milliseconds
VITE_API_TIMEOUT=30000

# Optional: Enable debug logging
VITE_DEBUG=false
```

## 🏗️ Project Structure

```
src/
├── components/              # Reusable UI components
│   ├── AppLayout.tsx       # Main layout wrapper
│   ├── NavLink.tsx         # Navigation links
│   ├── ProtectedRoute.tsx  # Route protection HOC
│   ├── ScanLoader.tsx      # Loading animation
│   ├── SideRail.tsx        # Sidebar navigation
│   ├── SystemHealthBar.tsx # Health indicator
│   ├── blocks/             # Complex component blocks
│   └── ui/                 # Atomic UI components
├── pages/                  # Page-level components
│   ├── LoginPage.tsx       # Authentication page
│   ├── DashboardPage.tsx   # Main dashboard
│   ├── CasesPage.tsx       # Case management
│   ├── CompliancePage.tsx  # Compliance monitoring
│   └── ...                 # Additional pages
├── hooks/                  # Custom React hooks
│   ├── use-mobile.tsx      # Mobile detection
│   └── use-toast.ts        # Toast notifications
├── lib/                    # Utilities and helpers
│   ├── api.ts              # API client configuration
│   ├── formatting.ts       # Data formatting utilities
│   ├── utils.ts            # Generic utilities
│   └── auditReportPDF.ts   # PDF generation
├── store/                  # State management
├── test/                   # Test files
├── App.tsx                 # Root component
├── main.tsx                # Entry point
├── App.css                 # Global styles
├── index.css               # Reset styles
└── vite-env.d.ts           # Vite type definitions
```

## 🎨 Technologies

- **React 18** - UI framework with hooks
- **TypeScript** - Type safety
- **Vite** - Ultra-fast build tool
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - High-quality accessible components
- **React Router** - Client-side routing
- **Playwright** - End-to-end testing
- **Vitest** - Unit testing framework

## 📱 Features

### Pages & Views

**Dashboard**
- System health metrics overview
- Risk summary and statistics
- Key performance indicators
- Recent activity timeline

**Cases**
- Investigation case management
- Case creation and filtering
- Risk findings per case
- Case status tracking
- Export investigation reports

**Compliance**
- Compliance status monitoring
- Policy adherence tracking
- Audit trail visualization
- Regulatory requirement mapping

**Authentication**
- JWT-based login
- Role-based access control
- Session management
- Automatic logout on timeout

### UI Components

- Responsive layouts
- Dark mode support (if implemented)
- Accessible inputs and forms
- Loading states and animations
- Toast notifications
- Modal dialogs
- Data tables with sorting/filtering

## 🔧 Development

### Available Scripts

```bash
# Start development server with hot reload
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview

# Run unit tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run end-to-end tests
npm run test:e2e

# Lint code with ESLint
npm run lint

# Format code with Prettier (if configured)
npm run format
```

### Development Workflow

1. **Start backend**
   ```bash
   cd ../../
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   uvicorn app.main:app --reload
   ```

2. **Start frontend** (in separate terminal)
   ```bash
   npm run dev
   ```

3. **Make changes** - Hot reload enabled automatically

4. **Test changes** - Run tests as needed

5. **Build for deployment**
   ```bash
   npm run build
   ```

## 🧪 Testing

### Unit Tests

Run with Vitest:
```bash
npm run test
npm run test:watch
npm run test:ui  # Interactive UI
```

Test files: `**/*.test.ts` and `**/*.test.tsx`

### End-to-End Tests

Run with Playwright:
```bash
npm run test:e2e
npm run test:e2e:ui  # Interactive UI
npx playwright codegen http://localhost:5173  # Record tests
```

Test files: `playwright-fixture.ts`, `**/*.playwright.ts`

### Code Coverage

```bash
npm run test:coverage
```

## 🚢 Deployment

### Build for Production

```bash
npm run build
```

This creates optimized production build in `dist/` directory.

### Deployment Options

#### **Option 1: Static Hosting (Recommended)**

```bash
npm run build
# Deploy dist/ to:
# - Vercel
# - Netlify
# - GitHub Pages
# - AWS S3 + CloudFront
# - Any static file hosting
```

#### **Option 2: Docker**

```dockerfile
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["serve", "-s", "dist"]
```

#### **Option 3: Node.js Server**

```bash
npm run build
npm install -g serve
serve -s dist -l 3000
```

### Environment Configuration for Production

```env
# .env.production or set at deployment:
VITE_API_BASE_URL=https://api.yourdomain.com
VITE_API_TIMEOUT=30000
```

## 🔐 API Integration

### Authentication Flow

1. **Login** - POST `/auth/token` with credentials
2. **Store JWT** - Save token in secure storage
3. **API Calls** - Include `Authorization: Bearer <token>` header
4. **Token Refresh** - Implement refresh token flow
5. **Logout** - Clear stored token and redirect to login

### API Client

The API client is configured in `lib/api.ts`:

```typescript
import { apiClient } from './lib/api';

// Automatic JWT header injection
const response = await apiClient.get('/investigation');

// Response type safety with TypeScript
const cases: Case[] = await apiClient.get('/cases');
```

### Error Handling

```typescript
try {
  const data = await apiClient.post('/build-graph', payload);
} catch (error) {
  if (error.status === 401) {
    // Handle unauthorized
  } else if (error.status === 400) {
    // Handle bad request
  }
}
```

## 🎯 Best Practices

### Performance
- ✅ Code splitting with React.lazy()
- ✅ Image optimization
- ✅ Bundle analysis: `npm run build -- --analyze`
- ✅ Lazy loading routes
- ✅ Debouncing API calls

### Accessibility
- ✅ Semantic HTML
- ✅ ARIA labels and roles
- ✅ Keyboard navigation
- ✅ Color contrast compliance
- ✅ Focus management

### Code Quality
- ✅ TypeScript strict mode
- ✅ ESLint configuration
- ✅ Component composition
- ✅ Custom hooks for logic
- ✅ Consistent naming conventions

### Security
- ✅ XSS prevention (React escaping)
- ✅ CSRF tokens for state-changing operations
- ✅ Secure JWT storage
- ✅ Environment variable handling
- ✅ Content Security Policy headers

## 🐛 Troubleshooting

### "Backend not responding"
- Check backend is running: `http://localhost:8000/docs`
- Verify `VITE_API_BASE_URL` in `.env.local`
- Check browser console for CORS errors

### "Module not found" errors
```bash
# Clear node_modules and reinstall
rm -r node_modules package-lock.json
npm install
```

### "Port 5173 already in use"
```bash
# Use different port
npm run dev -- --port 3000
```

### "Build fails"
```bash
# Clear cache and rebuild
rm -r dist node_modules
npm install
npm run build
```

### "TypeScript errors"
```bash
# Ensure types are installed
npm install --save-dev @types/react @types/react-dom
```

## 📚 Additional Resources

- [React Documentation](https://react.dev)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Vite Documentation](https://vitejs.dev/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [shadcn/ui Components](https://ui.shadcn.com/)
- [React Router Documentation](https://reactrouter.com/)

## 📝 Contributing

When contributing to the frontend:

1. Create a feature branch: `git checkout -b feature/component-name`
2. Make changes and test locally
3. Run linter: `npm run lint`
4. Build for production: `npm run build`
5. Commit with clear messages
6. Push and create pull request

## 📄 License

This project is proprietary and confidential.

## 🤝 Support

For issues or questions:
1. Check the troubleshooting section above
2. Review browser console for errors
3. Verify backend API is running
4. Check network requests in developer tools
5. Contact project maintainers

---

**Version:** 0.2.0
**Last Updated:** March 2026
**Maintainer:** INNOVAT3 Team
