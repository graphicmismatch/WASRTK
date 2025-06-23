# Development Setup

## Overview

This guide covers setting up a development environment for WASRTK. WASRTK is built with Electron and uses modern web technologies for the frontend.

## Prerequisites

### Required Software
- **Node.js**: Version 16.0.0 or higher
- **npm**: Comes with Node.js (version 6 or higher)
- **Git**: For version control

### System Requirements
- **Operating System**: Windows 10+, macOS 10.14+, or Linux
- **RAM**: Minimum 4GB, recommended 8GB+
- **Storage**: At least 1GB free space

## Installation Steps

### 1. Install Node.js
Download and install Node.js from [nodejs.org](https://nodejs.org/):

```bash
# Verify installation
node --version
npm --version
```

### 2. Clone the Repository
```bash
# Clone the repository
git clone https://github.com/your-username/WASRTK.git

# Navigate to project directory
cd WASRTK
```

### 3. Install Dependencies
```bash
# Install Node.js dependencies
npm install
```

### 4. Verify Setup
```bash
# Run the application in development mode
npm start
```

## Development Environment Configuration

### VS Code Setup

#### Recommended Extensions
```json
{
    "recommendations": [
        "ms-vscode.vscode-typescript-next",
        "esbenp.prettier-vscode",
        "ms-vscode.vscode-eslint",
        "ms-vscode.vscode-javascript-debug"
    ]
}
```

#### Workspace Settings
Create `.vscode/settings.json`:
```json
{
    "editor.formatOnSave": true,
    "editor.tabSize": 2,
    "editor.insertSpaces": true,
    "files.trimTrailingWhitespace": true,
    "files.insertFinalNewline": true
}
```

## Project Structure

### Directory Layout
```
WASRTK/
├── assets/                 # Application assets
├── docs/                  # Documentation
├── samples/              # Sample projects
├── main.js              # Electron main process
├── renderer.js          # Frontend application logic
├── index.html           # Main HTML file
├── styles.css           # Application styles
└── package.json         # Project dependencies
```

## Development Workflow

### Running the Application
```bash
# Development mode (with DevTools)
npm run dev

# Production mode
npm start

# Build for distribution
npm run build
```

### Common Commands
```bash
# Install dependencies
npm install

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format

# Build application
npm run build
```

## Troubleshooting

### Common Issues
1. **Node.js version**: Ensure you're using Node.js 16.0.0 or higher
2. **Dependencies**: Run `npm install` if you encounter module errors
3. **Permissions**: Check file permissions on your system

### Getting Help
- Check the [Contributing Guidelines](./contributing.md)
- Review the [Architecture Overview](../architecture/overview.md)
- Examine the [Implementation Details](../implementation/)

This setup guide provides everything needed to start developing with WASRTK.