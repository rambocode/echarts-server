# Project Structure

## Directory Layout
```
echarts-export-server/
├── src/
│   └── index.js          # Main server application
├── test/
│   └── demo_json.json    # Sample request payload for testing
├── node_modules/         # Dependencies (generated)
├── package.json          # Project configuration and scripts
├── package-lock.json     # Dependency lock file
└── README.md            # Documentation
```

## Code Organization

### Main Application (`src/index.js`)
- Single-file HTTP server implementation
- Request parsing for both GET and POST methods
- Chart rendering using ECharts and canvas
- Error handling and response formatting
- CORS configuration

### Configuration Structure
The server expects JSON configuration with these properties:
- `type`: Output format (png, jpeg, svg, pdf)
- `width`/`height`: Canvas dimensions (default: 600x400)
- `base64`: Boolean for Base64 output
- `download`: Boolean for attachment headers
- `option`: ECharts configuration object

### Test Data (`test/demo_json.json`)
Contains sample request payload demonstrating proper configuration format for line charts.

## Conventions
- Single entry point architecture
- Synchronous request processing
- JSON-based configuration
- Standard HTTP status codes and error responses
- PM2 process naming: `echarts-export-server`