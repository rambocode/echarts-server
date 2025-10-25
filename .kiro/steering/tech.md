# Technology Stack

## Core Dependencies
- **Node.js**: Runtime environment (minimum version 12.0.0)
- **Apache ECharts**: Chart rendering library (v5.3.3)
- **node-canvas**: Server-side canvas implementation for image generation (v2.7.0)
- **PM2**: Process manager for production deployment (v5.2.0)

## Development Tools
- **nodemon**: Development server with auto-restart (v1.18.4)

## Common Commands

### Development
```bash
npm run dev          # Start development server with auto-restart
npm run foreground   # Run server in foreground (logs to stdout)
```

### Production
```bash
npm start           # Start as PM2 daemon
npm stop            # Stop PM2 process
npm run status      # Check PM2 process status
npm run logs        # View PM2 logs
npm run show        # Show detailed PM2 process info
npm run delete      # Delete PM2 process
```

### Installation Notes
- Canvas dependency may require special installation on some systems
- Use `--canvas_binary_host_mirror=https://registry.npmmirror.com/-/binary/canvas/` for faster downloads in China
- System fonts required for proper text rendering (see README for OS-specific font installation)

## Server Configuration
- Default port: 3000
- Supports both GET and POST requests
- CORS enabled by default
- Accepts JSON and URL-encoded requests