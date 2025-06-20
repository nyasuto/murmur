const fs = require('fs-extra');
const path = require('path');
const os = require('os');

class Logger {
  constructor() {
    this.logDir = path.join(os.homedir(), '.murmur', 'logs');
    this.logFile = path.join(this.logDir, `murmur-${this.getCurrentDate()}.log`);
    this.maxLogFiles = 7; // Keep logs for 7 days
    this.initialized = false;
  }

  /**
   * Initialize logger
   */
  async initialize() {
    try {
      await fs.ensureDir(this.logDir);
      await this.cleanOldLogs();
      this.initialized = true;
      this.info('Logger initialized', { logFile: this.logFile });
    } catch (error) {
      console.error('Failed to initialize logger:', error);
    }
  }

  /**
   * Get current date in YYYY-MM-DD format
   */
  getCurrentDate() {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Get current timestamp
   */
  getCurrentTimestamp() {
    return new Date().toISOString();
  }

  /**
   * Clean old log files
   */
  async cleanOldLogs() {
    try {
      const files = await fs.readdir(this.logDir);
      const logFiles = files
        .filter(file => file.startsWith('murmur-') && file.endsWith('.log'))
        .map(file => ({
          name: file,
          path: path.join(this.logDir, file),
          date: file.replace('murmur-', '').replace('.log', '')
        }))
        .sort((a, b) => b.date.localeCompare(a.date));

      // Remove old log files beyond maxLogFiles
      if (logFiles.length > this.maxLogFiles) {
        const filesToDelete = logFiles.slice(this.maxLogFiles);
        for (const file of filesToDelete) {
          await fs.remove(file.path);
          console.log(`Removed old log file: ${file.name}`);
        }
      }
    } catch (error) {
      console.error('Failed to clean old logs:', error);
    }
  }

  /**
   * Format log entry
   */
  formatLogEntry(level, message, data = null, error = null) {
    const entry = {
      timestamp: this.getCurrentTimestamp(),
      level: level.toUpperCase(),
      message,
      process: process.type || 'main',
      pid: process.pid
    };

    if (data) {
      entry.data = data;
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack
      };
    }

    return JSON.stringify(entry) + '\n';
  }

  /**
   * Write log entry to file
   */
  async writeLog(level, message, data = null, error = null) {
    if (!this.initialized) {
      console.warn('Logger not initialized, skipping log entry');
      return;
    }

    try {
      const logEntry = this.formatLogEntry(level, message, data, error);
      await fs.appendFile(this.logFile, logEntry);
      
      // Also log to console in development
      if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
        const consoleMessage = `[${level.toUpperCase()}] ${message}`;
        if (error) {
          console.error(consoleMessage, error);
        } else if (data) {
          console.log(consoleMessage, data);
        } else {
          console.log(consoleMessage);
        }
      }
    } catch (err) {
      console.error('Failed to write log entry:', err);
    }
  }

  /**
   * Log info message
   */
  async info(message, data = null) {
    await this.writeLog('info', message, data);
  }

  /**
   * Log warning message
   */
  async warn(message, data = null) {
    await this.writeLog('warn', message, data);
  }

  /**
   * Log error message
   */
  async error(message, error = null, data = null) {
    await this.writeLog('error', message, data, error);
  }

  /**
   * Log debug message
   */
  async debug(message, data = null) {
    if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
      await this.writeLog('debug', message, data);
    }
  }

  /**
   * Log user action
   */
  async action(action, details = null) {
    await this.info(`User action: ${action}`, details);
  }

  /**
   * Log API call
   */
  async apiCall(service, method, duration = null, success = true, error = null) {
    const data = {
      service,
      method,
      duration,
      success
    };

    if (success) {
      await this.info(`API call completed: ${service}.${method}`, data);
    } else {
      await this.error(`API call failed: ${service}.${method}`, error, data);
    }
  }

  /**
   * Get log file path for debugging
   */
  getLogFile() {
    return this.logFile;
  }

  /**
   * Get recent log entries
   */
  async getRecentLogs(lines = 100) {
    try {
      if (!(await fs.pathExists(this.logFile))) {
        return [];
      }

      const content = await fs.readFile(this.logFile, 'utf8');
      const logLines = content.trim().split('\n');
      const recentLines = logLines.slice(-lines);
      
      return recentLines.map(line => {
        try {
          return JSON.parse(line);
        } catch (error) {
          return { raw: line };
        }
      });
    } catch (error) {
      console.error('Failed to read log file:', error);
      return [];
    }
  }
}

// Create singleton instance
const logger = new Logger();

module.exports = logger;