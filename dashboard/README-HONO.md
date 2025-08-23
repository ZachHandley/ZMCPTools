# ZMCPTools Dashboard - Hono + Vue SPA

This is the migrated version of the ZMCPTools Dashboard, now using:
- **Hono** - Fast, lightweight web framework for the server
- **Vue 3 SPA** - Client-side single page application
- **Direct WebSocket** - Native WebSocket server (no more zastro-websockets)
- **Vite** - Fast build tool for the Vue app

## 🚀 Quick Start

### Development Mode
```bash
# Install dependencies
npm install

# Run both server and client in development
npm run dev

# Or run them separately:
npm run dev:server  # Hono server on :3000
npm run dev:client  # Vite dev server on :5173
```

### Production Build
```bash
# Build the Vue app
npm run build:client

# Start the production server
npm run start
```

## 🏗️ Architecture

### Server (Hono + WebSocket)
- **Port**: 3000 (configurable via `PORT` env var)
- **WebSocket**: Direct connection on same port as HTTP
- **API Routes**: All `/api/*` routes handled by Hono
- **Static Serving**: Serves built Vue SPA for all other routes

### Client (Vue 3 SPA)
- **Development**: Runs on port 5173 with Vite
- **Production**: Served statically from Hono server
- **WebSocket**: Connects directly to Hono server
- **API**: Proxied to Hono server during development

## 🔧 Configuration

### Environment Variables
```bash
PORT=3000                 # Server port
NODE_ENV=development      # Environment mode
```

### Development Proxy
During development, the Vite dev server proxies:
- `/api/*` → `http://localhost:3000` (API requests)
- WebSocket → `ws://localhost:3000` (WebSocket connection)

## 📁 Project Structure

```
dashboard/
├── server.ts              # Hono server with WebSocket
├── index.html             # Vue SPA entry point
├── package.json           # New dependencies (no Astro)
├── vite.config.ts         # Vite configuration
├── tailwind.config.js     # Tailwind CSS config
├── src/
│   ├── main.ts            # Vue app entry
│   ├── App.vue            # Root Vue component
│   ├── components/        # Existing Vue components (unchanged)
│   │   ├── Dashboard.vue
│   │   ├── AgentsView.vue
│   │   └── ...
│   ├── services/          # API and WebSocket clients (updated)
│   ├── composables/       # Vue composables (updated)
│   └── styles/            # Global CSS
└── dist/                  # Built Vue app (production)
```

## 🔄 Migration from Astro

### What Changed
1. **Server**: Astro → Hono + Native WebSocket
2. **Build**: Astro → Vite (Vue SPA)
3. **WebSocket**: zastro-websockets → Native Node.js WebSocket
4. **Development**: Single Astro dev server → Separate server + client

### What Stayed the Same
- All Vue components are unchanged
- WebSocket event handling logic
- API client interfaces
- Tailwind CSS styling
- Component functionality

### Benefits
- **Smaller Bundle**: No Astro SSR overhead
- **Faster Development**: Vite hot reload + separate processes
- **Simpler Architecture**: Direct WebSocket connection
- **Better Performance**: Hono's optimized routing
- **Standard Setup**: Familiar Vue SPA + API server pattern

## 🐛 Troubleshooting

### WebSocket Connection Issues
1. Check server is running on port 3000
2. Verify WebSocket URL in browser dev tools
3. Check CORS settings in server.ts

### Build Issues
1. Run `npm run build:client` first
2. Check `dist/` folder exists with built files
3. Verify static file serving in server.ts

### Development Issues
1. Both dev:server and dev:client should be running
2. Check proxy configuration in vite.config.ts
3. Verify API endpoints are responding

## 📝 API Endpoints

All existing API endpoints are preserved:
- `GET /api/health` - Server health check
- `GET /api/stats` - Dashboard statistics
- `GET /api/projects` - Project list
- `GET /api/agents` - Agent list
- `GET /api/orchestrations` - Orchestration list
- `GET /api/plans` - Plans list
- `GET /api/rooms` - Room list

## 🔌 WebSocket Events

Supported event types:
- `welcome` - Connection established
- `connection-stats-update` - Connection statistics
- `test_event` - Demo event (every 10s)
- All MCP and agent events (forwarded from main system)

## 🎯 Next Steps

1. **Replace package.json**: Backup current, rename package-new.json
2. **Install dependencies**: `npm install`
3. **Test development**: `npm run dev`
4. **Test production**: `npm run build && npm start`
5. **Remove old files**: Clean up Astro config and dependencies