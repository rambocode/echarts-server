# Product Overview

Apache ECharts HTTP Export Server is a Node.js service that renders Apache ECharts charts to images (PNG, JPG, SVG, PDF) and Base64 formats. 

The server accepts JSON-formatted chart options via HTTP requests and uses node canvas for server-side rendering. It's designed for integration with Java applications and other systems that need programmatic chart generation.

Key features:
- HTTP API for chart rendering
- Multiple output formats (PNG, JPEG, SVG, PDF, Base64)
- CORS enabled for cross-origin requests
- PM2 process management support
- Command-line interface option