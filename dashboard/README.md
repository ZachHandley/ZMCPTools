# ZMCPTools Dashboard

Real-time web dashboard for monitoring and controlling ZMCPTools agent orchestrations.

## Features

- **Real-time Monitoring**: Live updates via WebSocket connection
- **Project Overview**: Track active MCP server projects
- **Agent Management**: Monitor agent status, terminate agents, view details
- **Orchestration Tracking**: Real-time progress of multi-agent orchestrations
- **Communication Rooms**: View agent coordination and messaging
- **Event Stream**: Live feed of system events with filtering

## Usage

Start the dashboard from the CLI:

```bash
# Start with default settings
zmcp-tools dashboard

# Custom configuration
zmcp-tools dashboard --port 4270 --ws-port 4271 --host 0.0.0.0
```

The dashboard will be available at `http://localhost:4270` by default.

## Architecture

- **Frontend**: Astro + Vue 3 with TypeScript
- **Styling**: Tailwind CSS with custom component design
- **Real-time**: WebSocket connection to EventBus
- **API**: Express.js REST API for data retrieval
- **Build**: Static site generation for easy deployment

## Development

```bash
# Install dependencies
cd dashboard && npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Components

- **ProjectsView**: Active MCP servers and session information
- **AgentsView**: Agent monitoring with status filtering
- **OrchestrationView**: Multi-agent orchestration progress
- **RoomsView**: Communication room activity and messaging
- **RealTimeView**: Live event stream with categorization

## API Endpoints

- `GET /api/stats` - System statistics
- `GET /api/projects` - Active projects
- `GET /api/agents` - Agent list with filtering
- `GET /api/orchestrations` - Orchestration status
- `GET /api/rooms` - Communication rooms
- `GET /api/tasks` - Task management

## WebSocket Events

Real-time events include:
- Agent status changes
- Task updates
- Room messages
- Orchestration progress
- System notifications